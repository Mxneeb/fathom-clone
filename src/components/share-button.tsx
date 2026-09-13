"use client";

import { useState } from "react";

export function ShareButton({ meetingId }: { meetingId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function getShareLink() {
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/share`, { method: "POST" });
      if (res.ok) {
        const { token } = await res.json();
        setLink(`${window.location.origin}/share/${token}`);
      }
    } finally {
      setLoading(false);
    }
  }

  if (link) {
    return (
      <div className="flex items-center gap-2 rounded border border-neutral-700 px-2 py-1 text-xs">
        <span className="max-w-[220px] truncate text-neutral-300">{link}</span>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={getShareLink}
      disabled={loading}
      className="rounded border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-900 disabled:opacity-50"
    >
      {loading ? "Creating link…" : "Share"}
    </button>
  );
}
