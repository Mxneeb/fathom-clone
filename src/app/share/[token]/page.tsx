import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { MeetingPlayer } from "@/components/meeting-player";
import { renderMarkdown } from "@/lib/render-markdown";

// Public, unauthenticated share view — "anyone with the link can view," per
// the build plan's single access tier. No account needed to open this page.
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const shareLink = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      meeting: {
        include: {
          transcriptLines: { orderBy: { order: "asc" } },
          participants: true,
          summaries: { orderBy: { generatedAt: "asc" } },
          highlights: { orderBy: { timestampMs: "asc" } },
        },
      },
    },
  });

  if (!shareLink) notFound();
  const { meeting } = shareLink;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-3">
        <span className="text-sm font-semibold tracking-tight">FATHOM CLONE</span>
        <span className="ml-2 text-xs text-neutral-500">Shared recording</span>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold">{meeting.title}</h1>
          <div className="mt-1 text-sm text-neutral-500">
            {meeting.occurredAt.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            · {meeting.participants.map((p) => p.name).join(", ")}
          </div>
        </div>

        <MeetingPlayer
          meetingId={meeting.id}
          mediaUrl={meeting.mediaUrl}
          mediaType={meeting.mediaType}
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
          readOnly
        />

        {meeting.summaries.length > 0 && (
          <div className="mt-8 max-w-2xl rounded-lg border border-neutral-800 p-4">
            <h2 className="mb-3 text-sm font-semibold">Summary</h2>
            <div className="space-y-1">
              {renderMarkdown(meeting.summaries[meeting.summaries.length - 1].content)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
