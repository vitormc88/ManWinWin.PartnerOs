import { List } from "lucide-react";
import { headingToc } from "@/lib/academy";

/**
 * Table of contents generated from the mission headings.
 * Renders nothing when the content has fewer than two headings.
 */
export function MissionToc({
  markdown,
  hideLeadingH1,
}: {
  markdown: string | null | undefined;
  /** Must mirror the renderer, otherwise the TOC links to a removed anchor. */
  hideLeadingH1?: boolean;
}) {
  const entries = headingToc(markdown, { hideLeadingH1 });
  if (entries.length < 2) return null;

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav aria-label="Mission contents" className="rounded-xl border bg-card shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <List className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          On this page
        </span>
      </div>
      <ul className="space-y-1">
        {entries.map((e) => (
          <li key={e.id} style={{ paddingLeft: (e.level - 1) * 12 }}>
            <button
              type="button"
              onClick={() => go(e.id)}
              className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {e.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
