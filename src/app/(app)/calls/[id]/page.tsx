import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDay, formatDuration, formatTime } from "@/lib/format";
import { MeetingView } from "@/components/meeting-view";
import { ShareButton } from "@/components/share-button";
import { ArrowLeftIcon } from "@/components/icons";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const meeting = session?.user?.id
    ? await prisma.meeting.findFirst({
        where: { id: (await params).id, ownerId: session.user.id },
        select: { title: true },
      })
    : null;
  return { title: meeting?.title ?? "Meeting" };
}

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const meeting = await prisma.meeting.findFirst({
    where: { id, ownerId: session.user.id },
    include: {
      transcriptLines: { orderBy: { order: "asc" } },
      participants: true,
      summaries: { orderBy: { generatedAt: "asc" } },
      actionItems: { orderBy: { createdAt: "asc" } },
      highlights: { orderBy: { timestampMs: "asc" } },
    },
  });
  if (!meeting) notFound();

  const seekMs = t && Number.isFinite(Number(t)) ? Math.max(0, Number(t)) : undefined;
  const speakerCount = new Set(meeting.transcriptLines.map((l) => l.speakerName)).size;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
      <Link href="/calls" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeftIcon size={15} />
        Meetings
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-[2.5rem]">
            {meeting.title}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
            <span>
              {formatDay(meeting.occurredAt)}, {formatTime(meeting.occurredAt)}
            </span>
            <span className="text-ink-3">·</span>
            <span>{formatDuration(meeting.durationSec)}</span>
            <span className="text-ink-3">·</span>
            <span>
              {meeting.speakerStatus === "PENDING" || meeting.speakerStatus === "PROCESSING"
                ? "Separating speakers…"
                : meeting.speakerStatus === "FAILED"
                  ? "Speakers not separated"
                  : `${speakerCount} ${speakerCount === 1 ? "speaker" : "speakers"}`}
            </span>
            {meeting.source === "SEED" && (
              <span className="rounded-full border border-rule-2 px-2 py-0.5 text-[11px] font-medium text-ink-3">
                Sample meeting
              </span>
            )}
          </p>
        </div>
        <ShareButton meetingId={meeting.id} />
      </div>

      <MeetingView
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
        speakerStatus={meeting.speakerStatus}
        speakerError={meeting.speakerError}
      />
    </div>
  );
}
