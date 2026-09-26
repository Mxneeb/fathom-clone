"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speakerStats } from "@/lib/speakers";
import type { HighlightLabel } from "@/lib/highlights";
import { TimelineMap, type TimelinePin } from "@/components/timeline-map";
import { Transcript } from "@/components/transcript";
import { PlayerBar } from "@/components/player-bar";
import { SummaryPanel, type SummaryData } from "@/components/summary-panel";
import { ActionItemsPanel, type ActionItemData } from "@/components/action-items-panel";
import { HighlightsPanel, type HighlightData } from "@/components/highlights-panel";
import { HighlightComposer } from "@/components/highlight-composer";

export type LineData = { id: string; speakerName: string; startMs: number; endMs: number; text: string };

// The line being spoken at `ms` — or, in a pause between lines, the one just
// finished, so the transcript doesn't flicker between turns.
function lineAt(lines: LineData[], ms: number) {
  let found: LineData | null = null;
  for (const l of lines) {
    if (l.startMs > ms) break;
    found = l;
  }
  return found;
}

export function MeetingView({
  meetingId,
  mediaUrl,
  mediaType,
  durationMs,
  lines,
  initialHighlights,
  initialActionItems,
  initialSummaries,
  initialSeekMs,
  readOnly = false,
}: {
  meetingId: string;
  mediaUrl: string;
  mediaType: "AUDIO" | "VIDEO";
  durationMs: number;
  lines: LineData[];
  initialHighlights: HighlightData[];
  initialActionItems: ActionItemData[];
  initialSummaries: SummaryData[];
  /** From a search result or shared moment: start positioned here. */
  initialSeekMs?: number;
  /** Public share view: nothing can be changed. */
  readOnly?: boolean;
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [currentMs, setCurrentMs] = useState(initialSeekMs ?? 0);
  const currentMsRef = useRef(currentMs);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [rate, setRate] = useState(1);
  const [followSignal, setFollowSignal] = useState(0);
  const [highlights, setHighlights] = useState(initialHighlights);
  const [actionItems, setActionItems] = useState(initialActionItems);
  const [composerAt, setComposerAt] = useState<number | null>(null);

  const totalMs = Math.max(durationMs, lines.at(-1)?.endMs ?? 0, 1000);
  const speakers = useMemo(() => speakerStats(lines), [lines]);
  const colorBySpeaker = useMemo(() => new Map(speakers.map((s) => [s.name, s.color])), [speakers]);
  const activeLine = useMemo(() => lineAt(lines, currentMs), [lines, currentMs]);

  useEffect(() => {
    currentMsRef.current = currentMs;
  }, [currentMs]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const onTime = () => setCurrentMs(media.currentTime * 1000);
    // "Playing" in intent until the audio can actually play: show that.
    const onPlay = () => {
      setPlaying(true);
      setBuffering(media.readyState < 3);
    };
    const onPause = () => {
      setPlaying(false);
      setBuffering(false);
    };
    const onWaiting = () => setBuffering(true);
    const onReady = () => setBuffering(false);
    media.addEventListener("timeupdate", onTime);
    media.addEventListener("play", onPlay);
    media.addEventListener("pause", onPause);
    media.addEventListener("ended", onPause);
    media.addEventListener("waiting", onWaiting);
    media.addEventListener("playing", onReady);
    media.addEventListener("canplay", onReady);
    if (initialSeekMs != null) {
      const apply = () => void (media.currentTime = initialSeekMs / 1000);
      if (media.readyState >= 1) apply();
      else media.addEventListener("loadedmetadata", apply, { once: true });
    }
    return () => {
      media.removeEventListener("timeupdate", onTime);
      media.removeEventListener("play", onPlay);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("ended", onPause);
      media.removeEventListener("waiting", onWaiting);
      media.removeEventListener("playing", onReady);
      media.removeEventListener("canplay", onReady);
    };
  }, [initialSeekMs]);

  const seek = useCallback(
    (ms: number, play = true) => {
      const media = mediaRef.current;
      if (!media) return;
      const clamped = Math.min(Math.max(ms, 0), totalMs);
      media.currentTime = clamped / 1000;
      setCurrentMs(clamped);
      setFollowSignal((s) => s + 1);
      if (play) media.play().catch(() => {});
    },
    [totalMs]
  );

  const togglePlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) media.play().catch(() => {});
    else media.pause();
  }, []);

  const skip = useCallback(
    (deltaMs: number) => seek(currentMsRef.current + deltaMs, !(mediaRef.current?.paused ?? true)),
    [seek]
  );

  const closeComposer = useCallback(() => setComposerAt(null), []);
  const highlightLine = useCallback((line: LineData) => setComposerAt(line.startMs), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (composerAt != null || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === " ") {
        if (target.closest("button, a, [role='slider'], [role='checkbox'], [role='tab']")) return;
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        skip(e.key === "ArrowLeft" ? -5000 : 5000);
      } else if (e.key.toLowerCase() === "h" && !readOnly) {
        e.preventDefault();
        setComposerAt(currentMsRef.current);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composerAt, readOnly, skip, togglePlay]);

  async function saveHighlight(label: HighlightLabel, note: string) {
    if (composerAt == null) return;
    const res = await fetch(`/api/meetings/${meetingId}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestampMs: Math.round(composerAt), label, note: note || undefined }),
    });
    if (!res.ok) throw new Error("Couldn't save the highlight — try again.");
    const { highlight } = (await res.json()) as { highlight: HighlightData };
    setHighlights((prev) => [...prev, highlight]);
    setComposerAt(null);
  }

  async function deleteHighlight(id: string) {
    const removed = highlights.find((h) => h.id === id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    const res = await fetch(`/api/meetings/${meetingId}/highlights`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ highlightId: id }),
    });
    if (!res.ok && removed) setHighlights((prev) => [...prev, removed]);
  }

  const pins = useMemo<TimelinePin[]>(
    () => [
      ...highlights.map((h) => ({
        kind: "highlight" as const,
        id: h.id,
        ms: h.timestampMs,
        label: h.label,
        text: h.note ?? lineAt(lines, h.timestampMs)?.text ?? "",
      })),
      ...actionItems
        .filter((a) => a.sourceMs != null)
        .map((a) => ({ kind: "action" as const, id: a.id, ms: a.sourceMs!, done: a.done, text: a.text })),
    ],
    [highlights, actionItems, lines]
  );

  const composerLine = composerAt != null ? lineAt(lines, composerAt) : null;

  return (
    <>
      {mediaType === "AUDIO" && (
        <audio ref={(el) => void (mediaRef.current = el)} src={mediaUrl} preload="metadata" />
      )}

      <TimelineMap
        lines={lines}
        speakers={speakers}
        totalMs={totalMs}
        currentMs={currentMs}
        activeLine={activeLine}
        pins={pins}
        onSeek={seek}
      />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-6">
          {mediaType === "VIDEO" && (
            <video
              ref={(el) => void (mediaRef.current = el)}
              src={mediaUrl}
              preload="metadata"
              playsInline
              onClick={togglePlay}
              className="w-full rounded-2xl border border-rule bg-ink"
            />
          )}
          <SummaryPanel meetingId={meetingId} initialSummaries={initialSummaries} readOnly={readOnly} />
          <ActionItemsPanel
            meetingId={meetingId}
            items={actionItems}
            onItemsChange={setActionItems}
            onSeek={seek}
            readOnly={readOnly}
          />
          <HighlightsPanel
            highlights={highlights}
            lines={lines}
            onSeek={seek}
            onAdd={readOnly ? undefined : () => setComposerAt(currentMsRef.current)}
            onDelete={readOnly ? undefined : deleteHighlight}
          />
        </div>
        <Transcript
          lines={lines}
          colorBySpeaker={colorBySpeaker}
          activeLineId={activeLine?.id ?? null}
          highlights={highlights}
          onSeek={seek}
          onHighlightLine={readOnly ? undefined : highlightLine}
          followSignal={followSignal}
        />
      </div>

      <PlayerBar
        playing={playing}
        buffering={buffering}
        currentMs={currentMs}
        totalMs={totalMs}
        rate={rate}
        onToggle={togglePlay}
        onSeek={(ms) => seek(ms, false)}
        onSkip={skip}
        onRate={(r) => {
          if (mediaRef.current) mediaRef.current.playbackRate = r;
          setRate(r);
        }}
        onHighlight={readOnly ? undefined : () => setComposerAt(currentMsRef.current)}
      />

      {composerAt != null && (
        <HighlightComposer
          atMs={composerAt}
          context={composerLine ?? undefined}
          onCancel={closeComposer}
          onSave={saveHighlight}
        />
      )}
    </>
  );
}
