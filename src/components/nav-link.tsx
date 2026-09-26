"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active =
    href === "/calls" ? pathname === "/calls" || /^\/calls\/(?!new$)[^/]+$/.test(pathname) : pathname === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-2.5 py-1.5 text-sm font-medium ${
        active ? "bg-paper-2 text-ink" : "text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
