import { Checkbox } from "@/components/ui/checkbox";
import { AcademyAssetView } from "./AcademyAssetView";
import { ContentCallout } from "./ContentCallout";
import {
  parseInline,
  parseRichBlocks,
  slugifyHeading,
  type ChecklistState,
  type RichBlock,
} from "@/lib/academy";

interface Props {
  markdown: string | null | undefined;
  /** Optional interactive checklist state (persisted per user/mission). */
  checklistState?: ChecklistState;
  onToggleChecklistItem?: (itemId: string, checked: boolean) => void;
  readOnlyChecklist?: boolean;
}

/** Inline markdown: bold, italic, inline code and links. */
function Inline({ text }: { text: string }) {
  const nodes = parseInline(text);
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case "bold":
            return <strong key={i} className="font-semibold text-foreground">{n.text}</strong>;
          case "italic":
            return <em key={i}>{n.text}</em>;
          case "bold-italic":
            return <strong key={i} className="font-semibold italic text-foreground">{n.text}</strong>;
          case "code":
            return (
              <code key={i} className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]">
                {n.text}
              </code>
            );
          case "image":
            return (
              <img
                key={i}
                src={n.href}
                alt={n.text}
                loading="lazy"
                decoding="async"
                className="my-4 mx-auto max-w-full h-auto rounded-xl border bg-card"
              />
            );
          case "link":
            return (
              <a
                key={i}
                href={n.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:opacity-80"
              >
                {n.text}
              </a>
            );

          default:
            return <span key={i}>{n.text}</span>;
        }
      })}
    </>
  );
}

/**
 * Renders mission content: markdown (headings, paragraphs, bullet/numbered
 * lists, quotes, tables, dividers, inline emphasis/links) plus the reusable
 * Academy blocks (callouts, key takeaways and interactive checklists).
 */
export function MissionContent({
  markdown,
  checklistState,
  onToggleChecklistItem,
  readOnlyChecklist,
}: Props) {
  const blocks = parseRichBlocks(markdown);

  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">No content yet for this item.</p>;
  }

  // Stable, de-duplicated heading ids — must match `headingToc()`.
  const seen = new Map<string, number>();
  const headingIds = blocks.map((b) => {
    if (b.type !== "heading") return undefined;
    const base = slugifyHeading(b.text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  });

  return (
    <div className="max-w-none space-y-4 leading-relaxed">
      {blocks.map((block, i) => (
        <Block
          key={i}
          block={block}
          headingId={headingIds[i]}
          checklistState={checklistState}
          onToggleChecklistItem={onToggleChecklistItem}
          readOnlyChecklist={readOnlyChecklist}
        />
      ))}
    </div>
  );
}

function Block({
  block,
  headingId,
  checklistState,
  onToggleChecklistItem,
  readOnlyChecklist,
}: { block: RichBlock; headingId?: string } & Omit<Props, "markdown">) {
  switch (block.type) {
    case "heading": {
      if (block.level === 1)
        return (
          <h2
            id={headingId}
            className="scroll-mt-24 text-xl sm:text-2xl font-bold text-foreground tracking-tight mt-8 first:mt-0"
          >
            <Inline text={block.text} />
          </h2>
        );
      if (block.level === 2)
        return (
          <h3
            id={headingId}
            className="scroll-mt-24 text-base sm:text-lg font-semibold text-foreground mt-7 first:mt-0"
          >
            <Inline text={block.text} />
          </h3>
        );
      return (
        <h4
          id={headingId}
          className="scroll-mt-24 text-sm sm:text-base font-semibold text-foreground mt-5 first:mt-0"
        >
          <Inline text={block.text} />
        </h4>
      );
    }
    case "paragraph":
      return (
        <p className="text-sm sm:text-[0.95rem] text-foreground leading-7">
          <Inline text={block.text} />
        </p>
      );
    case "bullets":
      return (
        <ul className="list-disc pl-5 space-y-2 text-sm sm:text-[0.95rem] text-foreground marker:text-muted-foreground">
          {block.items.map((it, i) => (
            <li key={i} className="leading-7"><Inline text={it} /></li>
          ))}
        </ul>
      );
    case "numbered":
      return (
        <ol className="list-decimal pl-5 space-y-2 text-sm sm:text-[0.95rem] text-foreground marker:text-muted-foreground">
          {block.items.map((it, i) => (
            <li key={i} className="leading-7"><Inline text={it} /></li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-primary/40 pl-4 py-1 text-sm sm:text-[0.95rem] italic text-muted-foreground leading-7 whitespace-pre-wrap">
          <Inline text={block.text} />
        </blockquote>
      );
    case "divider":
      return <hr className="my-8 border-border" />;
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border my-2">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} className="text-left font-semibold text-foreground px-3 py-2 whitespace-nowrap">
                    <Inline text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="px-3 py-2 align-top text-foreground">
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "callout":
      return (
        <ContentCallout kind={block.kind}>
          {block.blocks.map((b, i) => (
            <Block key={i} block={b} readOnlyChecklist />
          ))}
        </ContentCallout>
      );
    case "asset":
      return <AcademyAssetView reference={block.reference} />;

    case "checklist":
      return (
        <div className="rounded-xl border bg-card p-4 sm:p-5 my-4 space-y-3">
          {block.items.map((item, idx) => {
            const id = `${block.key}#${idx}`;
            const checked = !!checklistState?.[id];
            return (
              <label key={id} className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={checked}
                  disabled={readOnlyChecklist || !onToggleChecklistItem}
                  onCheckedChange={(v) => onToggleChecklistItem?.(id, v === true)}
                  className="mt-0.5"
                />
                <span className={`text-sm leading-relaxed ${checked ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  <Inline text={item} />
                </span>
              </label>
            );
          })}
        </div>
      );
    default:
      return null;
  }
}
