import { Checkbox } from "@/components/ui/checkbox";
import { ContentCallout } from "./ContentCallout";
import { parseRichBlocks, type ChecklistState, type RichBlock } from "@/lib/academy";

interface Props {
  markdown: string | null | undefined;
  /** Optional interactive checklist state (persisted per user/mission). */
  checklistState?: ChecklistState;
  onToggleChecklistItem?: (itemId: string, checked: boolean) => void;
  readOnlyChecklist?: boolean;
}

/**
 * Renders mission content: markdown (headings, paragraphs, bullet/numbered
 * lists, quotes, tables, dividers) plus the reusable Academy blocks
 * (callouts, key takeaways and interactive checklists).
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

  return (
    <div className="max-w-none space-y-3">
      {blocks.map((block, i) => (
        <Block
          key={i}
          block={block}
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
  checklistState,
  onToggleChecklistItem,
  readOnlyChecklist,
}: { block: RichBlock } & Omit<Props, "markdown">) {
  switch (block.type) {
    case "heading": {
      if (block.level === 1)
        return <h2 className="text-xl font-bold text-foreground tracking-tight mt-6 first:mt-0">{block.text}</h2>;
      if (block.level === 2)
        return <h3 className="text-base font-semibold text-foreground mt-5 first:mt-0">{block.text}</h3>;
      return <h4 className="text-sm font-semibold text-foreground mt-4 first:mt-0">{block.text}</h4>;
    }
    case "paragraph":
      return <p className="text-sm text-foreground leading-relaxed">{block.text}</p>;
    case "bullets":
      return (
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-foreground marker:text-muted-foreground">
          {block.items.map((it, i) => (
            <li key={i} className="leading-relaxed">{it}</li>
          ))}
        </ul>
      );
    case "numbered":
      return (
        <ol className="list-decimal pl-5 space-y-1.5 text-sm text-foreground marker:text-muted-foreground">
          {block.items.map((it, i) => (
            <li key={i} className="leading-relaxed">{it}</li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-primary/40 pl-4 py-1 text-sm italic text-muted-foreground whitespace-pre-wrap">
          {block.text}
        </blockquote>
      );
    case "divider":
      return <hr className="my-6 border-border" />;
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} className="text-left font-semibold text-foreground px-3 py-2 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="px-3 py-2 align-top text-foreground">{cell}</td>
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
                  {item}
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
