import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

// One access tier by design — "anyone with the link can view" — per the
// build plan. No tiered permissions, no auto-share-to-calendar-invitees
// automation.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const meeting = await prisma.meeting.findFirst({
    where: { id, ownerId: session.user.id },
  });
  if (!meeting) return NextResponse.json({ error: "not found" }, { status: 404 });

  const existing = await prisma.shareLink.findFirst({ where: { meetingId: meeting.id } });
  const shareLink =
    existing ??
    (await prisma.shareLink.create({
      data: { meetingId: meeting.id, token: randomBytes(16).toString("hex") },
    }));

  return NextResponse.json({ token: shareLink.token });
}
