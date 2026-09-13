import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { MeetingPlayer } from "@/components/meeting-player";
import { SummaryPanel } from "@/components/summary-panel";
import { ActionItemsPanel } from "@/components/action-items-panel";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const meeting = await prisma.meeting.findFirst({
    where: { id, ownerId: userId },
    include: {
      transcriptLines: { orderBy: { order: "asc" } },
      participants: true,
      summaries: { orderBy: { generatedAt: "asc" } },
      actionItems: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!meeting) notFound();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">{meeting.title}</h1>
        <div className="mt-1 text-sm text-neutral-500">
          {meeting.occurredAt.toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}{" "}
          · {meeting.participants.map((p) => p.name).join(", ")}
          {meeting.source === "SEED" && (
            <span className="ml-2 rounded border border-amber-700/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
              Sample meeting
            </span>
          )}
        </div>
      </div>

      <MeetingPlayer
        mediaUrl={meeting.mediaUrl}
        mediaType={meeting.mediaType}
        lines={meeting.transcriptLines.map((l) => ({
          id: l.id,
          speakerName: l.speakerName,
          startMs: l.startMs,
          endMs: l.endMs,
          text: l.text,
        }))}
      />

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <SummaryPanel meetingId={meeting.id} initialSummaries={meeting.summaries} />
        <ActionItemsPanel
          meetingId={meeting.id}
          initialItems={meeting.actionItems.map((a) => ({
            id: a.id,
            text: a.text,
            owner: a.owner,
            dueDate: a.dueDate ? a.dueDate.toISOString() : null,
            done: a.done,
          }))}
        />
      </div>
    </div>
  );
}
