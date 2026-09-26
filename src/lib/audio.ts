import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

// Groq's Whisper API caps uploaded files at 25MB. Real meeting recordings
// (raw, from a browser MediaRecorder or a phone) routinely exceed that —
// so every upload gets transcoded server-side to a mono, speech-optimized
// low-bitrate mp3 before we ever send bytes to Groq. At 24kbps mono this
// is ~10.8MB/hour, comfortably covering multi-hour recordings; it also
// downsamples to 16kHz, which is Whisper's native rate anyway (no
// transcription-quality loss, since Whisper resamples internally regardless).
const TARGET_BITRATE_KBPS = 24;
const TARGET_SAMPLE_RATE_HZ = 16000;

export async function compressAudioForTranscription(
  sourceUrl: string
): Promise<{ buffer: Buffer; filename: string }> {
  const dir = await mkdtemp(join(tmpdir(), "fathom-clone-transcode-"));
  const inputPath = join(dir, `input-${randomUUID()}`);
  const outputPath = join(dir, `output-${randomUUID()}.mp3`);

  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      throw new Error(`Failed to download source audio (${res.status})`);
    }
    const inputBuffer = Buffer.from(await res.arrayBuffer());
    await writeFile(inputPath, inputBuffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioChannels(1)
        .audioFrequency(TARGET_SAMPLE_RATE_HZ)
        .audioBitrate(`${TARGET_BITRATE_KBPS}k`)
        .audioCodec("libmp3lame")
        .format("mp3")
        .on("error", reject)
        .on("end", () => resolve())
        .save(outputPath);
    });

    const buffer = await readFile(outputPath);
    return { buffer, filename: "recording.mp3" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Streams a remote file to disk. Recordings run to hundreds of megabytes,
// too much to hold in memory on the way.
export async function downloadToFile(url: string, path: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download source audio (${res.status})`);
  await pipeline(Readable.fromWeb(res.body as ReadableStream<Uint8Array>), createWriteStream(path));
}

// Cuts a recording into pieces of at most `pieceSec` seconds for separating
// speakers one function run per piece: 16kHz mono Opus at 64kbps, which
// measured as accurate as the raw audio (scripts/eval-long-meeting.mjs).
// Constrained VBR holds the rate near 64kbps (plain VBR ran ~12% over), so
// a 7-minute piece is ~3.4MB, safely under Vercel's 4.5MB request body
// limit. Returns the pieces in order, each with where it starts.
export async function splitForSpeakerSeparation(inputPath: string, dir: string, pieceSec: number) {
  const listPath = join(dir, "pieces.csv");
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(TARGET_SAMPLE_RATE_HZ)
      .audioCodec("libopus")
      .audioBitrate("64k")
      .outputOptions([
        "-vbr", "constrained",
        "-f", "segment",
        "-segment_time", String(pieceSec),
        "-reset_timestamps", "1",
        "-segment_list", listPath,
        "-segment_list_type", "csv",
      ])
      .on("error", reject)
      .on("end", () => resolve())
      .save(join(dir, "piece-%03d.ogg"));
  });
  // One "name,start,end" row per piece.
  const rows = (await readFile(listPath, "utf8")).trim().split(/\r?\n/);
  return rows.map((row) => {
    const [name, start] = row.split(",");
    return { path: join(dir, basename(name)), offsetSec: Number(start) };
  });
}

// Writes raw 16kHz mono float samples (the input speaker separation needs)
// to `outputPath`.
export async function decodeForSpeakerSeparation(inputPath: string, outputPath: string) {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(TARGET_SAMPLE_RATE_HZ)
      .format("f32le")
      .on("error", reject)
      .on("end", () => resolve())
      .save(outputPath);
  });
}
