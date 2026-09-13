"use client";

import { useEffect, useRef, useState } from "react";

export type PlayerTranscriptLine = {
  id: string;
  speakerName: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type HighlightLabel = "HIGHLIGHT" | "POSITIVE_REACTION" | "NEEDS_REVIEW" | "FEEDBACK";
export type PlayerHighlight = { id: string; timestampMs: number; label: HighlightLabel; note: string | null };

const LABEL_CONFIG: Record<
  HighlightLabel,
  { name: string; dot: string; text: string; border: string }
> = {
  HIGHLIGHT: { name: "Highlight", dot: "bg-sky-500", text: "text-sky-400", border: "border-sky-500" },
  POSITIVE_REACTION: {
    name: "Positive Reaction",
    dot: "bg-emerald-500",
    text: "text-emerald-400",
    border: "border-emerald-500",
  },
  NEEDS_REVIEW: {
    name: "Needs Review",
    dot: "bg-amber-500",
    text: "text-amber-400",
    border: "border-amber-500",
  },
  FEEDBACK: {
    name: "Feedback",
    dot: "bg-orange-500",
    text: "text-orange-400",
    border: "border-orange-500",
  },
};

function formatTimestamp(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MeetingPlayer({
  meetingId,
  mediaUrl,
  mediaType,
  lines,
  initialHighlights,
  initialSeekMs,
  readOnly = false,
}: {
  meetingId: string;
  mediaUrl: string;
  mediaType: "AUDIO" | "VIDEO";
  lines: PlayerTranscriptLine[];
  initialHighlights: PlayerHighlight[];
  /** Arriving from a search result — jump straight to this moment, per
   * Fathom's own "click Play next to filtered search results" behavior. */
  initialSeekMs?: number;
  /** Public share view: hide highlight-adding controls (no auth to persist
   * them against). Existing highlights are still shown. */
  readOnly?: boolean;
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeLineId, setActiveLineId] = useState<string | null>(
    initialSeekMs != null
      ? lines.find((l) => initialSeekMs >= l.startMs && initialSeekMs < l.endMs)?.id ?? null
      : null
  );
  const [currentMs, setCurrentMs] = useState(0);
  const userScrolledRef = useRef(false);
  const [highlights, setHighlights] = useState(initialHighlights);
  const [pickerForLineId, setPickerForLineId] = useState<string | null>(null);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || initialSeekMs == null) return;

    function onLoadedMetadata() {
      if (!media) return;
      media.currentTime = initialSeekMs! / 1000;
      media.play().catch(() => {
        // Autoplay can be blocked without a direct user gesture — seeking
        // still succeeds, the user just has to press play themselves.
      });
    }
    media.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => media.removeEventListener("loadedmetadata", onLoadedMetadata);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    function onTimeUpdate() {
      const ms = (media?.currentTime ?? 0) * 1000;
      setCurrentMs(ms);
      const active = lines.find((l) => ms >= l.startMs && ms < l.endMs);
      setActiveLineId(active?.id ?? null);
    }

    media.addEventListener("timeupdate", onTimeUpdate);
    return () => media.removeEventListener("timeupdate", onTimeUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  useEffect(() => {
    if (!activeLineId || userScrolledRef.current) return;
    const el = lineRefs.current.get(activeLineId);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeLineId]);

  function seekTo(startMs: number) {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = startMs / 1000;
    media.play();
  }

  async function addHighlight(line: PlayerTranscriptLine, label: HighlightLabel) {
    setPickerForLineId(null);
    const res = await fetch(`/api/meetings/${meetingId}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestampMs: line.startMs, label }),
    });
    if (res.ok) {
      const { highlight } = await res.json();
      setHighlights((prev) => [...prev, highlight]);
    }
  }

  function highlightForLine(line: PlayerTranscriptLine) {
    return highlights.find((h) => h.timestampMs >= line.startMs && h.timestampMs < line.endMs);
  }

  const MediaTag = mediaType === "VIDEO" ? "video" : "audio";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <div className="lg:sticky lg:top-4 lg:self-start">
        <MediaTag
          ref={mediaRef as never}
          src={mediaUrl}
          controls
          preload={initialSeekMs != null ? "auto" : "metadata"}
          className="w-full rounded-lg bg-black"
        />
        <div className="mt-2 text-xs text-neutral-500">
          {formatTimestamp(currentMs)}
        </div>

        {highlights.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold text-neutral-400">
              Highlights ({highlights.length})
            </div>
            <div className="flex flex-col gap-1">
              {[...highlights]
                .sort((a, b) => a.timestampMs - b.timestampMs)
                .map((h) => (
                  <button
                    key={h.id}
                    onClick={() => seekTo(h.timestampMs)}
                    className="flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-neutral-900"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${LABEL_CONFIG[h.label].dot}`} />
                    <span className="text-neutral-500">{formatTimestamp(h.timestampMs)}</span>
                    <span className={LABEL_CONFIG[h.label].text}>{LABEL_CONFIG[h.label].name}</span>
                    {h.note && <span className="truncate text-neutral-400">— {h.note}</span>}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      <div
        className="max-h-[70vh] overflow-y-auto rounded-lg border border-neutral-800 p-2"
        onWheel={() => (userScrolledRef.current = true)}
      >
        {lines.map((line) => {
          const isActive = line.id === activeLineId;
          const existingHighlight = highlightForLine(line);
          return (
            <div
              key={line.id}
              ref={(el) => {
                if (el) lineRefs.current.set(line.id, el);
              }}
              className={`group relative rounded-md px-3 py-2 transition-colors ${
                isActive ? "bg-sky-500/15" : "hover:bg-neutral-900"
              } ${existingHighlight ? `border-l-2 ${LABEL_CONFIG[existingHighlight.label].border}` : ""}`}
            >
              <div
                onClick={() => {
                  userScrolledRef.current = false;
                  seekTo(line.startMs);
                }}
                className="cursor-pointer"
              >
                <div className="flex items-baseline gap-2 text-xs">
                  <span
                    className={`font-medium ${isActive ? "text-sky-400" : "text-neutral-400"}`}
                  >
                    {line.speakerName}
                  </span>
                  <span className="text-neutral-600">
                    {formatTimestamp(line.startMs)}
                  </span>
                  {existingHighlight && (
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] ${LABEL_CONFIG[existingHighlight.label].text}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${LABEL_CONFIG[existingHighlight.label].dot}`} />
                      {LABEL_CONFIG[existingHighlight.label].name}
                    </span>
                  )}
                </div>
                <div
                  className={`mt-0.5 text-sm leading-snug ${
                    isActive ? "text-neutral-50" : "text-neutral-300"
                  }`}
                >
                  {line.text}
                </div>
              </div>

              {!readOnly && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPickerForLineId(pickerForLineId === line.id ? null : line.id);
                  }}
                  title="Highlight this moment"
                  className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-xs text-neutral-600 opacity-0 hover:bg-neutral-800 hover:text-neutral-200 group-hover:opacity-100"
                >
                  ✦
                </button>
              )}

              {!readOnly && pickerForLineId === line.id && (
                <div className="absolute right-2 top-8 z-10 flex flex-col gap-0.5 rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-lg">
                  {(Object.keys(LABEL_CONFIG) as HighlightLabel[]).map((label) => (
                    <button
                      key={label}
                      onClick={(e) => {
                        e.stopPropagation();
                        addHighlight(line, label);
                      }}
                      className="flex items-center gap-2 whitespace-nowrap rounded px-2 py-1 text-left text-xs text-neutral-300 hover:bg-neutral-800"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${LABEL_CONFIG[label].dot}`} />
                      {LABEL_CONFIG[label].name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
