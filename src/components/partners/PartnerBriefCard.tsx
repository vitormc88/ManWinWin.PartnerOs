import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Minus, TrendingDown, RotateCw, Sparkles } from "lucide-react";
import type { BriefData, Momentum } from "@/lib/partner-brief";

interface PartnerBriefCardProps {
  brief: BriefData;
}

const MOMENTUM_META: Record<Momentum, { label: string; icon: typeof TrendingUp; className: string }> = {
  Growing: { label: "Growing", icon: TrendingUp, className: "bg-success/10 text-success border-success/30" },
  Stable: { label: "Stable", icon: Minus, className: "bg-info/10 text-info border-info/20" },
  Slowing: { label: "Slowing", icon: TrendingDown, className: "bg-warning/10 text-warning-foreground border-warning/30" },
  Recovering: { label: "Recovering", icon: RotateCw, className: "bg-info/10 text-info border-info/20" },
  New: { label: "New", icon: Sparkles, className: "bg-muted text-muted-foreground border-border" },
};

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</h4>
      <ul className="space-y-1.5">
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

export function PartnerBriefCard({ brief }: PartnerBriefCardProps) {
  const meta = MOMENTUM_META[brief.momentum];
  const Icon = meta.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Partner Brief</CardTitle>
          <Badge variant="outline" className={`gap-1 font-normal ${meta.className}`}>
            <Icon className="h-3 w-3" /> {meta.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm leading-relaxed text-foreground">{brief.summary}</p>

        {brief.isNew ? null : (
          <>
            <Section title="Current Focus" items={brief.currentFocus} />
            <Section title="Open Commitments" items={brief.openCommitments} />
            <Section title="Recent Progress" items={brief.recentProgress} />

            <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Relationship Momentum</span>
              <span className="font-medium text-foreground">{meta.label}</span>
            </div>
            {brief.momentumHint && (
              <p className="text-xs text-muted-foreground -mt-3">{brief.momentumHint}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
