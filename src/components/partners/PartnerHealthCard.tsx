import { Info, Check, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { BusinessFactor } from "@/lib/partner-health-narrative";
import { healthBand } from "@/lib/partner-health-config";

interface PartnerHealthCardProps {
  score: number;
  summary: string;
  factors: BusinessFactor[];
}

const IMPACT_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
const DIM_RANK: Record<string, number> = { relationship: 3, momentum: 2, engagement: 1 };

function rank(factors: BusinessFactor[], type: "positive" | "negative", max = 3) {
  return [...factors]
    .filter((f) => f.type === type)
    .sort((a, b) => {
      const i = (IMPACT_RANK[b.impact] ?? 0) - (IMPACT_RANK[a.impact] ?? 0);
      if (i !== 0) return i;
      return (DIM_RANK[b.dimension] ?? 0) - (DIM_RANK[a.dimension] ?? 0);
    })
    .slice(0, max);
}

export function PartnerHealthCard({ score, summary, factors }: PartnerHealthCardProps) {
  const band = healthBand(score);
  const label = band === "healthy" ? "Healthy" : band === "moderate" ? "Moderate" : "At Risk";
  const color =
    band === "healthy"
      ? "hsl(var(--success))"
      : band === "moderate"
      ? "hsl(var(--warning))"
      : "hsl(var(--destructive))";

  const positives = rank(factors, "positive");
  const negatives = rank(factors, "negative");

  return (
    <div className="bg-card rounded-xl border shadow-sm p-4 space-y-3">
      {/* ── Score header ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm">Partner Health</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs leading-relaxed">
                Partner Health reflects the overall strength of this partnership by
                considering relationship quality, commercial momentum and
                operational engagement.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-2xl font-bold tabular-nums leading-none">
            {score}
            <span className="text-sm font-normal text-muted-foreground">/100</span>
          </span>
          <Badge variant="outline" className="ml-1">{label}</Badge>
        </div>

        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full transition-all"
            style={{ width: `${Math.max(0, Math.min(100, score))}%`, backgroundColor: color }}
          />
        </div>
      </div>
      


      {/* ── Causal: what's holding the score up ──────────────────── */}
      <FactorSection
        title={band === "at_risk" ? "Health would be lower without:" : "Health is supported by:"}
        tone="positive"
        items={positives.map((f) => f.label)}
        emptyText="No strong positive drivers detected."
      />

      {/* ── Causal: what's pulling the score down ────────────────── */}
      <FactorSection
        title={band === "healthy" ? "Score is held back by:" : "Health decreased because:"}
        tone="negative"
        items={negatives.map((f) => f.label)}
        emptyText="No factors are currently pulling the score down."
      />
    </div>
  );
}

interface FactorSectionProps {
  title: string;
  tone: "positive" | "negative";
  items: string[];
  emptyText: string;
}

function FactorSection({ title, tone, items, emptyText }: FactorSectionProps) {
  const Icon = tone === "positive" ? Check : AlertTriangle;
  const iconColor = tone === "positive" ? "text-success" : "text-warning";

  return (
    <div className="space-y-1">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((label, i) => (
            <li key={`${tone}-${i}`} className="flex items-start gap-2 text-[13px] text-foreground">
              <Icon className={`h-3 w-3 mt-0.5 shrink-0 ${iconColor}`} />
              <span className="leading-snug">{label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
