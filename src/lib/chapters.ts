import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateChapters } from "@/lib/ai";

// Asks the model for the meeting's topics and replaces its chapters with
// them. Used by "Find topics" and, for uploads, by the background job.
export async function writeChapters(meetingId: string) {
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    select: {
      durationSec: true,
      transcriptLines: { orderBy: { order: "asc" }, select: { speakerName: true, text: true, startMs: true, endMs: true } },
    },
  });
  const lines = meeting.transcriptLines;
  if (lines.length < 4) throw new Error("This recording is too short to split into topics.");

  const totalMs = Math.max(meeting.durationSec * 1000, lines.at(-1)!.endMs);
  const raw = await generateChapters(lines, totalMs / 60_000);
  const chapters = raw.map((c, i) => ({
    id: randomUUID(),
    meetingId,
    title: c.title,
    startMs: i === 0 ? 0 : lines[c.startLine].startMs,
    endMs: i + 1 < raw.length ? lines[raw[i + 1].startLine].startMs : totalMs,
    order: i,
  }));

  await prisma.$transaction([
    prisma.chapter.deleteMany({ where: { meetingId } }),
    prisma.chapter.createMany({ data: chapters }),
  ]);
  return chapters.map(({ id, title, startMs, endMs }) => ({ id, title, startMs, endMs }));
}
