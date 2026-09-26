// The Cue mark: a cue point — a short vertical tick with a notch, the same
// shape as the playhead on the meeting timeline.
export function CueMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="0" y="0" width="24" height="24" rx="6" fill="var(--accent)" />
      <rect x="10.5" y="5" width="3" height="14" rx="1.5" fill="var(--paper)" />
      <path d="M8 5h8l-4 4z" fill="var(--paper)" />
    </svg>
  );
}

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <CueMark className={size === "lg" ? "h-8 w-8" : "h-6 w-6"} />
      <span
        className={`font-serif font-semibold tracking-tight text-ink ${
          size === "lg" ? "text-3xl" : "text-xl"
        }`}
      >
        Cue
      </span>
    </span>
  );
}
