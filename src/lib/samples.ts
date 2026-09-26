import { randomUUID } from "node:crypto";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { SAMPLE_OWNER_ID } from "@/lib/sample-owner";

// Sample meetings (prisma/seed.ts) live under a placeholder account as
// templates. Every new account — Google sign-up or "Try the demo" guest —
// gets its own copy, so nobody opens the app to an empty list and nobody's
// edits leak into anyone else's copy.

const GUEST_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export async function copySampleMeetingsTo(userId: string) {
  const templates = await prisma.meeting.findMany({
    where: { ownerId: SAMPLE_OWNER_ID },
    include: {
      participants: true,
      transcriptLines: true,
      summaries: true,
      actionItems: true,
      highlights: true,
    },
  });
  if (templates.length === 0) return;

  // IDs are generated here so the whole copy is one batch of createMany
  // calls instead of a round trip per row.
  const meetings = [];
  const participants = [];
  const lines = [];
  const summaries = [];
  const actionItems = [];
  const highlights = [];

  for (const t of templates) {
    const meetingId = randomUUID();
    meetings.push({
      id: meetingId,
      ownerId: userId,
      title: t.title,
      occurredAt: t.occurredAt,
      durationSec: t.durationSec,
      mediaUrl: t.mediaUrl,
      mediaType: t.mediaType,
      source: t.source,
    });

    const participantIds = new Map<string, string>();
    for (const p of t.participants) {
      const id = randomUUID();
      participantIds.set(p.id, id);
      participants.push({ id, meetingId, name: p.name, email: p.email, isHost: p.isHost });
    }
    for (const l of t.transcriptLines) {
      lines.push({
        meetingId,
        participantId: l.participantId ? (participantIds.get(l.participantId) ?? null) : null,
        speakerName: l.speakerName,
        startMs: l.startMs,
        endMs: l.endMs,
        text: l.text,
        order: l.order,
      });
    }
    for (const s of t.summaries) {
      summaries.push({ meetingId, template: s.template, content: s.content, generatedAt: s.generatedAt });
    }
    for (const a of t.actionItems) {
      actionItems.push({
        meetingId,
        text: a.text,
        owner: a.owner,
        dueDate: a.dueDate,
        sourceMs: a.sourceMs,
        done: a.done,
        createdAt: a.createdAt,
      });
    }
    for (const h of t.highlights) {
      highlights.push({ meetingId, timestampMs: h.timestampMs, label: h.label, note: h.note });
    }
  }

  await prisma.$transaction([
    prisma.meeting.createMany({ data: meetings }),
    prisma.participant.createMany({ data: participants }),
    prisma.transcriptLine.createMany({ data: lines }),
    prisma.summary.createMany({ data: summaries }),
    prisma.actionItem.createMany({ data: actionItems }),
    prisma.highlight.createMany({ data: highlights }),
  ]);
}

export async function createGuestUser() {
  // Guests are disposable; clear out old ones (and, by cascade, everything
  // they created) whenever a new one arrives, including recordings they
  // uploaded, which live in Blob storage rather than the database.
  const stale = { isGuest: true, createdAt: { lt: new Date(Date.now() - GUEST_TTL_MS) } };
  const uploads = await prisma.meeting.findMany({
    where: { owner: stale, source: "UPLOAD" },
    select: { mediaUrl: true },
  });
  if (uploads.length > 0) {
    await del(uploads.map((u) => u.mediaUrl)).catch((err) => console.error("guest upload cleanup failed", err));
  }
  await prisma.user.deleteMany({ where: stale });
  const user = await prisma.user.create({ data: { name: "Guest", isGuest: true } });
  await copySampleMeetingsTo(user.id);
  return user;
}
