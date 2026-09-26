"use client";

import { memo, useMemo, useRef, useState } from "react";
import { formatClock } from "@/lib/format";
import type { SpeakerStat } from "@/lib/speakers";
import { HIGHLIGHT_LABELS, type HighlightLabel } from "@/lib/highlights";

type Line = { id: string; speakerName: string; startMs: number; endMs: number };
export type ChapterData = { id: string; title: string; startMs: number; endMs: number };

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
  dimmed,
}: {
  lines: Line[];
  color: string;
  totalMs: number;
  activeLineId: string | null;
  dimmed: boolean;
}) {
  return (
    <>
      {lines.map((l) => {
        const active = l.id === activeLineId;
        return (
          <span
            key={l.id}
            className={`absolute bottom-1.5 top-1.5 rounded-[3px] transition-opacity ${
              active ? "ring-2 ring-ink/70 ring-offset-1 ring-offset-card" : ""
            }`}
            style={{
              left: `${(l.startMs / totalMs) * 100}%`,
              width: `max(3px, ${((l.endMs - l.startMs) / totalMs) * 100}%)`,
              background: color,
              opacity: dimmed ? 0.2 : active ? 1 : 0.8,
            }}
          />
        );
      })}
    </>
  );
});

function PencilIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M4 20h4L19 9l-4-4L4 16z" strokeLinejoin="round" />
    </svg>
  );
}

// A speaker row's label: the name toggles the transcript filter; the pencil
// (editable views only) renames.
function SpeakerLabel({
  speaker,
  selected,
  filtering,
  onToggle,
  onRename,
}: {
  speaker: SpeakerStat;
  selected: boolean;
  filtering: boolean;
  onToggle: () => void;
  onRename?: (from: string, to: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (editing && onRename) {
    const finish = async (value: string) => {
      const to = value.trim();
      if (!to || to === speaker.name) return setEditing(false);
      setSaving(true);
      await onRename(speaker.name, to).catch(() => {});
      setSaving(false);
      setEditing(false);
    };
    return (
      <input
        autoFocus
        defaultValue={speaker.name}
        maxLength={40}
        disabled={saving}
        aria-label={`Rename ${speaker.name}`}
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
    <span className="group/name flex min-w-0 flex-1 items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        title={selected ? `Show everyone` : `Show only ${speaker.name} in the transcript`}
        className={`min-w-0 truncate rounded text-left text-[13px] hover:underline ${
          selected ? "font-semibold text-ink" : filtering ? "text-ink-3" : "text-ink"
        }`}
      >
        {speaker.name}
      </button>
      {onRename && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Rename ${speaker.name}`}
          title="Rename"
          className="shrink-0 rounded p-0.5 text-ink-3 opacity-0 hover:text-ink focus:opacity-100 group-hover/name:opacity-100"
        >
          <PencilIcon />
        </button>
      )}
    </span>
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
  chapters,
  speakerFilter,
  onToggleSpeaker,
  onSeek,
  onRenameSpeaker,
  onFindTopics,
}: {
  lines: Line[];
  speakers: SpeakerStat[];
  totalMs: number;
  currentMs: number;
  activeLine: Line | null;
  pins: TimelinePin[];
  chapters: ChapterData[];
  speakerFilter: Set<string>;
  onToggleSpeaker: (name: string) => void;
  onSeek: (ms: number) => void;
  /** The next two are omitted on read-only (shared) views. */
  onRenameSpeaker?: (from: string, to: string) => Promise<void>;
  onFindTopics?: () => Promise<void>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [tip, setTip] = useState<TimelinePin | null>(null);
  const [topicsState, setTopicsState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const filtering = speakerFilter.size > 0;
  const showTopics = chapters.length > 0 || Boolean(onFindTopics);

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

  async function findTopics() {
    if (!onFindTopics) return;
    setTopicsState({ busy: true, error: null });
    try {
      await onFindTopics();
      setTopicsState({ busy: false, error: null });
    } catch (e) {
      setTopicsState({ busy: false, error: e instanceof Error ? e.message : "Couldn't find topics." });
    }
  }

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
          <span className="hidden md:inline">Click a name to show only them · anywhere else to jump</span>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="w-24 shrink-0 sm:w-44">
          {showTopics && <div className={`${ROW} flex items-center text-[11px] text-ink-3`}>Topics</div>}
          <div className={`${ROW} flex items-center text-[11px] text-ink-3`}>Moments</div>
          {speakers.map((s) => (
            <div
              key={s.name}
              className={`${ROW} -mx-1 flex min-w-0 items-center gap-2 rounded px-1 ${speakerFilter.has(s.name) ? "bg-paper-2" : ""}`}
              title={`${s.name}: ${Math.round(s.share * 100)}% of the talking`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: s.color, opacity: filtering && !speakerFilter.has(s.name) ? 0.35 : 1 }}
              />
              <SpeakerLabel
                speaker={s}
                selected={speakerFilter.has(s.name)}
                filtering={filtering}
                onToggle={() => onToggleSpeaker(s.name)}
                onRename={onRenameSpeaker}
              />
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

          {showTopics && (
            <div className={`relative ${ROW}`}>
              {chapters.length > 0 ? (
                chapters.map((c) => {
                  const current = currentMs >= c.startMs && currentMs < c.endMs;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSeek(c.startMs);
                      }}
                      title={`${c.title} · ${formatClock(c.startMs)}–${formatClock(c.endMs)}`}
                      className={`absolute inset-y-0.5 z-10 overflow-hidden truncate rounded-md border px-1.5 text-left text-[11px] font-medium leading-6 transition-colors ${
                        current
                          ? "border-accent/40 bg-accent-soft text-accent-ink"
                          : "border-rule bg-paper text-ink-2 hover:border-ink-3 hover:text-ink"
                      }`}
                      style={{ left: `calc(${pct(c.startMs)} + 1px)`, width: `calc(${pct(c.endMs - c.startMs)} - 2px)` }}
                    >
                      {c.title}
                    </button>
                  );
                })
              ) : (
                <div className="flex h-full items-center gap-2 text-[11px]" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={findTopics}
                    disabled={topicsState.busy}
                    className="rounded-md border border-dashed border-rule-2 px-2 py-0.5 font-medium text-ink-2 hover:border-ink-3 hover:text-ink disabled:opacity-60"
                  >
                    {topicsState.busy ? "Finding topics…" : "Find topics"}
                  </button>
                  {topicsState.error && <span className="text-bad">{topicsState.error}</span>}
                </div>
              )}
            </div>
          )}

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
                dimmed={filtering && !speakerFilter.has(s.name)}
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
            className="pointer-events-none absolute bottom-5 top-0 z-20 w-0.5 -translate-x-1/2 bg-accent transition-[left] duration-200 ease-linear"
            style={{ left: pct(currentMs) }}
          >
            <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-accent" />
          </div>

          {tip && (
            <div
              className={`pointer-events-none absolute bottom-full z-30 mb-1 w-64 rounded-lg border border-rule bg-card p-2.5 text-xs shadow-lg ${edgeShift(tip.ms)}`}
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
