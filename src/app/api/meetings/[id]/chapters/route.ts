import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiErrorMessage } from "@/lib/ai";
import { writeChapters } from "@/lib/chapters";

// "Find topics": splits the meeting into chapters for the timeline.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const meeting = await prisma.meeting.findFirst({
    where: { id: (await params).id, ownerId: session.user.id },
    select: { id: true },
  });
  if (!meeting) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    return NextResponse.json({ chapters: await writeChapters(meeting.id) });
  } catch (err) {
    console.error("writeChapters failed", err);
    return NextResponse.json({ error: aiErrorMessage(err, "topics") }, { status: 502 });
  }
}
