import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Serves DB-stored bytes for uploaded recordings. Deliberately unauthenticated
// (same as the statically-served public/seed-media/*.wav files) — a meeting's
// media is only as protected as its cuid id, matching how sharing already
// works (§6: "anyone with the link can view").
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { mediaData: true, mediaMimeType: true },
  });

  if (!meeting?.mediaData) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(meeting.mediaData), {
    headers: {
      "Content-Type": meeting.mediaMimeType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
