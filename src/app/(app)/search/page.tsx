import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatClock, formatShortDate } from "@/lib/format";
import { SearchIcon } from "@/components/icons";

export const metadata = { title: "Search" };

const PER_MEETING = 6;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function marked(text: string, q: string) {
  return text.split(new RegExp(`(${escapeRegExp(q)})`, "gi")).map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-accent-soft px-0.5 text-ink">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const q = ((await searchParams).q ?? "").trim().slice(0, 200);

  const [lines, titleMatches] = q
    ? await Promise.all([
        prisma.transcriptLine.findMany({
          where: {
            meeting: { ownerId: session.user.id },
            OR: [
              { text: { contains: q, mode: "insensitive" } },
              { speakerName: { contains: q, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            speakerName: true,
            startMs: true,
            text: true,
            meeting: { select: { id: true, title: true, occurredAt: true } },
          },
          orderBy: [{ meeting: { occurredAt: "desc" } }, { order: "asc" }],
          take: 300,
        }),
        prisma.meeting.findMany({
          where: { ownerId: session.user.id, title: { contains: q, mode: "insensitive" } },
          select: { id: true, title: true, occurredAt: true },
          orderBy: { occurredAt: "desc" },
        }),
      ])
    : [[], []];

  const groups = new Map<string, { meeting: (typeof lines)[number]["meeting"]; lines: typeof lines }>();
  for (const m of titleMatches) groups.set(m.id, { meeting: m, lines: [] });
  for (const l of lines) {
    const g = groups.get(l.meeting.id) ?? { meeting: l.meeting, lines: [] };
    g.lines.push(l);
    groups.set(l.meeting.id, g);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink">Search</h1>
      <form action="/search" className="mt-4">
        <label className="flex items-center gap-3 rounded-xl border border-rule bg-card px-4 py-3 focus-within:border-ink-3">
          <SearchIcon size={18} className="text-ink-3" />
          <input
            name="q"
            defaultValue={q}
            autoFocus={!q}
            placeholder="What was said, by anyone, in any meeting"
            aria-label="Search all meetings"
            className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
          />
        </label>
      </form>

      {!q ? (
        <p className="mt-6 text-sm text-ink-2">
          Every result opens the recording at the moment it was said. Try{" "}
          <Link href="/search?q=ranking" className="text-accent underline-offset-2 hover:underline">
            ranking
          </Link>{" "}
          or{" "}
          <Link href="/search?q=NetSuite" className="text-accent underline-offset-2 hover:underline">
            NetSuite
          </Link>
          .
        </p>
      ) : groups.size === 0 ? (
        <p className="mt-6 text-sm text-ink-2">Nothing in your meetings matches “{q}”.</p>
      ) : (
        <>
          <p className="mt-6 text-sm text-ink-2">
            {lines.length} {lines.length === 1 ? "moment" : "moments"} in {groups.size}{" "}
            {groups.size === 1 ? "meeting" : "meetings"}
            {lines.length === 300 && " (showing the first 300)"}
          </p>
          <div className="mt-4 space-y-4">
            {[...groups.values()].map(({ meeting, lines: hits }) => (
              <section key={meeting.id} className="rounded-2xl border border-rule bg-card">
                <header className="flex items-baseline justify-between gap-3 border-b border-rule/70 px-5 py-3">
                  <Link
                    href={`/calls/${meeting.id}`}
                    className="min-w-0 truncate font-serif text-lg font-semibold text-ink hover:text-accent-ink"
                  >
                    {marked(meeting.title, q)}
                  </Link>
                  <span className="shrink-0 text-xs text-ink-3">{formatShortDate(meeting.occurredAt)}</span>
                </header>
                {hits.length > 0 && (
                  <ul className="divide-y divide-rule/60 px-2 py-1">
                    {hits.slice(0, PER_MEETING).map((l) => (
                      <li key={l.id}>
                        <Link
                          href={`/calls/${meeting.id}?t=${l.startMs}`}
                          className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-lg px-3 py-2.5 hover:bg-paper-2/70"
                        >
                          <span className="pt-0.5 font-mono text-[11px] tabular-nums text-accent">{formatClock(l.startMs)}</span>
                          <span className="text-[14.5px] leading-relaxed text-ink">
                            <span className="font-medium text-ink-2">{l.speakerName}: </span>
                            {marked(l.text, q)}
                          </span>
                        </Link>
                      </li>
                    ))}
                    {hits.length > PER_MEETING && (
                      <li className="px-3 py-2 text-xs text-ink-3">
                        and {hits.length - PER_MEETING} more in this meeting —{" "}
                        <Link href={`/calls/${meeting.id}`} className="text-accent hover:underline">
                          open it and use Find in transcript
                        </Link>
                      </li>
                    )}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
