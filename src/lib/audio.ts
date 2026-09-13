import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
