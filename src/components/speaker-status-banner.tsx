"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloseIcon } from "@/components/icons";

export type SpeakerStatus = "NONE" | "PENDING" | "PROCESSING" | "DONE" | "FAILED";

// Shown on an uploaded meeting while its speakers are separated in the
// background. Starts the job if nobody has yet, polls, and refreshes the
// page data in place when it's done: no reload, playback keeps going.
export function SpeakerStatusBanner({
  meetingId,
  initialStatus,
  initialError,
}: {
  meetingId: string;
  initialStatus: SpeakerStatus;
  initialError: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<SpeakerStatus>(initialStatus === "PENDING" ? "PROCESSING" : initialStatus);
  const [error, setError] = useState(initialError);
  const [finished, setFinished] = useState(false);
  const kickedOff = useRef(false);

  useEffect(() => {
    if (initialStatus !== "PENDING" || kickedOff.current) return;
    kickedOff.current = true;
    fetch(`/api/meetings/${meetingId}/speakers`, { method: "POST" }).catch(() => {});
  }, [initialStatus, meetingId]);

  useEffect(() => {
    if (status !== "PROCESSING") return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/meetings/${meetingId}/speakers`).catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as { status: SpeakerStatus; error: string | null };
      if (body.status === "DONE") {
        setStatus("DONE");
        setFinished(true);
        router.refresh();
      } else if (body.status === "FAILED") {
        setStatus("FAILED");
        setError(body.error);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [status, meetingId, router]);

  async function retry() {
    setStatus("PROCESSING");
    setError(null);
    await fetch(`/api/meetings/${meetingId}/speakers`, { method: "POST" }).catch(() => {});
  }

  if (status === "PROCESSING") {
    return (
      <div role="status" className="mb-4 flex items-center gap-3 rounded-xl border border-rule bg-card px-4 py-3 text-sm">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-ink-2">
          <span className="font-medium text-ink">Working out who&apos;s speaking.</span> Usually a minute or two; this
          page updates by itself. You can listen and read in the meantime.
        </p>
      </div>
    );
  }
  if (status === "FAILED") {
    return (
      <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-bad/30 bg-card px-4 py-3 text-sm">
        <p className="min-w-0 flex-1 text-ink-2">
          <span className="font-medium text-ink">Couldn&apos;t separate the speakers.</span> {error}
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:bg-ink-2"
        >
          Try again
        </button>
      </div>
    );
  }
  if (finished) {
    return (
      <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-good/30 bg-card px-4 py-3 text-sm">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-good" />
        <p className="min-w-0 flex-1 text-ink-2">
          <span className="font-medium text-ink">Speakers separated.</span> Names come from the conversation where it
          made them clear; click any name on the timeline to rename it, or give two the same name to merge them.
        </p>
        <button type="button" onClick={() => setFinished(false)} aria-label="Dismiss" className="rounded p-0.5 text-ink-3 hover:text-ink">
          <CloseIcon size={14} />
        </button>
      </div>
    );
  }
  return null;
}
