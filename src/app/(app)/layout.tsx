import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-3">
        <Link href="/calls" className="text-sm font-semibold tracking-tight">
          FATHOM CLONE
        </Link>
        <nav className="flex items-center gap-5 text-sm text-neutral-400">
          <Link href="/calls" className="hover:text-neutral-100">
            My Calls
          </Link>
          <Link href="/team" className="hover:text-neutral-100">
            Team Calls
          </Link>
          <span className="flex items-center gap-2">
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt=""
                className="h-6 w-6 rounded-full"
              />
            ) : null}
            <span className="hidden sm:inline">{session.user.name}</span>
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900"
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
