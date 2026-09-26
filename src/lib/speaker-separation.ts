import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { decodeForSpeakerSeparation } from "@/lib/audio";
import { suggestSpeakerNames } from "@/lib/ai";

// Whisper transcribes words but can't tell voices apart, so an upload starts
// as a single "Speaker". This runs afterwards, in the background: open-source
// speaker diarization (sherpa-onnx: pyannote segmentation + ERes2Net voice
// embeddings, all on CPU, no external service) finds who spoke when, each
// transcript line goes to the speaker it overlaps most, and the model then
// suggests real names where the conversation makes them clear.
//
// Settings chosen with scripts/eval-diarization.mjs against the sample
// meetings (86% of lines attributed correctly). See models/diarization.

const execFileAsync = promisify(execFile);
const MODELS = join(process.cwd(), "models", "diarization");
const WORKER = join(process.cwd(), "src", "lib", "speaker-separation-worker.mjs");
// A run that hasn't finished after this long was cut off (function timeout)
// and may be claimed again.
export const STALE_AFTER_MS = 6 * 60 * 1000;

type Segment = { start: number; end: number; speaker: number };

function diarizationConfig() {
  const numThreads = Math.min(Math.max(cpus().length, 1), 4);
  return {
    segmentation: {
      pyannote: { model: join(MODELS, "pyannote-segmentation-3.0.int8.onnx"), windowShiftRatio: 0.5 },
      numThreads,
    },
    embedding: { model: join(MODELS, "3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx"), numThreads },
    clustering: { numClusters: -1, threshold: 0.7 },
    minDurationOn: 0.2,
    minDurationOff: 0.5,
  };
}

async function diarize(mediaUrl: string): Promise<Segment[]> {
  const dir = await mkdtemp(join(tmpdir(), "cue-speakers-"));
  try {
    const pcmPath = join(dir, `${randomUUID()}.f32`);
    await decodeForSpeakerSeparation(mediaUrl, pcmPath);
    try {
      const { stdout } = await execFileAsync(process.execPath, [WORKER, pcmPath, JSON.stringify(diarizationConfig())], {
        maxBuffer: 64 * 1024 * 1024,
        timeout: 4 * 60 * 1000,
      });
      return JSON.parse(stdout) as Segment[];
    } catch (err) {
      // The raw error carries the whole command line; users get a reason.
      console.error("speaker separation worker failed", err);
      const timedOut = (err as { killed?: boolean }).killed;
      throw new Error(
        timedOut
          ? "The recording is too long to separate speakers within the server's time limit."
          : "Speaker separation crashed while processing this recording."
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Each line goes to the speaker it overlaps most; a line in a gap between
// segments goes to the nearest one.
function speakerForLine(line: { startMs: number; endMs: number }, segments: Segment[]) {
  const s = line.startMs / 1000;
  const e = line.endMs / 1000;
  const overlap = new Map<number, number>();
  for (const seg of segments) {
    const o = Math.min(e, seg.end) - Math.max(s, seg.start);
    if (o > 0) overlap.set(seg.speaker, (overlap.get(seg.speaker) ?? 0) + o);
  }
  const best = [...overlap.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  const distance = (seg: Segment) => Math.max(seg.start - e, s - seg.end, 0);
  return segments.reduce((a, b) => (distance(b) < distance(a) ? b : a)).speaker;
}

// Atomically take the job, so a second trigger (another tab, a retry) can't
// run it twice. Returns false if it's done or already running.
async function claim(meetingId: string) {
  const { count } = await prisma.meeting.updateMany({
    where: {
      id: meetingId,
      source: "UPLOAD",
      OR: [
        { speakerStatus: { in: ["PENDING", "FAILED"] } },
        { speakerStatus: "PROCESSING", speakerStartedAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
      ],
    },
    data: { speakerStatus: "PROCESSING", speakerStartedAt: new Date(), speakerError: null },
  });
  return count === 1;
}

export async function separateSpeakers(meetingId: string) {
  if (!(await claim(meetingId))) return;

  try {
    const meeting = await prisma.meeting.findUniqueOrThrow({
      where: { id: meetingId },
      select: { mediaUrl: true, transcriptLines: { orderBy: { order: "asc" }, select: { id: true, startMs: true, endMs: true, text: true } } },
    });
    const lines = meeting.transcriptLines;
    if (lines.length === 0) throw new Error("This recording has no transcript to split.");

    const segments = await diarize(meeting.mediaUrl);
    if (segments.length === 0) throw new Error("No speech was detected in the recording.");

    // "Speaker 1" is whoever speaks first.
    const labelBySpeaker = new Map<number, string>();
    const labelByLine = new Map<string, string>();
    for (const line of lines) {
      const speaker = speakerForLine(line, segments);
      if (!labelBySpeaker.has(speaker)) labelBySpeaker.set(speaker, `Speaker ${labelBySpeaker.size + 1}`);
      labelByLine.set(line.id, labelBySpeaker.get(speaker)!);
    }
    const labels = [...labelBySpeaker.values()];

    // Names are a bonus: if the model call fails, keep the labels.
    let names: Record<string, string> = {};
    if (labels.length > 1) {
      names = await suggestSpeakerNames(
        lines.map((l) => ({ speakerName: labelByLine.get(l.id)!, text: l.text })),
        labels
      ).catch((err) => {
        console.error("suggestSpeakerNames failed", err);
        return {};
      });
    }

    const participants = labels.map((label, i) => ({
      id: randomUUID(),
      meetingId,
      name: names[label] ?? label,
      isHost: i === 0,
    }));
    const participantByLabel = new Map(labels.map((label, i) => [label, participants[i]]));

    await prisma.$transaction([
      prisma.transcriptLine.updateMany({ where: { meetingId }, data: { participantId: null } }),
      prisma.participant.deleteMany({ where: { meetingId } }),
      prisma.participant.createMany({ data: participants }),
      ...labels.map((label) => {
        const p = participantByLabel.get(label)!;
        return prisma.transcriptLine.updateMany({
          where: { id: { in: lines.filter((l) => labelByLine.get(l.id) === label).map((l) => l.id) } },
          data: { speakerName: p.name, participantId: p.id },
        });
      }),
      prisma.meeting.update({ where: { id: meetingId }, data: { speakerStatus: "DONE", speakerError: null } }),
    ]);
  } catch (err) {
    console.error("separateSpeakers failed", err);
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        speakerStatus: "FAILED",
        speakerError: err instanceof Error ? err.message.slice(0, 300) : "Speaker separation failed.",
      },
    });
  }
}
