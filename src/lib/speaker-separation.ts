import { execFile } from "node:child_process";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { decodeForSpeakerSeparation, downloadToFile, splitForSpeakerSeparation } from "@/lib/audio";
import { suggestSpeakerNames } from "@/lib/ai";
import { writeChapters } from "@/lib/chapters";
import { linkPieces } from "@/lib/speaker-refine.mjs";

// Whisper transcribes words but can't tell voices apart, so an upload starts
// as a single "Speaker". This runs afterwards, in the background: open-source
// speaker diarization (sherpa-onnx: pyannote segmentation + ERes2Net voice
// embeddings, all on CPU, no external service) finds who spoke when, each
// transcript line goes to the speaker it overlaps most, and the model then
// suggests real names where the conversation makes them clear.
//
// Separation runs at ~8x real time here and a function run is capped at 5
// minutes, so a long recording is cut into pieces that are separated in
// parallel runs (the piece endpoint) and then joined by voice (linkPieces).
//
// Settings chosen with scripts/eval-diarization.mjs against the sample
// meetings (86% of lines attributed correctly), pieces with
// scripts/eval-long-meeting.mjs. See models/diarization.

const execFileAsync = promisify(execFile);
const MODELS = join(process.cwd(), "models", "diarization");
const WORKER = join(process.cwd(), "src", "lib", "speaker-separation-worker.mjs");
// A run that hasn't finished after this long was cut off (function timeout)
// and may be claimed again.
export const STALE_AFTER_MS = 6 * 60 * 1000;
// The longest piece: about a minute of CPU, and at 64kbps ~3.4MB, under the
// 4.5MB request body limit. A recording up to this long is one piece,
// separated in the job's own run.
const PIECE_SEC = 7 * 60;

type Segment = { start: number; end: number; speaker: number };
export type PieceResult = { segments: Segment[]; voices: { emb: number[]; dur: number }[] };

// A failure the meeting page can show as is. Anything else is logged and
// replaced with a generic message: raw errors (ffmpeg output, command lines)
// mean nothing to the person reading them.
class SeparationError extends Error {}

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

// Separates one audio file in this run, in a worker process.
export async function separateFile(inputPath: string): Promise<PieceResult> {
  const pcmPath = `${inputPath}.f32`;
  try {
    await decodeForSpeakerSeparation(inputPath, pcmPath).catch((err) => {
      console.error("decoding for speaker separation failed", err);
      throw new SeparationError("Couldn't read the audio in this recording.");
    });
    try {
      const { stdout } = await execFileAsync(process.execPath, [WORKER, pcmPath, JSON.stringify(diarizationConfig())], {
        maxBuffer: 64 * 1024 * 1024,
        timeout: 4 * 60 * 1000,
      });
      return JSON.parse(stdout) as PieceResult;
    } catch (err) {
      console.error("speaker separation worker failed", err);
      const timedOut = (err as { killed?: boolean }).killed;
      throw new SeparationError(
        timedOut
          ? "Separating speakers took longer than the server allows."
          : "Speaker separation crashed while processing this recording."
      );
    }
  } finally {
    await rm(pcmPath, { force: true }).catch(() => {});
  }
}

// Proves a piece request came from a separation job in this app: the piece
// endpoint is reachable from outside, and separating audio is expensive.
export function pieceToken(meetingId: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`speaker-piece:${meetingId}`).digest("hex");
}

export function isPieceToken(meetingId: string, token: string | null) {
  const expected = Buffer.from(pieceToken(meetingId));
  const given = Buffer.from(token ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// One piece, separated in a run of its own. Retried once, since one failed
// piece fails the whole recording.
async function separateRemotely(origin: string, meetingId: string, piece: { path: string; offsetSec: number }) {
  const body = await readFile(piece.path);
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${origin}/api/meetings/${meetingId}/speakers/piece`, {
        method: "POST",
        headers: { "Content-Type": "audio/ogg", "X-Cue-Piece": pieceToken(meetingId) },
        body,
      });
      if (!res.ok) throw new Error(`piece at ${piece.offsetSec}s: ${res.status} ${(await res.text()).slice(0, 300)}`);
      return { offset: piece.offsetSec, ...((await res.json()) as PieceResult) };
    } catch (err) {
      console.error(`speaker separation piece failed (attempt ${attempt})`, err);
      if (attempt === 2) throw new SeparationError("Part of the recording couldn't be processed.");
    }
  }
}

async function findSpeakers(meeting: { id: string; mediaUrl: string; durationSec: number }, origin: string) {
  const dir = await mkdtemp(join(tmpdir(), "cue-speakers-"));
  const t0 = Date.now();
  const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  try {
    const source = join(dir, "source");
    await downloadToFile(meeting.mediaUrl, source).catch((err) => {
      console.error("downloading for speaker separation failed", err);
      throw new SeparationError(
        (err as { code?: string }).code === "ENOSPC"
          ? "This recording is too large to process on this server."
          : "Couldn't download the recording."
      );
    });
    // Equal pieces. The slack keeps a recording that runs a little past its
    // last transcribed line from spilling into a sliver of an extra piece.
    const count = Math.max(1, Math.ceil(meeting.durationSec / PIECE_SEC));
    const pieceSec = Math.min(PIECE_SEC, Math.ceil(meeting.durationSec / count) + 30);
    const pieces = await splitForSpeakerSeparation(source, dir, pieceSec).catch((err) => {
      console.error("splitting for speaker separation failed", err);
      throw new SeparationError(
        /No space left|code 228/.test(String(err))
          ? "This recording is too large to process on this server."
          : "Couldn't read the audio in this recording."
      );
    });
    await rm(source, { force: true });
    console.log(`speakers ${meeting.id}: ${pieces.length} piece(s) of up to ${pieceSec}s ready at ${since()}`);

    if (pieces.length === 1) return (await separateFile(pieces[0].path)).segments;
    const results = await Promise.all(pieces.map((p) => separateRemotely(origin, meeting.id, p)));
    console.log(`speakers ${meeting.id}: pieces separated at ${since()}`);
    return linkPieces(results);
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

// `origin` is this app's own address, where pieces of a long recording are
// sent to be separated in parallel.
export async function separateSpeakers(meetingId: string, origin: string) {
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
      select: {
        id: true,
        mediaUrl: true,
        durationSec: true,
        transcriptLines: { orderBy: { order: "asc" }, select: { id: true, startMs: true, endMs: true, text: true } },
      },
    });
    const lines = meeting.transcriptLines;
    if (lines.length === 0) throw new SeparationError("This recording has no transcript to split.");

    const segments = await findSpeakers(meeting, origin);
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
