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
  const [expanded, setExpanded] = useState(isPrimary);

  const hasDetails =
    !brief.isNew &&
    (brief.currentFocus.length > 0 ||
      brief.openCommitments.length > 0 ||
      brief.recentProgress.length > 0 ||
      !!brief.momentumHint);

  const containerCls = isPrimary
    ? "relative bg-card rounded-xl border shadow-sm p-6 space-y-4 before:content-[''] before:absolute before:left-0 before:top-5 before:bottom-5 before:w-[3px] before:bg-primary before:rounded-r"
    : "bg-card rounded-xl border shadow-sm p-5 space-y-3";

  const summaryCls = isPrimary
    ? "text-[15px] leading-relaxed text-foreground"
    : "text-sm leading-snug text-foreground/90";

  return (
    <div className={containerCls}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className={isPrimary ? "font-semibold text-foreground text-base" : "font-semibold text-foreground text-sm"}>
            Partner Brief
          </h3>
          {isPrimary && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Executive narrative
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className={`gap-1 font-normal text-[10px] uppercase tracking-wider ${CONFIDENCE_META[brief.confidence]}`}
            title={brief.confidenceReason}
          >
            {brief.confidence} confidence
          </Badge>
          <Badge variant="outline" className={`gap-1 font-normal ${meta.className}`}>
            <Icon className="h-3 w-3" /> {meta.label}
          </Badge>
        </div>
      </div>

      {/* Executive summary */}
      <p className={summaryCls}>{brief.summary}</p>
      {brief.confidence === "Low" && brief.confidenceReason && (
        <p className="text-xs text-muted-foreground -mt-1 italic">{brief.confidenceReason}</p>
      )}

      {/* Business signals */}
      {brief.signals.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Target className="h-3 w-3" /> Business Signals
          </h4>
          <ul className="space-y-1">
            {brief.signals.map((s, i) => (
              <li key={i} className="text-sm text-foreground flex gap-2 items-start">
                <SignalDot tone={s.tone} />
                <span className="leading-snug">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strategic recommendation */}
      {brief.recommendation && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                Strategic Recommendation
              </p>
              <p className="text-sm font-medium text-foreground leading-snug">
                {brief.recommendation.title}
              </p>
              <p className="text-xs text-muted-foreground leading-snug">
                {brief.recommendation.rationale}
              </p>
            </div>
          </div>
        </div>
      )}

      {hasDetails && (
        <>
          {expanded && (
            <div className="space-y-3 pt-1">
              <Section title="Current Focus" items={brief.currentFocus} />
              <Section title="Open Commitments" items={brief.openCommitments} />
              <Section title="Recent Progress" items={brief.recentProgress} />
              {brief.momentumHint && (
                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Relationship Momentum</span>
                  <span className="font-medium text-foreground">{meta.label} — {brief.momentumHint}</span>
                </div>
              )}
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="h-7 px-2 -ml-2 text-xs text-muted-foreground hover:text-foreground"
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
