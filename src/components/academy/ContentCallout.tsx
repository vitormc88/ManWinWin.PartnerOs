import { Lightbulb, CheckCircle2, AlertTriangle, BookOpen, Zap } from "lucide-react";
import { CALLOUT_LABELS, type CalloutKind } from "@/lib/academy";

const STYLES: Record<CalloutKind, { icon: typeof Lightbulb; className: string }> = {
  "partner-insight": { icon: Lightbulb, className: "border-primary/30 bg-primary/5 text-foreground" },
  "best-practice": { icon: CheckCircle2, className: "border-emerald-500/30 bg-emerald-500/5 text-foreground" },
  "warning-sign": { icon: AlertTriangle, className: "border-amber-500/30 bg-amber-500/5 text-foreground" },
  "real-example": { icon: BookOpen, className: "border-sky-500/30 bg-sky-500/5 text-foreground" },
  "partneros-action": { icon: Zap, className: "border-violet-500/30 bg-violet-500/5 text-foreground" },
};

export function ContentCallout({ kind, children }: { kind: CalloutKind; children: React.ReactNode }) {
  const { icon: Icon, className } = STYLES[kind];
  return (
    <div className={`rounded-xl border p-4 my-4 ${className}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wide">{CALLOUT_LABELS[kind]}</span>
      </div>
      <div className="text-sm leading-relaxed whitespace-pre-wrap">{children}</div>
    </div>
  );
}
