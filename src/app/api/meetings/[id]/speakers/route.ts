import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { separateSpeakers, STALE_AFTER_MS } from "@/lib/speaker-separation";

// Separation runs after the response, in this invocation's own time budget.
export const maxDuration = 300;

async function ownedMeeting(id: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.meeting.findFirst({
    where: { id, ownerId: session.user.id },
    select: { id: true, source: true, speakerStatus: true, speakerStartedAt: true, speakerError: true },
  });
}

const isStale = (m: { speakerStatus: string; speakerStartedAt: Date | null }) =>
  m.speakerStatus === "PROCESSING" && !!m.speakerStartedAt && Date.now() - m.speakerStartedAt.getTime() > STALE_AFTER_MS;

// Polled by the meeting page while speakers are being separated.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const meeting = await ownedMeeting((await params).id);
  if (!meeting) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    status: isStale(meeting) ? "FAILED" : meeting.speakerStatus,
    error: isStale(meeting) ? "This took longer than expected and was stopped." : meeting.speakerError,
  });
}

// Starts (or retries) separation. Responds straight away; the page polls.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const meeting = await ownedMeeting((await params).id);
  if (!meeting) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (meeting.source !== "UPLOAD") return NextResponse.json({ error: "not an upload" }, { status: 400 });

  after(() => separateSpeakers(meeting.id, req.nextUrl.origin));
  return NextResponse.json({ status: "PROCESSING" }, { status: 202 });
}

const renameSchema = z.object({
  from: z.string().min(1).max(80),
  to: z.string().trim().min(1).max(40),
});

// Renames a speaker throughout the meeting. Renaming to a name already in
// use merges the two, which fixes one person split into two voices.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const meeting = await ownedMeeting((await params).id);
  if (!meeting) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = renameSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { from, to } = parsed.data;
  if (from === to) return NextResponse.json({ ok: true });

  const [fromP, toP] = await Promise.all([
    prisma.participant.findFirst({ where: { meetingId: meeting.id, name: from } }),
    prisma.participant.findFirst({ where: { meetingId: meeting.id, name: to } }),
  ]);

  await prisma.$transaction([
    prisma.transcriptLine.updateMany({
      where: { meetingId: meeting.id, speakerName: from },
      data: { speakerName: to, ...(toP ? { participantId: toP.id } : {}) },
    }),
    ...(fromP && toP
      ? [prisma.participant.delete({ where: { id: fromP.id } })]
      : fromP
        ? [prisma.participant.update({ where: { id: fromP.id }, data: { name: to } })]
        : []),
  ]);
  return NextResponse.json({ ok: true, merged: Boolean(toP) });
}
