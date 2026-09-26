// How many names does suggestSpeakerNames recover from a sample meeting
// when speakers are perfectly separated? Prints each suggestion vs. the truth.
// Usage: npx tsx scripts/eval-speaker-names.mts [sample-slug]
import "dotenv/config";
import { readFileSync } from "node:fs";
import { suggestSpeakerNames } from "../src/lib/ai";

const slug = process.argv[2] ?? "q4-planning";
const t = JSON.parse(readFileSync(`public/seed-media/${slug}.timing.json`, "utf8").replace(/^﻿/, ""));
const labelOf = new Map<string, string>();
for (const l of t.lines) if (!labelOf.has(l.speaker)) labelOf.set(l.speaker, `Speaker ${labelOf.size + 1}`);
const lines = t.lines.map((l: { speaker: string; text: string }) => ({ speakerName: labelOf.get(l.speaker)!, text: l.text }));

const names = await suggestSpeakerNames(lines, [...labelOf.values()]);
for (const [truth, label] of labelOf) {
  const got = names[label];
  console.log(`${label.padEnd(10)} truth ${truth.padEnd(14)} suggested ${got ?? "-"}${got && !truth.startsWith(got) ? "   <-- WRONG" : ""}`);
}
