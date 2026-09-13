"use client";

import { useState } from "react";

export type SummaryData = { id: string; template: "GENERAL" | "SALES"; content: string };

const TEMPLATE_LABEL: Record<"GENERAL" | "SALES", string> = {
  GENERAL: "General",
  SALES: "Sales",
};

// Renders very simple markdown (## headings, **bold**, - bullets) without
// pulling in a markdown dependency — the generated summaries only ever use
// that small subset.
function renderMarkdown(md: string) {
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={elements.length} className="list-disc space-y-1 pl-5">
        {listBuffer.map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inline(item) }} />
        ))}
      </ul>
    );
    listBuffer = [];
  }

  function inline(text: string) {
    return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h3 key={elements.length} className="mt-4 text-sm font-semibold text-neutral-100 first:mt-0">
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith("- ")) {
      listBuffer.push(line.slice(2));
    } else if (line.length > 0) {
      flushList();
      elements.push(
        <p
          key={elements.length}
          className="text-sm leading-relaxed text-neutral-300"
          dangerouslySetInnerHTML={{ __html: inline(line) }}
        />
      );
    }
  }
  flushList();
  return elements;
}

export function SummaryPanel({
  meetingId,
  initialSummaries,
}: {
  meetingId: string;
  initialSummaries: SummaryData[];
}) {
  const [summaries, setSummaries] = useState(initialSummaries);
  const [activeTemplate, setActiveTemplate] = useState<"GENERAL" | "SALES">(
    initialSummaries[0]?.template ?? "GENERAL"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = summaries
    .filter((s) => s.template === activeTemplate)
    .at(-1);

  async function generate(template: "GENERAL" | "SALES") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const { summary } = await res.json();
      setSummaries((prev) => [...prev, summary]);
      setActiveTemplate(template);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Summary</h2>
        <div className="flex gap-1">
          {(["GENERAL", "SALES"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTemplate(t)}
              className={`rounded px-2 py-1 text-xs ${
                activeTemplate === t
                  ? "bg-sky-500/20 text-sky-300"
                  : "text-neutral-400 hover:bg-neutral-900"
              }`}
            >
              {TEMPLATE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {current ? (
        <div className="space-y-1">
          {renderMarkdown(current.content)}
          <button
            onClick={() => generate(activeTemplate)}
            disabled={loading}
            className="mt-3 text-xs text-neutral-500 underline hover:text-neutral-300 disabled:opacity-50"
          >
            {loading ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      ) : (
        <div className="py-6 text-center">
          <p className="mb-3 text-sm text-neutral-500">
            No {TEMPLATE_LABEL[activeTemplate].toLowerCase()} summary yet.
          </p>
          <button
            onClick={() => generate(activeTemplate)}
            disabled={loading}
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-900 disabled:opacity-50"
          >
            {loading ? "Generating…" : "Generate summary"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
