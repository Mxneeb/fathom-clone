// End-to-end check of background speaker separation against a running app:
// signs in as a fresh demo guest, uploads a sample recording through the real
// upload path (browser-style Blob upload + /api/meetings), starts separation,
// polls until it finishes, then scores the result against the sample's known
// speaker timing and cleans up (guest account + uploaded file).
//
// Usage: node scripts/e2e-speakers.mjs [baseUrl] [sample-slug]
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { upload } from "@vercel/blob/client";
import { del } from "@vercel/blob";

const BASE = process.argv[2] || "http://localhost:3100";
const SLUG = process.argv[3] || "sales-discovery";
const mediaDir = join(import.meta.dirname, "..", "public", "seed-media");
const timing = JSON.parse(readFileSync(join(mediaDir, `${SLUG}.timing.json`), "utf8").replace(/^﻿/, ""));

const login = await fetch(`${BASE}/api/demo`, { method: "POST", redirect: "manual" });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
if (!cookie) throw new Error("demo sign-in gave no session cookie");

const file = new File([readFileSync(join(mediaDir, timing.mediaFile))], timing.mediaFile, { type: "audio/mpeg" });
const blob = await upload(file.name, file, { access: "public", handleUploadUrl: `${BASE}/api/blob/upload-url`, headers: { Cookie: cookie } });

let t0 = Date.now();
const created = await fetch(`${BASE}/api/meetings`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ blobUrl: blob.url, title: `E2E speakers (${SLUG})`, mediaType: "AUDIO" }),
});
if (!created.ok) throw new Error(`upload failed: ${created.status} ${await created.text()}`);
const { meetingId } = await created.json();
console.log(`transcribed in ${((Date.now() - t0) / 1000).toFixed(1)}s -> meeting ${meetingId}`);

t0 = Date.now();
const start = await fetch(`${BASE}/api/meetings/${meetingId}/speakers`, { method: "POST", headers: { Cookie: cookie } });
console.log(`start: ${start.status}`);
let status;
while (Date.now() - t0 < 6 * 60 * 1000) {
  await new Promise((r) => setTimeout(r, 3000));
  status = await (await fetch(`${BASE}/api/meetings/${meetingId}/speakers`, { headers: { Cookie: cookie } })).json();
  if (status.status === "DONE" || status.status === "FAILED") break;
}
console.log(`speakers: ${status.status} after ${((Date.now() - t0) / 1000).toFixed(1)}s${status.error ? ` (${status.error})` : ""}`);

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const { rows: lines } = await db.query(
  'select "speakerName", "startMs", "endMs", text from "TranscriptLine" where "meetingId" = $1 order by "order"',
  [meetingId]
);

// Map each found speaker to the true speaker it overlaps most, then score
// transcript lines by duration.
const overlap = new Map();
for (const l of lines) {
  for (const t of timing.lines) {
    const o = Math.min(l.endMs, t.endMs) - Math.max(l.startMs, t.startMs);
    if (o > 0) overlap.set(`${l.speakerName}|${t.speaker}`, (overlap.get(`${l.speakerName}|${t.speaker}`) ?? 0) + o);
  }
}
const mapping = new Map();
for (const [key, n] of overlap) {
  const [found, truth] = key.split("|");
  if (!mapping.has(found) || n > mapping.get(found).n) mapping.set(found, { truth, n });
}
let total = 0;
let correct = 0;
for (const l of lines) {
  const d = l.endMs - l.startMs;
  const best = timing.lines
    .map((t) => ({ t, o: Math.min(l.endMs, t.endMs) - Math.max(l.startMs, t.startMs) }))
    .sort((a, b) => b.o - a.o)[0];
  total += d;
  if (best?.o > 0 && mapping.get(l.speakerName)?.truth === best.t.speaker) correct += d;
}
console.log(`\nfound speakers -> true speaker:`);
for (const [found, { truth }] of mapping) console.log(`  ${found.padEnd(16)} -> ${truth}`);
console.log(`lines on the right speaker: ${((100 * correct) / total).toFixed(1)}% of speech (${lines.length} lines)`);
console.log(`\nfirst lines:`);
for (const l of lines.slice(0, 6)) console.log(`  ${l.speakerName.padEnd(14)} ${l.text.slice(0, 70)}`);

await db.query('delete from "User" where id = (select "ownerId" from "Meeting" where id = $1)', [meetingId]);
await db.end();
await del(blob.url);
console.log("\ncleaned up guest account and uploaded file");
