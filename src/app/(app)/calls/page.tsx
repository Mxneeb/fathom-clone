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
    include: { participants: true, _count: { select: { highlights: true, actionItems: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">My Calls</h1>
        <SearchBar defaultValue={q ?? ""} />
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
          {meetings.map((m) => (
            <li key={m.id}>
              <Link
                href={`/calls/${m.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-neutral-900/60"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.title}</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {m.occurredAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    · {formatDuration(m.durationSec)} ·{" "}
                    {m.participants.map((p) => p.name).join(", ")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-neutral-500">
                  {m._count.highlights > 0 && <span>✦ {m._count.highlights}</span>}
                  {m._count.actionItems > 0 && <span>☑ {m._count.actionItems}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
