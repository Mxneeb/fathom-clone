// Re-encodes each synthesized seed WAV (scripts/synthesize-seed-audio.ps1) as
// a small mono MP3 and points its timing file at it. A 6MB WAV per two
// minutes of speech makes playback slow to start; 48kbps mono is plenty.
//
// Usage: node scripts/encode-seed-audio.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";

const dir = join(import.meta.dirname, "..", "public", "seed-media");
const mb = (p) => (statSync(p).size / 1024 / 1024).toFixed(1);

for (const file of readdirSync(dir).filter((f) => f.endsWith(".timing.json"))) {
  const timingPath = join(dir, file);
  const timing = JSON.parse(readFileSync(timingPath, "utf8").replace(/^﻿/, ""));
  if (!timing.mediaFile.endsWith(".wav")) continue;

  const wav = join(dir, timing.mediaFile);
  const mp3Name = timing.mediaFile.replace(/\.wav$/, ".mp3");
  const mp3 = join(dir, mp3Name);
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", "22050", "-codec:a", "libmp3lame", "-b:a", "48k", mp3]);

  console.log(`${timing.mediaFile} (${mb(wav)} MB) -> ${mp3Name} (${mb(mp3)} MB)`);
  timing.mediaFile = mp3Name;
  writeFileSync(timingPath, JSON.stringify(timing, null, 2) + "\n", "utf8");
  rmSync(wav);
}
