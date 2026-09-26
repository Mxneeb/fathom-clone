"use client";

import { useEffect, useState } from "react";
import { formatClock } from "@/lib/format";
import { HIGHLIGHT_LABELS, LABEL_ORDER, type HighlightLabel } from "@/lib/highlights";

export function HighlightComposer({
  atMs,
  context,
  onCancel,
  onSave,
}: {
  atMs: number;
  /** The transcript line being highlighted, shown for context. */
  context?: { speakerName: string; text: string };
  onCancel: () => void;
  onSave: (label: HighlightLabel, note: string) => Promise<void>;
}) {
  const [label, setLabel] = useState<HighlightLabel>("HIGHLIGHT");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(label, note.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the highlight");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-4 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="highlight-title"
        className="w-full max-w-md rounded-2xl border border-rule bg-card p-5 shadow-2xl"
      >
        <h2 id="highlight-title" className="font-serif text-xl font-semibold text-ink">
          Highlight at <span className="font-mono text-lg">{formatClock(atMs)}</span>
        </h2>
        {context && (
          <p className="mt-2 border-l-2 border-rule-2 pl-3 font-serif text-[14px] italic leading-snug text-ink-2">
            {context.speakerName}: “{context.text}”
          </p>
        )}

        <fieldset className="mt-4">
          <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Label</legend>
          <div className="flex flex-wrap gap-2">
            {LABEL_ORDER.map((l) => {
              const cfg = HIGHLIGHT_LABELS[l];
              const selected = l === label;
              return (
                <button
                  key={l}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setLabel(l)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                    selected ? "border-ink bg-ink text-paper" : "border-rule text-ink-2 hover:border-ink-3"
                  }`}
                >
                  <span className="h-2 w-2 rotate-45 rounded-[1px]" style={{ background: cfg.color }} />
                  {cfg.name}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-4 block">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
            Note <span className="font-normal normal-case tracking-normal">(optional)</span>
          </span>
          <textarea
            autoFocus
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
            }}
            rows={3}
            placeholder="Why does this moment matter?"
            className="w-full resize-none rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
          />
        </label>

        {error && <p className="mt-2 text-xs text-bad">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:bg-paper-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-2 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save highlight"}
          </button>
        </div>
      </div>
    </div>
  );
}
