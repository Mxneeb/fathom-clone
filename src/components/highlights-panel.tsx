"use client";

import { formatClock } from "@/lib/format";
import { HIGHLIGHT_LABELS, type HighlightLabel } from "@/lib/highlights";
import { Panel, QuietButton, TimeChip } from "@/components/panel";
import { CloseIcon } from "@/components/icons";

export type HighlightData = { id: string; timestampMs: number; label: HighlightLabel; note: string | null };
type Line = { startMs: number; endMs: number; speakerName: string; text: string };

export function HighlightsPanel({
  highlights,
  lines,
  onSeek,
  onAdd,
  onDelete,
}: {
  highlights: HighlightData[];
  lines: Line[];
  onSeek: (ms: number) => void;
  /** Both omitted on read-only (shared) views. */
  onAdd?: () => void;
  onDelete?: (id: string) => void;
}) {
  const sorted = [...highlights].sort((a, b) => a.timestampMs - b.timestampMs);
  const lineAt = (ms: number) => lines.find((l) => ms >= l.startMs && ms < l.endMs);

  return (
    <Panel
      title={
        <>
          Highlights
          {highlights.length > 0 && (
            <span className="ml-2 font-mono font-normal normal-case tracking-normal">{highlights.length}</span>
          )}
        </>
      }
      action={onAdd && <QuietButton onClick={onAdd}>+ At current time</QuietButton>}
    >
      {sorted.length === 0 ? (
        <p className="text-sm text-ink-3">
          {onAdd ? (
            <>
              Press <kbd className="rounded border border-rule px-1 font-mono text-[11px]">H</kbd> during playback, or
              hover a transcript line, to mark a moment.
            </>
          ) : (
            "No highlights."
          )}
        </p>
      ) : (
        <ul className="-my-1 divide-y divide-rule/60">
          {sorted.map((h) => {
            const line = lineAt(h.timestampMs);
            const cfg = HIGHLIGHT_LABELS[h.label];
            return (
              <li key={h.id} className="group flex items-start gap-3 py-2.5">
                <TimeChip label={formatClock(h.timestampMs)} onClick={() => onSeek(h.timestampMs)} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: cfg.color }}>
                    <span className="h-2 w-2 rotate-45 rounded-[1px]" style={{ background: cfg.color }} />
                    {cfg.name}
                  </p>
                  {h.note && <p className="mt-0.5 text-[14px] leading-snug text-ink">{h.note}</p>}
                  {line && (
                    <p className="mt-1 line-clamp-2 font-serif text-[13.5px] italic leading-snug text-ink-3">
                      {line.speakerName}: “{line.text}”
                    </p>
                  )}
                </div>
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(h.id)}
                    aria-label={`Remove highlight at ${formatClock(h.timestampMs)}`}
                    className="rounded p-1 text-ink-3 opacity-0 hover:bg-paper-2 hover:text-bad focus:opacity-100 group-hover:opacity-100"
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
