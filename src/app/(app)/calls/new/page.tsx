"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { UploadIcon } from "@/components/icons";

type Stage = "idle" | "uploading" | "transcribing" | "opening";

const STEPS: { stage: Exclude<Stage, "idle">; label: string }[] = [
  { stage: "uploading", label: "Upload" },
  { stage: "transcribing", label: "Transcribe" },
  { stage: "opening", label: "Open" },
];

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = stage !== "idle";

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (!f.type.startsWith("audio/")) {
      setError("That doesn't look like an audio file. Try an MP3, M4A, WAV or similar.");
      return;
    }
    setError(null);
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    try {
      // Straight from the browser to Blob storage, never through our own
      // function, whose request bodies cap out around 4.5MB.
      setStage("uploading");
      setProgress(0);
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload-url",
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });

      setStage("transcribing");
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: blob.url,
          title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
          mediaType: "AUDIO",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Transcription failed (${res.status})`);
      }
      const { meetingId } = await res.json();
      setStage("opening");
      router.push(`/calls/${meetingId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStage("idle");
    }
  }

  const currentStep = STEPS.findIndex((s) => s.stage === stage);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink">Upload a recording</h1>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">
        Cue transcribes it, maps who spoke when, and gets it ready for summaries, action items, highlights and search.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose an audio file"
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) pick(e.dataTransfer.files[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            dragging ? "border-accent bg-accent-soft/50" : "border-rule-2 bg-card hover:border-ink-3"
          } ${busy ? "pointer-events-none opacity-70" : ""}`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-paper-2 text-ink-2">
            <UploadIcon size={20} />
          </span>
          {file ? (
            <>
              <p className="mt-3 max-w-full truncate font-medium text-ink">{file.name}</p>
              <p className="mt-0.5 text-sm text-ink-3">{formatSize(file.size)} · click to choose another</p>
            </>
          ) : (
            <>
              <p className="mt-3 font-medium text-ink">Drop an audio file here, or click to choose one</p>
              <p className="mt-0.5 text-sm text-ink-3">MP3, M4A, WAV, OGG… up to 500 MB</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Title <span className="font-normal text-ink-3">(optional)</span>
          </span>
          <input
            type="text"
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={file ? file.name.replace(/\.[^.]+$/, "") : "e.g. Weekly product sync"}
            className="w-full rounded-lg border border-rule bg-card px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
          />
        </label>

        {busy ? (
          <ol className="rounded-2xl border border-rule bg-card p-5">
            {STEPS.map((s, i) => {
              const done = i < currentStep;
              const now = i === currentStep;
              return (
                <li key={s.stage} className="flex items-center gap-3 py-1.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      done ? "bg-good text-card" : now ? "bg-ink text-paper" : "bg-paper-2 text-ink-3"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className={`text-sm ${now ? "font-medium text-ink" : done ? "text-ink-2" : "text-ink-3"}`}>
                    {s.label}
                    {now && s.stage === "uploading" && ` · ${Math.round(progress)}%`}
                    {now && s.stage === "transcribing" && " · roughly a minute per 15 minutes of audio"}
                  </span>
                  {now && s.stage === "uploading" && (
                    <span className="ml-auto h-1.5 w-32 overflow-hidden rounded-full bg-paper-2">
                      <span className="block h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <button
            type="submit"
            disabled={!file}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:bg-ink-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Upload and transcribe
          </button>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
      </form>

      <aside className="mt-10 rounded-2xl border border-rule bg-paper-2/50 p-5 text-sm leading-relaxed text-ink-2">
        <h2 className="font-semibold text-ink">Why an upload, and not a bot that joins the call?</h2>
        <p className="mt-1.5">
          Getting a bot into live Zoom, Meet or Teams calls is real-time audio infrastructure, and it&apos;s left out of
          this build on purpose. Fathom&apos;s own onboarding does the same thing: its test call is a recording, not a
          live meeting. Everything after capture is real here: Whisper transcription (via Groq), the timeline,
          summaries, action items, search and sharing.
        </p>
        <p className="mt-2">
          Whisper doesn&apos;t tell voices apart, so after transcription Cue separates speakers by voice in the
          background (open-source models, on our own server). The meeting opens straight away and updates itself when
          that&apos;s done, usually within a minute or two. It suggests names where the conversation makes them clear,
          and you can rename anyone. On this server that works for recordings up to about half an hour; longer ones
          keep a single speaker.
        </p>
      </aside>
    </div>
  );
}
