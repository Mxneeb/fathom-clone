"use client";

import { useEffect, useRef, useState } from "react";
import { LinkIcon } from "@/components/icons";

export function ShareButton({ meetingId }: { meetingId: string }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openShare() {
    setOpen(true);
    if (link) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/share`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { token } = await res.json();
      setLink(`${window.location.origin}/share/${token}`);
    } catch {
      setError("Couldn't create a link. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openShare())}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-rule bg-card px-3.5 py-2 text-sm font-medium text-ink hover:border-ink-3"
      >
        <LinkIcon size={15} />
        Share
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-rule bg-card p-4 shadow-xl">
          <p className="text-sm font-medium text-ink">Share this meeting</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-3">
            Anyone with the link can watch the recording and read the transcript and summary. No sign-in needed; nothing
            can be edited.
          </p>
          {error ? (
            <p className="mt-3 text-xs text-bad">{error}</p>
          ) : (
            <div className="mt-3 flex gap-2">
              <input
                readOnly
                value={loading ? "Creating link…" : (link ?? "")}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Share link"
                className="min-w-0 flex-1 rounded-lg border border-rule bg-paper px-2.5 py-1.5 font-mono text-xs text-ink-2 outline-none"
              />
              <button
                type="button"
                disabled={!link}
                onClick={async () => {
                  if (!link) return;
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:bg-ink-2 disabled:opacity-50"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
