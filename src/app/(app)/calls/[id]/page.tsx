import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { MeetingPlayer } from "@/components/meeting-player";

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
    </div>
  );
}
