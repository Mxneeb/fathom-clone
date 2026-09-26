import type { ReactNode } from "react";

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-rule bg-card ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-rule/70 px-5 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{title}</h2>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function QuietButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-paper-2 hover:text-ink disabled:opacity-50 ${
        rest.className ?? ""
      }`}
    >
      {children}
    </button>
  );
}

export function TimeChip({ onClick, label }: { onClick?: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Jump to ${label}`}
      className="shrink-0 rounded-md border border-rule bg-paper px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-ink-2 hover:border-accent hover:text-accent"
    >
      {label}
    </button>
  );
}
