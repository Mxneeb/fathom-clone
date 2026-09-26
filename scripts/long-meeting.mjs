// Builds a long test meeting from the sample recordings played back to back,
// with the true speaker of every line. The truth is the synthetic voice a
// line was spoken in, not the character's name: names don't pin a voice
// across samples (Priya is plain Zira in one, pitch-shifted in another).
// Shared by scripts/eval-long-meeting.mjs and scripts/build-long-meeting.mjs.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";

export const RATE = 16000;
const root = join(import.meta.dirname, "..");
// Every sample once, then the two longest again at other offsets: ~25 min.
const ORDER = ["daily-standup", "product-sync", "q4-planning", "sales-discovery", "q4-planning", "product-sync"];

export const toFloats = (buf) => new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
export const runFfmpeg = (args, input) => execFileSync(ffmpeg, ["-loglevel", "error", ...args], { input, maxBuffer: 1 << 30 });
export const decode = (path) => toFloats(runFfmpeg(["-i", path, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"]));

/** @returns {{ audio: Float32Array, lines: {speaker:string,startMs:number,endMs:number,text:string}[], voices: number }} */
export function buildLongMeeting(minMinutes = 0) {
  const decoded = new Map();
  const parts = [];
  const lines = [];
  let offsetSec = 0;
  for (let i = 0; i < ORDER.length || offsetSec < minMinutes * 60; i++) {
    const slug = ORDER[i % ORDER.length];
    const timing = JSON.parse(readFileSync(join(root, "public", "seed-media", `${slug}.timing.json`), "utf8").replace(/^﻿/, ""));
    const script = JSON.parse(readFileSync(join(root, "scripts", "seed-scripts", `${slug}.json`), "utf8").replace(/^﻿/, ""));
    const voiceOf = new Map(script.participants.map((p) => [p.name, `${p.voice}/${p.rate ?? 0}/${p.pitch ?? 1}`]));
    if (!decoded.has(slug)) decoded.set(slug, decode(join(root, "public", "seed-media", timing.mediaFile)));
    const samples = decoded.get(slug);
    for (const l of timing.lines) {
      lines.push({ speaker: voiceOf.get(l.speaker), startMs: Math.round(l.startMs + offsetSec * 1000), endMs: Math.round(l.endMs + offsetSec * 1000), text: l.text });
    }
    parts.push(samples, new Float32Array(RATE)); // a second of silence between
    offsetSec += samples.length / RATE + 1;
  }
  const audio = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (audio.set(p, at), at + p.length), 0);
  return { audio, lines, voices: new Set(lines.map((l) => l.speaker)).size };
}
