// The model cites transcript lines by number ("[#12]", "[#12, #15]"). Before
// storing, those become timestamps ("[t=83000]") so a citation keeps pointing
// at the same moment whatever later happens to the transcript (speakers
// renamed or re-separated). The markdown renderer turns [t=…] into a chip
// that jumps playback there.
// Models drift from the requested "[#12, #15]": no "#" (the transcript lines
// they read look like "[12] Name: ..."), spaces inside the brackets, ranges
// ("#46-#51", often with a Unicode hyphen), full-width brackets ("【#54】").
// A range cites where it starts. A bracket followed by "(" is a markdown
// link, not a citation.
const REF = String.raw`#?\s*\d+(?:\s*[-‐‑–—]\s*#?\s*\d+)?`;
const CITATION = new RegExp(String.raw`\s?[[【［]\s*${REF}(?:\s*[,;，]\s*${REF})*\s*[\]】］](?!\()`, "g");

export function resolveLineCitations(text: string, lines: { startMs: number }[]) {
  return text.replace(CITATION, (match) => {
    const refs = match
      .split(/[,;，]/)
      .map((part) => lines[Number(part.match(/\d+/)?.[0])])
      .filter(Boolean);
    return refs.length ? ` ${refs.map((l) => `[t=${l.startMs}]`).join("")}` : "";
  });
}

export function stripCitations(text: string) {
  return text.replace(/\s?\[t=\d+\]/g, "");
}

// Transcript text for the model, one numbered line each, so it can cite.
export function numberedTranscript(lines: { speakerName: string; text: string }[]) {
  return lines.map((l, i) => `[${i}] ${l.speakerName}: ${l.text}`).join("\n");
}

// The same, squeezed under `maxChars` for work that only needs the outline
// (finding topics): an hour-long transcript is several times Groq's free
// tier allowance of 8,000 tokens a minute. Lines keep their numbers but are
// cut to their first words, and if that's still too long only every nth
// line is kept.
export function transcriptOutline(lines: { speakerName: string; text: string }[], maxChars: number) {
  const full = numberedTranscript(lines);
  if (full.length <= maxChars) return full;
  const clipped = lines.map((l, i) => {
    const words = l.text.split(/\s+/);
    return `[${i}] ${l.speakerName}: ${words.length > 12 ? `${words.slice(0, 12).join(" ")}…` : l.text}`;
  });
  const step = Math.ceil(clipped.reduce((n, l) => n + l.length + 1, 0) / maxChars);
  return clipped.filter((_, i) => i % step === 0).join("\n");
}
