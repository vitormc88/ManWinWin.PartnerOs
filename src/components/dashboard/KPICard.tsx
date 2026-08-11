import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOADING_PLACEHOLDER } from "@/lib/money";

interface KPICardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  className?: string;
  delay?: number;
  /** While true the KPI shows a placeholder instead of a possibly-false zero. */
  loading?: boolean;
  /** The metric could not be calculated — shown as unavailable, never as zero. */
  error?: boolean;
  /** Explanation rendered instead of `change` when `error` is true. */
  errorHint?: string;
}

export function KPICard({ title, value, change, changeType = "neutral", icon: Icon, className, delay = 0, loading = false, error = false, errorHint = "Could not be calculated" }: KPICardProps) {
  const failed = error && !loading;
  return (
    <div
      className={cn(
        "bg-card rounded-xl p-5 shadow-md border animate-reveal-up",
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p
            className={cn(
              "text-2xl font-extrabold tracking-tight text-foreground",
              loading && "text-muted-foreground animate-pulse",
              failed && "text-muted-foreground"
            )}
            aria-busy={loading || undefined}
          >
            {loading ? LOADING_PLACEHOLDER : failed ? "Unavailable" : value}
          </p>
        </div>
        <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
          <Icon className="h-5 w-5 text-accent-foreground" />
        </div>
      </div>
      {failed ? (
        <p className="text-xs font-medium mt-3 text-destructive">{errorHint}</p>
      ) : (
        change && !loading && (
          <p className={cn(
            "text-xs font-medium mt-3",
            changeType === "positive" && "text-success",
            changeType === "negative" && "text-destructive",
            changeType === "neutral" && "text-muted-foreground",
          )}>
            {change}
          </p>
        )
      )}
    </div>
  );
}
