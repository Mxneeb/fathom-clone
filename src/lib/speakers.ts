// Eight muted colours for speaker lanes, each at least 3:1 against the paper
// background. Names are always set in ink beside a swatch, never in these.
export const SPEAKER_COLORS = [
  "#2f5d8a",
  "#b0532b",
  "#3a7a55",
  "#7a4f9a",
  "#9a7614",
  "#2b7a7a",
  "#a8446a",
  "#5e6b2e",
];

export type SpeakerStat = { name: string; color: string; talkMs: number; share: number };

type Line = { speakerName: string; startMs: number; endMs: number };

// Speakers in order of first appearance (so colours are stable), with how
// much of the talking each one did.
export function speakerStats(lines: Line[]): SpeakerStat[] {
  const talk = new Map<string, number>();
  for (const l of lines) {
    talk.set(l.speakerName, (talk.get(l.speakerName) ?? 0) + Math.max(0, l.endMs - l.startMs));
  }
  const total = [...talk.values()].reduce((a, b) => a + b, 0) || 1;
  return [...talk.entries()].map(([name, talkMs], i) => ({
    name,
    color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
    talkMs,
    share: talkMs / total,
  }));
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
}
