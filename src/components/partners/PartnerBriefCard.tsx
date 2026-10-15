import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Minus,
  TrendingDown,
  RotateCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Rocket,
  Moon,
  AlertOctagon,
  Target,
  Lightbulb,
} from "lucide-react";
import type { BriefData, Momentum, BusinessSignal } from "@/lib/partner-brief";

interface PartnerBriefCardProps {
  brief: BriefData;
  variant?: "default" | "primary";
}

const MOMENTUM_META: Record<Momentum, { label: string; icon: typeof TrendingUp; className: string }> = {
  Accelerating: { label: "Accelerating", icon: Rocket, className: "bg-success/10 text-success border-success/30" },
  Growing: { label: "Growing", icon: TrendingUp, className: "bg-success/10 text-success border-success/30" },
  Stable: { label: "Stable", icon: Minus, className: "bg-info/10 text-info border-info/20" },
  Slowing: { label: "Slowing", icon: TrendingDown, className: "bg-warning/10 text-warning-foreground border-warning/30" },
  Recovering: { label: "Recovering", icon: RotateCw, className: "bg-info/10 text-info border-info/20" },
  Dormant: { label: "Dormant", icon: Moon, className: "bg-muted text-muted-foreground border-border" },
  "At Risk": { label: "At Risk", icon: AlertOctagon, className: "bg-destructive/10 text-destructive border-destructive/30" },
  New: { label: "New", icon: Sparkles, className: "bg-muted text-muted-foreground border-border" },
  Building: { label: "Building", icon: Sparkles, className: "bg-info/10 text-info border-info/20" },
};

const CONFIDENCE_META: Record<BriefData["confidence"], string> = {
  High: "bg-success/10 text-success border-success/30",
  Medium: "bg-info/10 text-info border-info/20",
  Low: "bg-muted text-muted-foreground border-border",
};

function SignalDot({ tone }: { tone: BusinessSignal["tone"] }) {
  const cls =
    tone === "positive"
      ? "bg-success"
      : tone === "negative"
      ? "bg-destructive"
      : "bg-muted-foreground/60";
  return <span className={`mt-[7px] h-1.5 w-1.5 rounded-full shrink-0 ${cls}`} />;
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{title}</h4>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="text-sm text-foreground flex gap-2">
            <span className="text-muted-foreground mt-1.5 leading-none">•</span>
            <span className="leading-snug">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PartnerBriefCard({ brief, variant = "default" }: PartnerBriefCardProps) {
  const meta = MOMENTUM_META[brief.momentum];
  const Icon = meta.icon;
  const isPrimary = variant === "primary";
  const [expanded, setExpanded] = useState(false);

  const hasDetails =
    !brief.isNew &&
    (brief.currentFocus.length > 0 ||
      brief.openCommitments.length > 0 ||
      brief.recentProgress.length > 0);

  const containerCls = isPrimary
    ? "relative bg-card rounded-xl border shadow-sm p-5 space-y-3 before:content-[''] before:absolute before:left-0 before:top-4 before:bottom-4 before:w-[3px] before:bg-primary before:rounded-r"
    : "bg-card rounded-xl border shadow-sm p-5 space-y-3";

  const signals = brief.signals.slice(0, 4);

  return (
    <div className={containerCls}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-foreground text-[15px]">Executive Summary</h3>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className={`gap-1 font-normal text-[10px] uppercase tracking-wider ${CONFIDENCE_META[brief.confidence]}`}
            title={brief.confidenceReason}
          >
            {brief.confidence} confidence
          </Badge>
          <Badge variant="outline" className={`gap-1 font-normal ${meta.className}`}>
            <Icon className="h-3 w-3" /> Momentum: {meta.label}
          </Badge>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Commercial momentum from recorded activity, not the overall health score or the manual relationship status. {brief.momentumHint}</p>
      {/* Executive summary — concise */}
      <p className="text-[13px] leading-snug text-foreground/90">{brief.summary}</p>

      {/* Business signals — max 4 */}
      {signals.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Target className="h-3 w-3" /> Key Signals
          </h4>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {signals.map((s, i) => (
              <li key={i} className="text-[13px] text-foreground flex gap-2 items-start">
                <SignalDot tone={s.tone} />
                <span className="leading-snug">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strategic recommendation */}
      {brief.recommendation && (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-0.5 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                Strategic Recommendation
              </p>
              <p className="text-[13px] font-medium text-foreground leading-snug">
                {brief.recommendation.title}
              </p>
              {brief.recommendation.rationale && (
                <p className="text-xs text-muted-foreground leading-snug">
                  {brief.recommendation.rationale}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {hasDetails && (
        <>
          {expanded && (
            <div className="space-y-3 pt-2 border-t border-border/60">
              <Section title="Current Focus" items={brief.currentFocus} />
              <Section title="Open Commitments" items={brief.openCommitments} />
              <Section title="Recent Progress" items={brief.recentProgress} />
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="h-6 px-2 -ml-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <><ChevronUp className="h-3 w-3 mr-1" /> Hide details</>
            ) : (
              <><ChevronDown className="h-3 w-3 mr-1" /> Show details</>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
