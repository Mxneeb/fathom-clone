"use client";

import { useState } from "react";

export type ActionItemData = {
  id: string;
  text: string;
  owner: string | null;
  dueDate: string | null;
  done: boolean;
};

export function ActionItemsPanel({
  meetingId,
  initialItems,
}: {
  meetingId: string;
  initialItems: ActionItemData[];
}) {
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/action-items`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const { actionItems } = await res.json();
      setItems((prev) => [...prev, ...actionItems]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function toggleDone(id: string, done: boolean) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done } : i)));
    await fetch(`/api/meetings/${meetingId}/action-items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionItemId: id, done }),
    });
  }

  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Action Items</h2>
        <button
          onClick={generate}
          disabled={loading}
          className="text-xs text-neutral-500 underline hover:text-neutral-300 disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate more"}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="py-6 text-center">
          <p className="mb-3 text-sm text-neutral-500">No action items yet.</p>
          <button
            onClick={generate}
            disabled={loading}
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-900 disabled:opacity-50"
          >
            {loading ? "Generating…" : "Generate action items"}
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={item.done}
                onChange={(e) => toggleDone(item.id, e.target.checked)}
                className="mt-1 h-3.5 w-3.5 shrink-0 accent-sky-500"
              />
              <div className={item.done ? "text-neutral-600 line-through" : "text-neutral-200"}>
                <span className="text-sm">{item.text}</span>
                {(item.owner || item.dueDate) && (
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {item.owner}
                    {item.owner && item.dueDate && " · "}
                    {item.dueDate &&
                      new Date(item.dueDate).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
