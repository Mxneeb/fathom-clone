"use client";

import { useState } from "react";
import { renderMarkdown } from "@/lib/render-markdown";
import { Panel, QuietButton } from "@/components/panel";
import { SparkIcon } from "@/components/icons";

type Template = "GENERAL" | "SALES";
export type SummaryData = { id: string; template: Template; content: string };

const TEMPLATES: { id: Template; name: string; hint: string }[] = [
  { id: "GENERAL", name: "General", hint: "What was discussed, what was decided, what happens next." },
  { id: "SALES", name: "Sales", hint: "A BANT read of the call: budget, authority, need, timeline and the next step." },
];

export function SummaryPanel({
  meetingId,
  initialSummaries,
  onSeek,
  readOnly = false,
}: {
  meetingId: string;
  initialSummaries: SummaryData[];
  /** Jumps playback to a cited moment. */
  onSeek: (ms: number) => void;
  readOnly?: boolean;
}) {
  const [summaries, setSummaries] = useState(initialSummaries);
  const [active, setActive] = useState<Template>(initialSummaries[0]?.template ?? "GENERAL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = summaries.filter((s) => s.template === active).at(-1);
  const template = TEMPLATES.find((t) => t.id === active)!;
  const available = readOnly ? TEMPLATES.filter((t) => summaries.some((s) => s.template === t.id)) : TEMPLATES;

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: active }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const { summary } = await res.json();
      setSummaries((prev) => [...prev, summary]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel
      title="Summary"
      action={
        available.length > 1 && (
          <div role="tablist" aria-label="Summary template" className="flex rounded-lg border border-rule bg-paper p-0.5">
            {available.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={active === t.id}
                onClick={() => {
                  setActive(t.id);
                  setError(null);
                }}
                className={`rounded-md px-2.5 py-0.5 text-xs font-medium ${
                  active === t.id ? "bg-card text-ink shadow-sm" : "text-ink-3 hover:text-ink"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        )
      }
    >
      {current ? (
        <div className="space-y-3">
          {renderMarkdown(current.content, onSeek)}
          {!readOnly && (
            <div className="pt-1">
              <QuietButton onClick={generate} disabled={loading} className="-ml-2">
                {loading ? "Rewriting…" : "Regenerate"}
              </QuietButton>
            </div>
          )}
        </div>
      ) : readOnly ? (
        <p className="text-sm text-ink-3">No summary has been written for this meeting.</p>
      ) : (
        <div className="py-4 text-center">
          <p className="mx-auto mb-4 max-w-xs font-serif text-[15px] text-ink-2">{template.hint}</p>
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-paper hover:bg-ink-2 disabled:opacity-60"
          >
            <SparkIcon size={15} />
            {loading ? "Reading the transcript…" : `Write ${template.name.toLowerCase()} summary`}
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
    </Panel>
  );
}
