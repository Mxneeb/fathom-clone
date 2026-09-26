import Link from "next/link";
import { Wordmark } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24">
      <div className="max-w-sm text-center">
        <Wordmark size="lg" />
        <h1 className="mt-6 font-serif text-2xl font-semibold text-ink">Nothing at this address</h1>
        <p className="mt-2 text-sm text-ink-2">
          The meeting may have been removed, the share link may be mistyped, or it belongs to another account.
        </p>
        <Link
          href="/calls"
          className="mt-6 inline-block rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-2"
        >
          Back to meetings
        </Link>
      </div>
    </main>
  );
}
