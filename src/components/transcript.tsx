"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { formatClock } from "@/lib/format";
import { HIGHLIGHT_LABELS, type HighlightLabel } from "@/lib/highlights";
import { DiamondIcon, SearchIcon } from "@/components/icons";

type Line = { id: string; speakerName: string; startMs: number; endMs: number; text: string };
type Highlight = { id: string; timestampMs: number; label: HighlightLabel; note: string | null };

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function marked(text: string, query: string) {
  if (!query) return text;
  return text.split(new RegExp(`(${escapeRegExp(query)})`, "gi")).map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-accent-soft px-0.5 text-ink">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export const Transcript = memo(function Transcript({
  lines,
  colorBySpeaker,
  activeLineId,
  highlights,
  onSeek,
  onHighlightLine,
  followSignal,
}: {
  lines: Line[];
  colorBySpeaker: Map<string, string>;
  activeLineId: string | null;
  highlights: Highlight[];
  onSeek: (ms: number) => void;
  /** Omitted on read-only (shared) views. */
  onHighlightLine?: (line: Line) => void;
  /** Bumped by the parent on every seek; resumes following playback. */
  followSignal: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef(new Map<string, HTMLDivElement>());
  // Following is paused when the user scrolls by hand, until the next seek.
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const following = pausedAt !== followSignal;
  const [query, setQuery] = useState("");
  const [matchPos, setMatchPos] = useState(0);

  const q = query.trim();
  const matchIds = useMemo(
    () => (q.length >= 2 ? lines.filter((l) => l.text.toLowerCase().includes(q.toLowerCase())).map((l) => l.id) : []),
    [lines, q]
  );

  const highlightByLine = useMemo(() => {
    const map = new Map<string, Highlight>();
    for (const h of highlights) {
      const line = lines.find((l) => h.timestampMs >= l.startMs && h.timestampMs < l.endMs);
      if (line && !map.has(line.id)) map.set(line.id, h);
    }
    return map;
  }, [highlights, lines]);

  function scrollToLine(id: string, behavior: ScrollBehavior = "smooth") {
    const c = containerRef.current;
    const el = lineRefs.current.get(id);
    if (c && el) c.scrollTo({ top: Math.max(0, el.offsetTop - c.clientHeight * 0.3), behavior });
  }

  useEffect(() => {
    if (following && activeLineId) scrollToLine(activeLineId);
  }, [activeLineId, following, followSignal]);

  function goToMatch(pos: number) {
    if (matchIds.length === 0) return;
    const next = (pos + matchIds.length) % matchIds.length;
    setMatchPos(next);
    setPausedAt(followSignal);
    scrollToLine(matchIds[next]);
  }

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-rule bg-card lg:sticky lg:top-4">
      <header className="flex flex-wrap items-center gap-3 border-b border-rule/70 px-5 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Transcript</h2>
        <form
          className="ml-auto flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            goToMatch(matchPos + 1);
          }}
        >
          <label className="flex items-center gap-1.5 rounded-lg border border-rule bg-paper px-2 py-1 focus-within:border-ink-3">
            <SearchIcon size={14} className="text-ink-3" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setMatchPos(0);
              }}
              placeholder="Find in transcript"
              aria-label="Find in transcript"
              className="w-32 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 sm:w-44"
            />
          </label>
          {q.length >= 2 && (
            <>
              <span className="min-w-14 text-center font-mono text-[11px] tabular-nums text-ink-3">
                {matchIds.length ? `${matchPos + 1}/${matchIds.length}` : "0/0"}
              </span>
              <button
                type="button"
                onClick={() => goToMatch(matchPos - 1)}
                aria-label="Previous match"
                className="rounded px-1.5 text-ink-2 hover:bg-paper-2"
              >
                ↑
              </button>
              <button type="submit" aria-label="Next match" className="rounded px-1.5 text-ink-2 hover:bg-paper-2">
                ↓
              </button>
            </>
          )}
        </form>
      </header>

      <div className="relative min-h-0">
        <div
          ref={containerRef}
          onWheel={() => setPausedAt(followSignal)}
          onTouchMove={() => setPausedAt(followSignal)}
          className="relative max-h-[60vh] overflow-y-auto px-3 py-3 lg:max-h-[calc(100vh-11rem)]"
        >
          {lines.map((line, i) => {
            const newTurn = i === 0 || lines[i - 1].speakerName !== line.speakerName;
            const active = line.id === activeLineId;
            const h = highlightByLine.get(line.id);
            const isMatch = matchIds[matchPos] === line.id;
            return (
              <div key={line.id} ref={(el) => void (el ? lineRefs.current.set(line.id, el) : lineRefs.current.delete(line.id))}>
                {newTurn && (
                  <div className={`flex items-center gap-2 px-2 pb-1 ${i === 0 ? "" : "pt-4"}`}>
                    <span className="h-2 w-2 rounded-sm" style={{ background: colorBySpeaker.get(line.speakerName) }} />
                    <span className="text-[13px] font-semibold text-ink">{line.speakerName}</span>
                  </div>
                )}
                <div
                  className={`group relative grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                    active ? "bg-accent-soft/70 shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-paper-2/70"
                  } ${isMatch ? "ring-1 ring-accent/50" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => onSeek(line.startMs)}
                    className={`pt-0.5 text-left font-mono text-[11px] tabular-nums hover:text-accent ${
                      active ? "text-accent" : "text-ink-3"
                    }`}
                  >
                    {formatClock(line.startMs)}
                  </button>
                  <p onClick={() => onSeek(line.startMs)} className="cursor-pointer text-[14.5px] leading-relaxed text-ink">
                    {marked(line.text, q.length >= 2 ? q : "")}
                    {h && (
                      <span
                        title={h.note ?? undefined}
                        className="ml-2 inline-flex translate-y-[-1px] items-center gap-1 rounded-full border border-rule bg-card px-1.5 py-px align-middle text-[11px] font-medium"
                        style={{ color: HIGHLIGHT_LABELS[h.label].color }}
                      >
                        <span className="h-1.5 w-1.5 rotate-45 rounded-[1px]" style={{ background: HIGHLIGHT_LABELS[h.label].color }} />
                        {HIGHLIGHT_LABELS[h.label].name}
                      </span>
                    )}
                  </p>
                  {onHighlightLine ? (
                    <button
                      type="button"
                      onClick={() => onHighlightLine(line)}
                      aria-label={`Highlight the line at ${formatClock(line.startMs)}`}
                      title="Highlight this moment"
                      className="rounded-md p-1 text-ink-3 opacity-0 hover:bg-card hover:text-accent focus:opacity-100 group-hover:opacity-100"
                    >
                      <DiamondIcon size={15} />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!following && activeLineId && (
          <button
            type="button"
            onClick={() => {
              setPausedAt(null);
              scrollToLine(activeLineId);
            }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-rule bg-ink px-3 py-1.5 text-xs font-medium text-paper shadow-lg hover:bg-ink-2"
          >
            ↓ Back to now
          </button>
        )}
      </div>
    </section>
  );
});
