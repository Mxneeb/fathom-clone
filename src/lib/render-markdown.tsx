import type { ReactNode } from "react";

// Renders the small markdown subset the summary model produces (headings,
// bullet and numbered lists, simple tables, **bold**, `code`) as React
// nodes. Text is never injected as HTML: summaries come from a model reading
// an uploaded recording and are shown on public share pages too.
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, i) => {
      if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-ink">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="rounded bg-paper-2 px-1 font-mono text-[0.85em]">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function renderMarkdown(md: string): ReactNode[] {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let table: string[][] | null = null;

  const flush = () => {
    if (list) {
      const Tag = list.ordered ? "ol" : "ul";
      out.push(
        <Tag
          key={out.length}
          className={`${list.ordered ? "list-decimal" : "list-disc"} space-y-1.5 pl-5 font-serif text-[15px] leading-relaxed text-ink-2 marker:text-ink-3`}
        >
          {list.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </Tag>
      );
      list = null;
    }
    if (table) {
      const [head, ...body] = table;
      out.push(
        <div key={out.length} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                {head.map((c, i) => (
                  <th key={i} className="border-b border-rule py-1.5 pr-3 font-medium text-ink">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>
                  {row.map((c, i) => (
                    <td key={i} className="border-b border-rule/60 py-1.5 pr-3 align-top text-ink-2">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      table = null;
    }
  };

  for (const raw of md.split("\n")) {
    const line = raw.trim();
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);

    if (line.startsWith("|")) {
      if (list) flush();
      if (/^\|?[\s:-]+(\|[\s:-]+)+\|?$/.test(line)) continue; // separator row
      table = table ?? [];
      table.push(cells(line));
      continue;
    }
    if (table) flush();

    if (heading) {
      flush();
      out.push(
        <h4
          key={out.length}
          className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3 first:mt-0"
        >
          {inline(heading[1].replace(/\*\*/g, ""))}
        </h4>
      );
    } else if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list = list ?? { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (line.length > 0 && !/^-{3,}$/.test(line)) {
      flush();
      out.push(
        <p key={out.length} className="font-serif text-[15px] leading-relaxed text-ink-2">
          {inline(line)}
        </p>
      );
    }
  }
  flush();
  return out;
}
