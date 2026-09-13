import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  timestampMs: z.number().int().nonnegative(),
  label: z.enum(["HIGHLIGHT", "POSITIVE_REACTION", "NEEDS_REVIEW", "FEEDBACK"]),
  note: z.string().max(500).optional(),
});

// Lightweight highlighting per the build plan: a timestamp + label + short
// note, deep-linking into the full recording — no clip file is generated.
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
  });
  if (!meeting) return NextResponse.json({ error: "not found" }, { status: 404 });

  const highlight = await prisma.highlight.create({
    data: {
      meetingId: meeting.id,
      timestampMs: parsed.data.timestampMs,
      label: parsed.data.label,
      note: parsed.data.note,
    },
  });

  return NextResponse.json({ highlight });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { highlightId } = (await req.json()) as { highlightId?: string };
  if (!highlightId) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const meeting = await prisma.meeting.findFirst({
    where: { id, ownerId: session.user.id },
  });
  if (!meeting) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.highlight.delete({ where: { id: highlightId, meetingId: meeting.id } });
  return NextResponse.json({ ok: true });
}
