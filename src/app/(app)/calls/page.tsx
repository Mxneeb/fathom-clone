import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchBar } from "@/components/search-bar";

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatch(text: string, query: string) {
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="rounded bg-amber-400/20 text-amber-300">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { q } = await searchParams;
  const userId = session.user.id;

  const meetings = await prisma.meeting.findMany({
    where: q
      ? {
          ownerId: userId,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { transcriptLines: { some: { text: { contains: q, mode: "insensitive" } } } },
            { transcriptLines: { some: { speakerName: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : { ownerId: userId },
    orderBy: { occurredAt: "desc" },
    include: {
      participants: true,
      _count: { select: { highlights: true, actionItems: true } },
      // Surface the first matching line so a search result can jump
      // straight to that moment, not just the meeting as a whole.
      transcriptLines: q
        ? {
            where: {
              OR: [
                { text: { contains: q, mode: "insensitive" } },
                { speakerName: { contains: q, mode: "insensitive" } },
              ],
            },
            orderBy: { order: "asc" },
            take: 1,
          }
        : false,
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">My Calls</h1>
        <div className="flex items-center gap-3">
          <SearchBar defaultValue={q ?? ""} />
          <Link
            href="/calls/new"
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium hover:bg-sky-500"
          >
            + Upload a recording
          </Link>
        </div>
      </div>

      {meetings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 py-16 text-center text-neutral-500">
          {q ? (
            <>No call recordings match &ldquo;{q}&rdquo;.</>
          ) : (
            <>No call recordings.</>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
          {meetings.map((m) => {
            const matchLine = q && m.transcriptLines ? m.transcriptLines[0] : undefined;
            const href = matchLine
              ? `/calls/${m.id}?t=${matchLine.startMs}`
              : `/calls/${m.id}`;
            return (
              <li key={m.id}>
                <Link
                  href={href}
                  className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-neutral-900/60"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {q ? highlightMatch(m.title, q) : m.title}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {m.occurredAt.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      · {formatDuration(m.durationSec)} ·{" "}
                      {m.participants.map((p) => p.name).join(", ")}
                    </div>
                    {matchLine && (
                      <div className="mt-1.5 truncate text-xs text-neutral-400">
                        <span className="text-neutral-500">{matchLine.speakerName}:</span>{" "}
                        {highlightMatch(matchLine.text, q!)}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-neutral-500">
                    {m._count.highlights > 0 && <span>✦ {m._count.highlights}</span>}
                    {m._count.actionItems > 0 && <span>☑ {m._count.actionItems}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
