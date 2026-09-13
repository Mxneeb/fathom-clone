// Renders very simple markdown (## headings, **bold**, - bullets) without
// pulling in a markdown dependency — the generated summaries only ever use
// that small subset. Shared between the authenticated SummaryPanel and the
// public share page.
export function renderMarkdown(md: string) {
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={elements.length} className="list-disc space-y-1 pl-5">
        {listBuffer.map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inline(item) }} />
        ))}
      </ul>
    );
    listBuffer = [];
  }

  function inline(text: string) {
    return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h3 key={elements.length} className="mt-4 text-sm font-semibold text-neutral-100 first:mt-0">
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith("- ")) {
      listBuffer.push(line.slice(2));
    } else if (line.length > 0) {
      flushList();
      elements.push(
        <p
          key={elements.length}
          className="text-sm leading-relaxed text-neutral-300"
          dangerouslySetInnerHTML={{ __html: inline(line) }}
        />
      );
    }
  }
  flushList();
  return elements;
}
