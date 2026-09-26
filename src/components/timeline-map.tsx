"use client";

import { memo, useMemo, useRef, useState } from "react";
import { formatClock } from "@/lib/format";
import type { SpeakerStat } from "@/lib/speakers";
import { HIGHLIGHT_LABELS, type HighlightLabel } from "@/lib/highlights";

type Line = { id: string; speakerName: string; startMs: number; endMs: number };

export type TimelinePin =
  | { kind: "highlight"; id: string; ms: number; label: HighlightLabel; text: string }
  | { kind: "action"; id: string; ms: number; done: boolean; text: string };

const ROW = "h-7";

// Gridline spacing that gives roughly 4–8 ticks at any meeting length.
function tickStep(totalMs: number) {
  const min = totalMs / 60_000;
  if (min <= 2.5) return 30_000;
  if (min <= 6) return 60_000;
  if (min <= 15) return 2 * 60_000;
  if (min <= 40) return 5 * 60_000;
  if (min <= 90) return 10 * 60_000;
  return 15 * 60_000;
}

// One lane's bars. Memoised and only told about the active line when it's
// this speaker's, so playback re-renders a single lane rather than all.
const Lane = memo(function Lane({
  lines,
  color,
  totalMs,
  activeLineId,
}: {
  lines: Line[];
  color: string;
  totalMs: number;
  activeLineId: string | null;
}) {
  return (
    <>
      {lines.map((l) => {
        const active = l.id === activeLineId;
        return (
          <span
            key={l.id}
            className={`absolute bottom-1.5 top-1.5 rounded-[3px] ${
              active ? "ring-2 ring-ink/70 ring-offset-1 ring-offset-card" : ""
            }`}
            style={{
              left: `${(l.startMs / totalMs) * 100}%`,
              width: `max(3px, ${((l.endMs - l.startMs) / totalMs) * 100}%)`,
              background: color,
              opacity: active ? 1 : 0.8,
            }}
          />
        );
      })}
    </>
  );
});

// A speaker's name; click to rename when the view is editable.
function SpeakerName({ name, onRename }: { name: string; onRename?: (from: string, to: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!onRename) return <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{name}</span>;

  if (editing) {
    const finish = async (value: string) => {
      const to = value.trim();
      if (!to || to === name) return setEditing(false);
      setSaving(true);
      await onRename(name, to).catch(() => {});
      setSaving(false);
      setEditing(false);
    };
    return (
      <input
        autoFocus
        defaultValue={name}
        maxLength={40}
        disabled={saving}
        aria-label={`Rename ${name}`}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => finish(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-6 min-w-0 flex-1 rounded border border-ink-3 bg-paper px-1 text-[13px] text-ink outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to rename"
      className="min-w-0 flex-1 truncate rounded text-left text-[13px] text-ink decoration-ink-3 decoration-dotted underline-offset-2 hover:underline"
    >
      {name}
    </button>
  );
}

function PinGlyph({ pin, size = "md" }: { pin: TimelinePin; size?: "sm" | "md" }) {
  if (pin.kind === "highlight") {
    return (
      <span
        className={`block rotate-45 rounded-[2px] ring-2 ring-card ${size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5"}`}
        style={{ background: HIGHLIGHT_LABELS[pin.label].color }}
      />
    );
  }
  return (
    <span
      className={`block rounded-full border-2 border-ink-2 ${pin.done ? "bg-ink-2" : "bg-card"} ${
        size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"
      }`}
    />
  );
}

export function TimelineMap({
  lines,
  speakers,
  totalMs,
  currentMs,
  activeLine,
  pins,
  onSeek,
  onRenameSpeaker,
}: {
  lines: Line[];
  speakers: SpeakerStat[];
  totalMs: number;
  currentMs: number;
  activeLine: Line | null;
  pins: TimelinePin[];
  onSeek: (ms: number) => void;
  /** Omitted on read-only (shared) views. */
  onRenameSpeaker?: (from: string, to: string) => Promise<void>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [tip, setTip] = useState<TimelinePin | null>(null);

  const linesBySpeaker = useMemo(() => {
    const map = new Map<string, Line[]>();
    for (const l of lines) map.set(l.speakerName, [...(map.get(l.speakerName) ?? []), l]);
    return map;
  }, [lines]);

  const ticks = useMemo(() => {
    const step = tickStep(totalMs);
    const out: number[] = [];
    for (let t = 0; t < totalMs - step * 0.4; t += step) out.push(t);
    return out;
  }, [totalMs]);

  const pct = (ms: number) => `${(Math.min(Math.max(ms, 0), totalMs) / totalMs) * 100}%`;
  const msAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * totalMs;
  };
  // Keep tooltips on-screen near either end of the track.
  const edgeShift = (ms: number) =>
    ms / totalMs < 0.18 ? "translate-x-0" : ms / totalMs > 0.82 ? "-translate-x-full" : "-translate-x-1/2";

  return (
    <section aria-label="Meeting timeline" className="rounded-2xl border border-rule bg-card px-4 pb-3 pt-4 sm:px-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Who spoke when</h2>
        <div className="flex items-center gap-4 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <PinGlyph size="sm" pin={{ kind: "highlight", id: "", ms: 0, label: "HIGHLIGHT", text: "" }} />
            Highlight
          </span>
          <span className="inline-flex items-center gap-1.5">
            <PinGlyph size="sm" pin={{ kind: "action", id: "", ms: 0, done: false, text: "" }} />
            Action item
          </span>
          <span className="hidden md:inline">
            {onRenameSpeaker ? "Click a name to rename it, anywhere else to jump" : "Click anywhere to jump there"}
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="w-24 shrink-0 sm:w-44">
          <div className={`${ROW} flex items-center text-[11px] text-ink-3`}>Moments</div>
          {speakers.map((s) => (
            <div
              key={s.name}
              className={`${ROW} flex min-w-0 items-center gap-2`}
              title={`${s.name}: ${Math.round(s.share * 100)}% of the talking`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <SpeakerName name={s.name} onRename={onRenameSpeaker} />
              <span className="font-mono text-[11px] tabular-nums text-ink-3">{Math.round(s.share * 100)}%</span>
            </div>
          ))}
        </div>

        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek in the recording"
          aria-valuemin={0}
          aria-valuemax={Math.round(totalMs / 1000)}
          aria-valuenow={Math.round(currentMs / 1000)}
          aria-valuetext={formatClock(currentMs)}
          className="relative min-w-0 flex-1 cursor-pointer select-none rounded-sm"
          onClick={(e) => onSeek(msAt(e.clientX))}
          onMouseMove={(e) => setHoverMs(msAt(e.clientX))}
          onMouseLeave={() => setHoverMs(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              e.stopPropagation();
              onSeek(currentMs + (e.key === "ArrowLeft" ? -5000 : 5000));
            }
          }}
        >
          {ticks.map((t) => (
            <span key={t} className="absolute bottom-5 top-0 w-px bg-rule/60" style={{ left: pct(t) }} />
          ))}

          <div className={`relative ${ROW}`}>
            {pins.map((p) => (
              <button
                key={`${p.kind}-${p.id}`}
                type="button"
                aria-label={`${p.kind === "highlight" ? HIGHLIGHT_LABELS[p.label].name : "Action item"} at ${formatClock(p.ms)}: ${p.text}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(p.ms);
                }}
                onMouseEnter={() => setTip(p)}
                onMouseLeave={() => setTip(null)}
                onFocus={() => setTip(p)}
                onBlur={() => setTip(null)}
                className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded p-1 hover:scale-125"
                style={{ left: pct(p.ms) }}
              >
                <PinGlyph pin={p} />
              </button>
            ))}
          </div>

          {speakers.map((s) => (
            <div key={s.name} className={`relative ${ROW} border-t border-rule/60`}>
              <Lane
                lines={linesBySpeaker.get(s.name) ?? []}
                color={s.color}
                totalMs={totalMs}
                activeLineId={activeLine?.speakerName === s.name ? activeLine.id : null}
              />
            </div>
          ))}

          <div className="relative h-5 border-t border-rule">
            {ticks.map((t, i) => (
              <span
                key={t}
                className={`absolute top-1 font-mono text-[10px] tabular-nums text-ink-3 ${i === 0 ? "" : "-translate-x-1/2"}`}
                style={{ left: pct(t) }}
              >
                {formatClock(t)}
              </span>
            ))}
          </div>

          {hoverMs != null && (
            <div
              className="pointer-events-none absolute bottom-0 top-0 w-px border-l border-dashed border-ink-3/70"
              style={{ left: pct(hoverMs) }}
            >
              <span
                className={`absolute bottom-0 rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] text-paper ${edgeShift(hoverMs)}`}
              >
                {formatClock(hoverMs)}
              </span>
            </div>
          )}

          <div
            className="pointer-events-none absolute bottom-5 top-0 w-0.5 -translate-x-1/2 bg-accent transition-[left] duration-200 ease-linear"
            style={{ left: pct(currentMs) }}
          >
            <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-accent" />
          </div>

          {tip && (
            <div
              className={`pointer-events-none absolute bottom-full z-20 mb-1 w-64 rounded-lg border border-rule bg-card p-2.5 text-xs shadow-lg ${edgeShift(tip.ms)}`}
              style={{ left: pct(tip.ms) }}
            >
              <div className="mb-1 flex items-center gap-2 text-ink-3">
                <PinGlyph pin={tip} size="sm" />
                <span className="font-medium text-ink-2">
                  {tip.kind === "highlight" ? HIGHLIGHT_LABELS[tip.label].name : tip.done ? "Action item · done" : "Action item"}
                </span>
                <span className="ml-auto font-mono tabular-nums">{formatClock(tip.ms)}</span>
              </div>
              <p className="leading-snug text-ink">{tip.text}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
