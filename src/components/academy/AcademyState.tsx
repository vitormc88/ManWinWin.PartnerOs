import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Kind = "loading" | "empty" | "error";

/**
 * Distinct loading / empty / error states for every Academy surface, so a
 * failed query is never rendered as "no content".
 */
export function AcademyState({
  kind,
  title,
  description,
  error,
  onRetry,
}: {
  kind: Kind;
  title?: string;
  description?: string;
  error?: unknown;
  onRetry?: () => void;
}) {
  if (kind === "loading") {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" />
        {title ?? "Loading…"}
      </div>
    );
  }

  if (kind === "error") {
    const message =
      (error as { message?: string } | null)?.message ??
      description ??
      "Something went wrong while loading Academy content.";
    return (
      <div className="bg-card rounded-xl border border-destructive/30 shadow-sm p-6 text-center space-y-2">
        <AlertTriangle className="h-5 w-5 mx-auto text-destructive" />
        <p className="text-sm font-medium text-foreground">{title ?? "Could not load this content"}</p>
        <p className="text-xs text-muted-foreground break-words">{message}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border shadow-sm p-8 text-center space-y-1">
      <Inbox className="h-6 w-6 text-muted-foreground mx-auto" />
      <p className="text-sm text-muted-foreground">{title ?? "Nothing here yet."}</p>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
