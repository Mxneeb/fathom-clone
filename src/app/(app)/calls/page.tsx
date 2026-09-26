import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDay, formatDuration, formatTime } from "@/lib/format";
import { MiniTimeline, SpeakerStack } from "@/components/mini-timeline";
import { UploadIcon } from "@/components/icons";

export const metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const meetings = await prisma.meeting.findMany({
    where: { ownerId: session.user.id },
    orderBy: { occurredAt: "desc" },
    select: {
      id: true,
      title: true,
      occurredAt: true,
      durationSec: true,
      source: true,
      transcriptLines: { select: { speakerName: true, startMs: true, endMs: true }, orderBy: { order: "asc" } },
      actionItems: { select: { done: true } },
      _count: { select: { highlights: true } },
    },
  });

  const openActions = meetings.reduce((n, m) => n + m.actionItems.filter((a) => !a.done).length, 0);
  const days = new Map<string, typeof meetings>();
  for (const m of meetings) {
    const key = formatDay(m.occurredAt);
    days.set(key, [...(days.get(key) ?? []), m]);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink">Meetings</h1>
          <p className="mt-1.5 text-sm text-ink-2">
            {meetings.length} {meetings.length === 1 ? "recording" : "recordings"}
            {openActions > 0 && ` · ${openActions} open action ${openActions === 1 ? "item" : "items"}`}
          </p>
        </div>
        <Link
          href="/calls/new"
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper hover:bg-ink-2"
        >
          <UploadIcon size={16} />
          Upload a recording
        </Link>
      </div>

      {meetings.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-rule-2 px-6 py-16 text-center">
          <p className="font-serif text-xl text-ink">No meetings yet</p>
          <p className="mt-1 text-sm text-ink-2">Upload a recording and Cue will transcribe and map it.</p>
        </div>
      ) : (
        [...days.entries()].map(([day, list]) => (
          <section key={day} className="mt-9">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{day}</h2>
            <ul className="space-y-3">
              {list.map((m) => {
                const open = m.actionItems.filter((a) => !a.done).length;
                const speakerCount = new Set(m.transcriptLines.map((l) => l.speakerName)).size;
                return (
                  <li key={m.id}>
                    <Link
                      href={`/calls/${m.id}`}
                      className="group block rounded-2xl border border-rule bg-card p-4 transition hover:border-rule-2 hover:shadow-[0_1px_0_var(--rule),0_8px_24px_-12px_rgba(29,27,22,0.18)] sm:p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="truncate font-serif text-xl font-semibold text-ink group-hover:text-accent-ink">
                            {m.title}
                          </h3>
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
                            <span>{formatTime(m.occurredAt)}</span>
                            <span className="text-ink-3">·</span>
                            <span>{formatDuration(m.durationSec)}</span>
                            <span className="text-ink-3">·</span>
                            <span>
                              {speakerCount} {speakerCount === 1 ? "speaker" : "speakers"}
                            </span>
                            {m.source === "SEED" && (
                              <span className="rounded-full border border-rule-2 px-2 py-px text-[11px] font-medium text-ink-3">
                                Sample
                              </span>
                            )}
                          </p>
                        </div>
                        <SpeakerStack lines={m.transcriptLines} />
                      </div>
                      <div className="mt-4">
                        <MiniTimeline lines={m.transcriptLines} totalMs={m.durationSec * 1000} />
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-xs text-ink-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full border-2 border-ink-3" />
                          {m.actionItems.length === 0
                            ? "No action items"
                            : open === 0
                              ? `All ${m.actionItems.length} action items done`
                              : `${open} of ${m.actionItems.length} action items open`}
                        </span>
                        {m._count.highlights > 0 && (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rotate-45 rounded-[1px] bg-accent" />
                            {m._count.highlights} {m._count.highlights === 1 ? "highlight" : "highlights"}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
