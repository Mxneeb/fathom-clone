import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribeAudio } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// The "upload a recording" entry point that stands in for real
// Zoom/Meet/Teams bot-join capture — see research/fathom-teardown.md
// "What I'd build first" #7. Real Whisper transcription (src/lib/ai.ts),
// not a mock; speaker diarization is out of scope so every segment is
// attributed to a single "Speaker" participant.
//
// The client has already uploaded the raw audio directly to Vercel Blob
// (src/app/api/blob/upload-url/route.ts) before calling this route — we
// only ever receive the resulting blob URL here (JSON, not multipart),
// specifically to stay well under Vercel's ~4.5MB Serverless Function
// request body cap for real meeting-length recordings.
const bodySchema = z.object({
  blobUrl: z.string().url(),
  title: z.string().min(1),
  mediaType: z.enum(["AUDIO", "VIDEO"]).default("AUDIO"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "blobUrl and title are required" }, { status: 400 });
  }
  const { blobUrl, title, mediaType } = parsed.data;

  let segments;
  try {
    segments = await transcribeAudio(blobUrl);
  } catch (err) {
    console.error("transcribeAudio failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "transcription failed" },
      { status: 502 }
    );
  }

  const durationSec = Math.max(1, Math.round((segments.at(-1)?.endMs ?? 0) / 1000));

  const meeting = await prisma.meeting.create({
    data: {
      ownerId: session.user.id,
      title: title.trim(),
      occurredAt: new Date(),
      durationSec,
      mediaUrl: blobUrl,
      mediaType,
      source: "UPLOAD",
    },
  });

  const speaker = await prisma.participant.create({
    data: { meetingId: meeting.id, name: "Speaker", isHost: true },
  });

  await prisma.transcriptLine.createMany({
    data: segments.map((s, i) => ({
      meetingId: meeting.id,
      participantId: speaker.id,
      speakerName: "Speaker",
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
      order: i,
    })),
  });

  return NextResponse.json({ meetingId: meeting.id });
}
