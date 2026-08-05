import { parseContentBlocks } from "@/lib/academy";
import { ContentCallout } from "./ContentCallout";

/**
 * Minimal renderer: headings (#, ##, ###), bullet lists and paragraphs, plus
 * the Academy callout blocks. Content always comes from the database.
 */
export function MissionContent({ markdown }: { markdown: string | null | undefined }) {
  const blocks = parseContentBlocks(markdown);

  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">No content yet for this item.</p>;
  }

  return (
    <div className="max-w-none">
      {blocks.map((block, i) =>
        block.type === "callout" ? (
          <ContentCallout key={i} kind={block.kind}>
            {block.text}
          </ContentCallout>
        ) : (
          <TextBlock key={i} text={block.text} />
        )
      )}
    </div>
  );
}

function TextBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("### "))
          return <h4 key={i} className="text-sm font-semibold text-foreground mt-4">{trimmed.slice(4)}</h4>;
        if (trimmed.startsWith("## "))
          return <h3 key={i} className="text-base font-semibold text-foreground mt-4">{trimmed.slice(3)}</h3>;
        if (trimmed.startsWith("# "))
          return <h2 key={i} className="text-lg font-bold text-foreground mt-4">{trimmed.slice(2)}</h2>;
        if (trimmed.startsWith("- "))
          return (
            <p key={i} className="text-sm text-foreground pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-muted-foreground">
              {trimmed.slice(2)}
            </p>
          );
        return <p key={i} className="text-sm text-foreground leading-relaxed">{trimmed}</p>;
      })}
    </div>
  );
}
