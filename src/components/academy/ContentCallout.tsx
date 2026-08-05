import { Lightbulb, CheckCircle2, AlertTriangle, BookOpen, Zap, Sparkles } from "lucide-react";
import { CALLOUT_LABELS, type CalloutKind } from "@/lib/academy";

const STYLES: Record<CalloutKind, { icon: typeof Lightbulb; className: string; accent: string }> = {
  "partner-insight": {
    icon: Lightbulb,
    className: "border-primary/30 bg-primary/5",
    accent: "text-primary",
  },
  "best-practice": {
    icon: CheckCircle2,
    className: "border-emerald-500/30 bg-emerald-500/5",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  "warning-sign": {
    icon: AlertTriangle,
    className: "border-amber-500/30 bg-amber-500/5",
    accent: "text-amber-600 dark:text-amber-400",
  },
  "real-example": {
    icon: BookOpen,
    className: "border-sky-500/30 bg-sky-500/5",
    accent: "text-sky-600 dark:text-sky-400",
  },
  "partneros-action": {
    icon: Zap,
    className: "border-violet-500/30 bg-violet-500/5",
    accent: "text-violet-600 dark:text-violet-400",
  },
  "key-takeaways": {
    icon: Sparkles,
    className: "border-border bg-secondary/40",
    accent: "text-foreground",
  },
};

export function ContentCallout({
  kind,
  children,
}: {
  kind: CalloutKind;
  children: React.ReactNode;
}) {
  const { icon: Icon, className, accent } = STYLES[kind];
  return (
    <div className={`rounded-xl border p-4 sm:p-5 my-4 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
        <span className={`text-xs font-semibold uppercase tracking-wide ${accent}`}>
          {CALLOUT_LABELS[kind]}
        </span>
      </div>
      <div className="text-sm leading-relaxed text-foreground space-y-2">{children}</div>
    </div>
  );
}
