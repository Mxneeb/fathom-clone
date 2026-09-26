import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { initials } from "@/lib/speakers";
import { Wordmark } from "@/components/brand";
import { NavLink } from "@/components/nav-link";
import { SearchIcon, UploadIcon } from "@/components/icons";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, image: true, isGuest: true },
  });
  // A demo guest whose account has since been cleaned up still has a valid
  // session cookie; don't show them an empty or broken app.
  if (!user) return <ExpiredDemo />;

  const name = user.name ?? "You";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
          <Link href="/calls" aria-label="Cue — meetings">
            <Wordmark />
          </Link>
          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            <NavLink href="/calls">Meetings</NavLink>
            <NavLink href="/calls/new">Upload</NavLink>
          </nav>

          <form action="/search" role="search" className="ml-auto">
            <label className="flex items-center gap-2 rounded-lg border border-rule bg-card px-2.5 py-1.5 focus-within:border-ink-3">
              <SearchIcon size={15} className="text-ink-3" />
              <input
                name="q"
                placeholder="Search all meetings"
                aria-label="Search all meetings"
                className="w-28 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 md:w-56"
              />
            </label>
          </form>
          <Link
            href="/calls/new"
            aria-label="Upload a recording"
            className="rounded-lg border border-rule p-2 text-ink-2 hover:text-ink sm:hidden"
          >
            <UploadIcon size={16} />
          </Link>

          <div className="flex items-center gap-2 border-l border-rule pl-2 sm:pl-4">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="h-7 w-7 rounded-full" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper-2 text-[11px] font-semibold text-ink-2">
                {initials(name)}
              </span>
            )}
            <span className="hidden text-sm text-ink-2 lg:inline">{name}</span>
            {user.isGuest && (
              <span className="hidden rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink md:inline">
                Demo
              </span>
            )}
            <form action={signOutAction}>
              <button type="submit" className="rounded-md px-2 py-1 text-xs font-medium text-ink-3 hover:bg-paper-2 hover:text-ink">
                {user.isGuest ? "Leave demo" : "Sign out"}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}

function ExpiredDemo() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <Wordmark size="lg" />
        <h1 className="mt-6 font-serif text-2xl font-semibold text-ink">This demo has expired</h1>
        <p className="mt-2 text-sm text-ink-2">
          Demo accounts are cleared out after a few days. Start a fresh one: it comes with its own copy of the sample
          meetings.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <form action="/api/demo" method="post">
            <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-2">
              Start a new demo
            </button>
          </form>
          <form action={signOutAction}>
            <button type="submit" className="rounded-lg border border-rule px-4 py-2 text-sm font-medium text-ink hover:border-ink-3">
              Sign in instead
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
