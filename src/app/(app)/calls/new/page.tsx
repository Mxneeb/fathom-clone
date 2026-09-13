"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewCallPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loading = status !== null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    try {
      // Upload straight from the browser to Vercel Blob storage — never
      // through our own Serverless Function, which caps request bodies at
      // ~4.5MB (too small for a real meeting-length recording). See
      // src/app/api/blob/upload-url/route.ts for the token-issuing side.
      setStatus("Uploading…");
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload-url",
        onUploadProgress: ({ percentage }) => {
          setStatus(`Uploading… ${Math.round(percentage)}%`);
        },
      });

      setStatus("Transcribing… (can take a moment)");
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: blob.url,
          title: title.trim() || file.name,
          mediaType: file.type.startsWith("video/") ? "VIDEO" : "AUDIO",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      const { meetingId } = await res.json();
      router.push(`/calls/${meetingId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="mb-2 text-lg font-semibold">Upload a recording</h1>

      <div className="mb-6 rounded-md border border-amber-700/40 bg-amber-500/5 p-3 text-xs text-neutral-400">
        <strong className="text-amber-400">Why upload, not a live bot?</strong> Getting a bot
        into a real Zoom/Meet/Teams call is real infrastructure work (audio capture,
        streaming ASR) that&apos;s out of scope for this build — deliberately, not as an
        oversight. Fathom itself does something similar for brand-new signups: its
        &ldquo;Start Test Call&rdquo; onboarding flow is explicitly &ldquo;just a
        recording,&rdquo; not a live meeting either. Everything downstream of this
        upload — transcript, summary, action items, highlights, search, sharing — is
        real, including the transcription itself (Groq-hosted Whisper).
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Audio file</label>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-neutral-300 file:mr-3 file:rounded file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-xs file:text-neutral-200 hover:file:bg-neutral-700"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Title (optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={file?.name ?? "Meeting title"}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={!file || loading}
          className="rounded bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          {loading ? status : "Upload & transcribe"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </form>
    </div>
  );
}
