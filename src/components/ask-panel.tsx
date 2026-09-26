"use client";

import { useState } from "react";
import { renderMarkdown } from "@/lib/render-markdown";
import { Panel } from "@/components/panel";
import { SparkIcon } from "@/components/icons";

const SUGGESTIONS = ["What was decided?", "What's still open or risky?", "Who owns what?"];

type Exchange = { question: string; answer?: string; error?: string };

// "Ask this meeting": answers come from the transcript and cite the moments
// they're based on, as chips that jump there. Kept for this visit only.
export function AskPanel({ meetingId, onSeek }: { meetingId: string; onSeek: (ms: number) => void }) {
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [asking, setAsking] = useState(false);

  async function ask(q: string) {
    const text = q.trim();
    if (text.length < 2 || asking) return;
    setAsking(true);
    setQuestion("");
    setExchanges((prev) => [{ question: text }, ...prev]);
    let result: Exchange;
    try {
      const res = await fetch(`/api/meetings/${meetingId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const body = await res.json().catch(() => ({}));
      result = res.ok ? { question: text, answer: body.answer } : { question: text, error: body.error ?? "Couldn't answer that." };
    } catch {
      result = { question: text, error: "Couldn't reach the server." };
    }
    setExchanges((prev) => [result, ...prev.slice(1)]);
    setAsking(false);
  }

  return (
    <Panel title="Ask this meeting">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="e.g. What did we decide about notifications?"
          aria-label="Ask a question about this meeting"
          className="min-w-0 flex-1 rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
        />
        <button
          type="submit"
          disabled={asking || question.trim().length < 2}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-paper hover:bg-ink-2 disabled:opacity-40"
        >
          <SparkIcon size={14} />
          Ask
        </button>
      </form>

      {exchanges.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-full border border-rule px-2.5 py-1 text-xs text-ink-2 hover:border-ink-3 hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {exchanges.length > 0 && (
        <ol className="mt-4 space-y-4">
          {exchanges.map((x, i) => (
            <li key={exchanges.length - i} className="border-t border-rule/60 pt-3 first:border-t-0 first:pt-0">
              <p className="text-sm font-semibold text-ink">{x.question}</p>
              <div className="mt-1.5 space-y-2">
                {x.answer ? (
                  renderMarkdown(x.answer, onSeek)
                ) : x.error ? (
                  <p className="text-sm text-bad">{x.error}</p>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-ink-3">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    Reading the transcript…
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
