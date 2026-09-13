"use client";

import { useEffect, useRef, useState } from "react";

export type PlayerTranscriptLine = {
  id: string;
  speakerName: string;
  startMs: number;
  endMs: number;
  text: string;
};

function formatTimestamp(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MeetingPlayer({
  mediaUrl,
  mediaType,
  lines,
}: {
  mediaUrl: string;
  mediaType: "AUDIO" | "VIDEO";
  lines: PlayerTranscriptLine[];
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const userScrolledRef = useRef(false);

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

  const MediaTag = mediaType === "VIDEO" ? "video" : "audio";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <div className="lg:sticky lg:top-4 lg:self-start">
        <MediaTag
          ref={mediaRef as never}
          src={mediaUrl}
          controls
          className="w-full rounded-lg bg-black"
        />
        <div className="mt-2 text-xs text-neutral-500">
          {formatTimestamp(currentMs)}
        </div>
      </div>

      <div
        className="max-h-[70vh] overflow-y-auto rounded-lg border border-neutral-800 p-2"
        onWheel={() => (userScrolledRef.current = true)}
      >
        {lines.map((line) => {
          const isActive = line.id === activeLineId;
          return (
            <div
              key={line.id}
              ref={(el) => {
                if (el) lineRefs.current.set(line.id, el);
              }}
              onClick={() => {
                userScrolledRef.current = false;
                seekTo(line.startMs);
              }}
              className={`cursor-pointer rounded-md px-3 py-2 transition-colors ${
                isActive ? "bg-sky-500/15" : "hover:bg-neutral-900"
              }`}
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
              </div>
              <div
                className={`mt-0.5 text-sm leading-snug ${
                  isActive ? "text-neutral-50" : "text-neutral-300"
                }`}
              >
                {line.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
