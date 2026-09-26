import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiErrorMessage, generateSummary } from "@/lib/ai";
import { resolveLineCitations } from "@/lib/citations";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  template: z.enum(["GENERAL", "SALES"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id, ownerId: session.user.id },
    include: { transcriptLines: { orderBy: { order: "asc" } } },
  });
  if (!meeting) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (meeting.transcriptLines.length === 0) {
    return NextResponse.json({ error: "meeting has no transcript yet" }, { status: 422 });
  }

  let content: string;
  try {
    content = resolveLineCitations(
      await generateSummary(
        meeting.transcriptLines.map((l) => ({ speakerName: l.speakerName, text: l.text })),
        parsed.data.template
      ),
      meeting.transcriptLines
    );
  } catch (err) {
    console.error("generateSummary failed", err);
    return NextResponse.json({ error: aiErrorMessage(err, "a summary") }, { status: 502 });
  }

  const summary = await prisma.summary.create({
    data: { meetingId: meeting.id, template: parsed.data.template, content },
  });

  return NextResponse.json({ summary });
}
