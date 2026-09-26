"use client";

import { formatClock } from "@/lib/format";
import { BackIcon, DiamondIcon, ForwardIcon, PauseIcon, PlayIcon } from "@/components/icons";

const RATES = [1, 1.25, 1.5, 2];

export function PlayerBar({
  playing,
  buffering,
  currentMs,
  totalMs,
  rate,
  onToggle,
  onSeek,
  onSkip,
  onRate,
  onHighlight,
}: {
  playing: boolean;
  buffering: boolean;
  currentMs: number;
  totalMs: number;
  rate: number;
  onToggle: () => void;
  onSeek: (ms: number) => void;
  onSkip: (deltaMs: number) => void;
  onRate: (rate: number) => void;
  onHighlight?: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-8 border-t border-rule bg-paper/90 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => onSkip(-15_000)}
          aria-label="Back 15 seconds"
          title="Back 15s (←  for 5s)"
          className="relative rounded-full p-2 text-ink-2 hover:bg-paper-2 hover:text-ink"
        >
          <BackIcon size={20} />
          <span className="absolute inset-0 flex items-center justify-center pt-0.5 text-[8px] font-bold">15</span>
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={buffering ? "Loading audio, pause" : playing ? "Pause" : "Play"}
          title={buffering ? "Loading audio…" : playing ? "Pause (space)" : "Play (space)"}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper hover:bg-ink-2"
        >
          {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} className="translate-x-px" />}
          {buffering && (
            <span className="absolute -inset-1 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onSkip(15_000)}
          aria-label="Forward 15 seconds"
          title="Forward 15s (→  for 5s)"
          className="relative rounded-full p-2 text-ink-2 hover:bg-paper-2 hover:text-ink"
        >
          <ForwardIcon size={20} />
          <span className="absolute inset-0 flex items-center justify-center pt-0.5 text-[8px] font-bold">15</span>
        </button>

        <span className="hidden w-28 shrink-0 text-center font-mono text-xs tabular-nums text-ink-2 sm:block">
          {formatClock(currentMs)} / {formatClock(totalMs)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.round(totalMs)}
          step={250}
          value={Math.min(Math.round(currentMs), Math.round(totalMs))}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Seek"
          aria-valuetext={formatClock(currentMs)}
          className="h-1 min-w-0 flex-1 cursor-pointer"
        />

        <button
          type="button"
          onClick={() => onRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])}
          aria-label={`Playback speed ${rate}×, change`}
          className="w-12 shrink-0 rounded-md border border-rule px-1.5 py-1 font-mono text-xs tabular-nums text-ink-2 hover:border-ink-3 hover:text-ink"
        >
          {rate}×
        </button>
        {onHighlight && (
          <button
            type="button"
            onClick={onHighlight}
            title="Highlight this moment (H)"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-rule px-2 py-1 text-xs font-medium text-ink-2 hover:border-accent hover:text-accent"
          >
            <DiamondIcon size={14} />
            <span className="hidden sm:inline">Highlight</span>
            <kbd className="hidden rounded border border-rule px-1 font-mono text-[10px] text-ink-3 md:inline">H</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
