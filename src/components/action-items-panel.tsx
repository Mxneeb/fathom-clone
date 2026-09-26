"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { formatClock, formatShortDate } from "@/lib/format";
import { Panel, QuietButton, TimeChip } from "@/components/panel";
import { CheckIcon, SparkIcon } from "@/components/icons";

export type ActionItemData = {
  id: string;
  text: string;
  owner: string | null;
  dueDate: string | null;
  done: boolean;
  sourceMs: number | null;
};

export function ActionItemsPanel({
  meetingId,
  items,
  onItemsChange,
  onSeek,
  readOnly = false,
}: {
  meetingId: string;
  items: ActionItemData[];
  onItemsChange: Dispatch<SetStateAction<ActionItemData[]>>;
  onSeek: (ms: number) => void;
  readOnly?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const doneCount = items.filter((i) => i.done).length;

  async function generate() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/action-items`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const { actionItems } = (await res.json()) as { actionItems: ActionItemData[] };
      if (actionItems.length === 0) {
        setMessage({ tone: "info", text: "No commitments found in this transcript." });
      } else {
        onItemsChange((prev) => [...prev, ...actionItems]);
      }
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setLoading(false);
    }
  }

  async function toggle(id: string, done: boolean) {
    onItemsChange((prev) => prev.map((i) => (i.id === id ? { ...i, done } : i)));
    const res = await fetch(`/api/meetings/${meetingId}/action-items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionItemId: id, done }),
    });
    if (!res.ok) onItemsChange((prev) => prev.map((i) => (i.id === id ? { ...i, done: !done } : i)));
  }

  return (
    <Panel
      title={
        <>
          Action items
          {items.length > 0 && (
            <span className="ml-2 font-mono font-normal normal-case tracking-normal">
              {doneCount}/{items.length} done
            </span>
          )}
        </>
      }
      action={
        !readOnly &&
        items.length > 0 && (
          <QuietButton onClick={generate} disabled={loading}>
            {loading ? "Looking…" : "Find more"}
          </QuietButton>
        )
      }
    >
      {items.length === 0 ? (
        readOnly ? (
          <p className="text-sm text-ink-3">No action items.</p>
        ) : (
          <div className="py-3 text-center">
            <p className="mx-auto mb-4 max-w-xs font-serif text-[15px] text-ink-2">
              Commitments made in the meeting, with who owns them and where they were said.
            </p>
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-paper hover:bg-ink-2 disabled:opacity-60"
            >
              <SparkIcon size={15} />
              {loading ? "Reading the transcript…" : "Find action items"}
            </button>
          </div>
        )
      ) : (
        <ul className="-my-1 divide-y divide-rule/60">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-2.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={item.done}
                aria-label={item.text}
                disabled={readOnly}
                onClick={() => toggle(item.id, !item.done)}
                className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors ${
                  item.done ? "border-good bg-good text-card" : "border-rule-2 bg-card hover:border-ink-3"
                } disabled:cursor-default`}
              >
                {item.done && <CheckIcon size={12} strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-[14.5px] leading-snug ${item.done ? "text-ink-3 line-through" : "text-ink"}`}>
                  {item.text}
                </p>
                {(item.owner || item.dueDate) && (
                  <p className="mt-0.5 text-xs text-ink-3">
                    {item.owner}
                    {item.owner && item.dueDate && " · "}
                    {item.dueDate && `due ${formatShortDate(new Date(item.dueDate))}`}
                  </p>
                )}
              </div>
              {item.sourceMs != null && (
                <TimeChip label={formatClock(item.sourceMs)} onClick={() => onSeek(item.sourceMs!)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p className={`mt-3 text-xs ${message.tone === "error" ? "text-bad" : "text-ink-3"}`}>{message.text}</p>
      )}
    </Panel>
  );
}
