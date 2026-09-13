import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribeAudio } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";

// The "upload a recording" entry point that stands in for real
// Zoom/Meet/Teams bot-join capture — see research/fathom-teardown.md
// "What I'd build first" #7. Real Whisper transcription (src/lib/ai.ts),
// not a mock; speaker diarization is out of scope so every segment is
// attributed to a single "Speaker" participant.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const title = form.get("title");
  if (!(file instanceof File) || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "file and title are required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "audio/mpeg";

  let segments;
  try {
    segments = await transcribeAudio(buffer, file.name, mimeType);
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
      mediaUrl: "", // set below once we have the meeting id
      mediaType: mimeType.startsWith("video/") ? "VIDEO" : "AUDIO",
      mediaData: buffer,
      mediaMimeType: mimeType,
      source: "UPLOAD",
    },
  });

  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { mediaUrl: `/api/media/${meeting.id}` },
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
