import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiErrorMessage, answerQuestion } from "@/lib/ai";
import { resolveLineCitations } from "@/lib/citations";

const bodySchema = z.object({ question: z.string().trim().min(2).max(500) });

// "Ask this meeting": an answer from the transcript, citing the moments it
// came from. Owner only; nothing is stored.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ask a question (up to 500 characters)." }, { status: 400 });

  const meeting = await prisma.meeting.findFirst({
    where: { id: (await params).id, ownerId: session.user.id },
    select: { transcriptLines: { orderBy: { order: "asc" }, select: { speakerName: true, text: true, startMs: true } } },
  });
  if (!meeting) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (meeting.transcriptLines.length === 0) {
    return NextResponse.json({ error: "This meeting has no transcript yet." }, { status: 422 });
  }

  try {
    const answer = await answerQuestion(meeting.transcriptLines, parsed.data.question);
    return NextResponse.json({ answer: resolveLineCitations(answer, meeting.transcriptLines) });
  } catch (err) {
    console.error("answerQuestion failed", err);
    return NextResponse.json({ error: aiErrorMessage(err, "an answer") }, { status: 502 });
  }
}
