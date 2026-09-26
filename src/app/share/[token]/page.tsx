import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDay, formatDuration, formatTime } from "@/lib/format";
import { Wordmark } from "@/components/brand";
import { MeetingView } from "@/components/meeting-view";

export const metadata = { title: "Shared meeting", robots: { index: false } };

// Public and unauthenticated: one access tier, "anyone with the link can
// view". Nothing on this page can change the meeting.
export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { token } = await params;
  const { t } = await searchParams;

  const shareLink = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      meeting: {
        include: {
          transcriptLines: { orderBy: { order: "asc" } },
          summaries: { orderBy: { generatedAt: "asc" } },
          actionItems: { orderBy: { createdAt: "asc" } },
          highlights: { orderBy: { timestampMs: "asc" } },
        },
      },
    },
  });
  if (!shareLink) notFound();
  const { meeting } = shareLink;
  const speakerCount = new Set(meeting.transcriptLines.map((l) => l.speakerName)).size;
  const seekMs = t && Number.isFinite(Number(t)) ? Math.max(0, Number(t)) : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/login" aria-label="Cue">
            <Wordmark />
          </Link>
          <span className="rounded-full bg-paper-2 px-2.5 py-0.5 text-xs font-medium text-ink-2">
            Shared meeting · view only
          </span>
          <Link
            href="/login"
            className="ml-auto rounded-lg border border-rule bg-card px-3 py-1.5 text-sm font-medium text-ink hover:border-ink-3"
          >
            Try Cue
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 sm:px-6">
        <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-[2.5rem]">
          {meeting.title}
        </h1>
        <p className="mb-6 mt-2 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
          <span>
            {formatDay(meeting.occurredAt)}, {formatTime(meeting.occurredAt)}
          </span>
          <span className="text-ink-3">·</span>
          <span>{formatDuration(meeting.durationSec)}</span>
          <span className="text-ink-3">·</span>
          <span>
            {speakerCount} {speakerCount === 1 ? "speaker" : "speakers"}
          </span>
        </p>

        <MeetingView
          readOnly
          meetingId={meeting.id}
          mediaUrl={meeting.mediaUrl}
          mediaType={meeting.mediaType}
          durationMs={meeting.durationSec * 1000}
          lines={meeting.transcriptLines.map((l) => ({
            id: l.id,
            speakerName: l.speakerName,
            startMs: l.startMs,
            endMs: l.endMs,
            text: l.text,
          }))}
          initialHighlights={meeting.highlights.map((h) => ({
            id: h.id,
            timestampMs: h.timestampMs,
            label: h.label,
            note: h.note,
          }))}
          initialActionItems={meeting.actionItems.map((a) => ({
            id: a.id,
            text: a.text,
            owner: a.owner,
            dueDate: a.dueDate ? a.dueDate.toISOString() : null,
            done: a.done,
            sourceMs: a.sourceMs,
          }))}
          initialSummaries={meeting.summaries.map((s) => ({ id: s.id, template: s.template, content: s.content }))}
          initialSeekMs={seekMs}
        />
      </main>
    </div>
  );
}
