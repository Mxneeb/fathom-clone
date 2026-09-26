import { speakerStats, initials } from "@/lib/speakers";

type Line = { speakerName: string; startMs: number; endMs: number };

// A meeting's shape at a glance: every line as a sliver in its speaker's
// colour, on one strip. Server-rendered; no interaction.
export function MiniTimeline({ lines, totalMs }: { lines: Line[]; totalMs: number }) {
  const colors = new Map(speakerStats(lines).map((s) => [s.name, s.color]));
  const total = Math.max(totalMs, lines.at(-1)?.endMs ?? 0, 1);
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-paper-2" aria-hidden>
      {lines.map((l, i) => (
        <span
          key={i}
          className="absolute inset-y-0"
          style={{
            left: `${(l.startMs / total) * 100}%`,
            width: `max(2px, ${((l.endMs - l.startMs) / total) * 100}%)`,
            background: colors.get(l.speakerName),
          }}
        />
      ))}
    </div>
  );
}

export function SpeakerStack({ lines, max = 5 }: { lines: Line[]; max?: number }) {
  const speakers = speakerStats(lines).sort((a, b) => b.share - a.share);
  const shown = speakers.slice(0, max);
  return (
    <div className="flex items-center">
      {shown.map((s, i) => (
        <span
          key={s.name}
          title={`${s.name} · ${Math.round(s.share * 100)}%`}
          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 bg-card text-[10px] font-semibold text-ink ${
            i > 0 ? "-ml-1.5" : ""
          }`}
          style={{ borderColor: s.color }}
        >
          {initials(s.name)}
        </span>
      ))}
      {speakers.length > max && (
        <span className="-ml-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-rule bg-paper-2 text-[10px] font-semibold text-ink-2">
          +{speakers.length - max}
        </span>
      )}
    </div>
  );
}
