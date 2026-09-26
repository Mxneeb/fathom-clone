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
