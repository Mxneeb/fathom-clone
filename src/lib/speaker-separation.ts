import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { decodeForSpeakerSeparation } from "@/lib/audio";
import { suggestSpeakerNames } from "@/lib/ai";
import { writeChapters } from "@/lib/chapters";

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
// Separation runs at ~8x real time here, inside a 5-minute function run, so
// longer recordings keep a single speaker, renamable from the timeline.
export const MAX_SEPARATION_SEC = 30 * 60;

// A failure the meeting page can show as is. Anything else is logged and
// replaced with a generic message: raw errors (ffmpeg output, command lines)
// mean nothing to the person reading them.
class SeparationError extends Error {}

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
    await decodeForSpeakerSeparation(mediaUrl, pcmPath).catch((err) => {
      console.error("decoding for speaker separation failed", err);
      throw new SeparationError(
        /ENOSPC|No space left|code 228/.test(String(err))
          ? "This recording is too large to process on this server."
          : "Couldn't read the audio in this recording."
      );
    });
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
      throw new SeparationError(
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
// run it twice. Returns false if it's done, already running, or the
// recording is too long to separate.
async function claim(meetingId: string) {
  const { count } = await prisma.meeting.updateMany({
    where: {
      id: meetingId,
      source: "UPLOAD",
      durationSec: { lte: MAX_SEPARATION_SEC },
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

  // Topics for the timeline come from the model and don't depend on who's
  // speaking, so they're written alongside (network vs. CPU, near-free).
  const chaptersDone = prisma.chapter
    .count({ where: { meetingId } })
    .then((n) => (n === 0 ? writeChapters(meetingId) : null))
    .catch((err) => console.error("writeChapters failed", err));

  try {
    const meeting = await prisma.meeting.findUniqueOrThrow({
      where: { id: meetingId },
      select: { mediaUrl: true, transcriptLines: { orderBy: { order: "asc" }, select: { id: true, startMs: true, endMs: true, text: true } } },
    });
    const lines = meeting.transcriptLines;
    if (lines.length === 0) throw new SeparationError("This recording has no transcript to split.");

    const segments = await diarize(meeting.mediaUrl);
    if (segments.length === 0) throw new SeparationError("No speech was detected in the recording.");

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

    // Before DONE, so the page's refresh brings topics and speakers together.
    await chaptersDone;

    // One write per speaker, with room over the 5s default: a meeting with
    // many speakers is a dozen round trips, and slower networks exceed it.
    await prisma.$transaction(
      async (tx) => {
        await tx.transcriptLine.updateMany({ where: { meetingId }, data: { participantId: null } });
        await tx.participant.deleteMany({ where: { meetingId } });
        await tx.participant.createMany({ data: participants });
        for (const label of labels) {
          const p = participantByLabel.get(label)!;
          await tx.transcriptLine.updateMany({
            where: { id: { in: lines.filter((l) => labelByLine.get(l.id) === label).map((l) => l.id) } },
            data: { speakerName: p.name, participantId: p.id },
          });
        }
        await tx.meeting.update({ where: { id: meetingId }, data: { speakerStatus: "DONE", speakerError: null } });
      },
      { timeout: 30_000 }
    );
  } catch (err) {
    console.error("separateSpeakers failed", err);
    await chaptersDone;
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        speakerStatus: "FAILED",
        speakerError: err instanceof SeparationError ? err.message : "Speaker separation failed on this recording.",
      },
    });
  }
}
