// Writes a long test recording (the samples back to back, see
// scripts/long-meeting.mjs) as an mp3 plus its timing file, for
// scripts/e2e-speakers.mjs.
//
// Usage: node scripts/build-long-meeting.mjs <minutes> <out-dir>
//   writes <out-dir>/long-meeting.mp3 and <out-dir>/long-meeting.timing.json
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildLongMeeting, RATE, runFfmpeg } from "./long-meeting.mjs";

const [minutes = "25", outDir = "."] = process.argv.slice(2);
const { audio, lines, voices } = buildLongMeeting(Number(minutes));
const pcm = Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength);
writeFileSync(
  join(outDir, "long-meeting.mp3"),
  runFfmpeg(["-f", "f32le", "-ar", String(RATE), "-ac", "1", "-i", "-", "-c:a", "libmp3lame", "-b:a", "64k", "-f", "mp3", "-"], pcm)
);
const totalMs = Math.round((audio.length / RATE) * 1000);
writeFileSync(
  join(outDir, "long-meeting.timing.json"),
  JSON.stringify({ slug: "long-meeting", mediaFile: "long-meeting.mp3", totalMs, lines }, null, 2)
);
console.log(`wrote ${(totalMs / 60000).toFixed(1)} min, ${voices} voices, ${lines.length} lines to ${outDir}`);
