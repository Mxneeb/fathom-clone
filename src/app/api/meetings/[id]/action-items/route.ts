import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateActionItems } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
    include: { transcriptLines: { orderBy: { order: "asc" } } },
  });
  if (!meeting) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (meeting.transcriptLines.length === 0) {
    return NextResponse.json({ error: "meeting has no transcript yet" }, { status: 422 });
  }

  let generated;
  try {
    generated = await generateActionItems(
      meeting.transcriptLines.map((l) => ({ speakerName: l.speakerName, text: l.text }))
    );
  } catch (err) {
    console.error("generateActionItems failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "generation failed" },
      { status: 502 }
    );
  }

  const created = await prisma.$transaction(
    generated.map((item) =>
      prisma.actionItem.create({
        data: {
          meetingId: meeting.id,
          text: item.text,
          owner: item.owner,
          dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
        },
      })
    )
  );

  return NextResponse.json({ actionItems: created });
}

const patchSchema = z.object({
  actionItemId: z.string(),
  done: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id, ownerId: session.user.id },
  });
  if (!meeting) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.actionItem.update({
    where: { id: parsed.data.actionItemId, meetingId: meeting.id },
    data: { done: parsed.data.done },
  });

  return NextResponse.json({ actionItem: updated });
}
