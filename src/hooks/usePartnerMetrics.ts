import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { HealthFactor, PartnerMaturity } from "@/lib/partner-health-config";

export interface PartnerMetric {
  partner_id: string;
  revenue: number;
  pipeline: number;
  clients: number;
  /** Internal maturity classification (not necessarily surfaced in UI). */
  maturity: PartnerMaturity;
  /** Composite 0-100 score derived from the three dimensions below. */
  health_score: number;
  /** Relationship Health dimension (0-100). Default weight: 40%. */
  relationship_score: number;
  /** Business Momentum dimension (0-100). Default weight: 35%. */
  momentum_score: number;
  /** Operational Engagement dimension (0-100). Default weight: 25%. */
  engagement_score: number;
  /** Plain text positive drivers (kept for backward compatibility). */
  positive_factors: string[];
  /** Plain text negative drivers (kept for backward compatibility). */
  negative_factors: string[];
  /** Structured factors — preferred for UI. */
  factors: HealthFactor[];
}

function normalizeMaturity(value: unknown): PartnerMaturity {
  const v = String(value ?? "").toLowerCase();
  if (v === "new" || v === "onboarding" || v === "active" || v === "mature" || v === "dormant") {
    return v;
  }
  return "active";
}

function normalizeFactors(value: unknown): HealthFactor[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((f: any) => ({
      type: f?.type === "negative" ? "negative" : "positive",
      dimension:
        f?.dimension === "momentum" || f?.dimension === "engagement"
          ? f.dimension
          : "relationship",
      impact: f?.impact === "high" || f?.impact === "low" ? f.impact : "medium",
      label: String(f?.label ?? ""),
    }))
    .filter((f) => f.label) as HealthFactor[];
}

export function usePartnerMetrics() {
  return useQuery({
    queryKey: ["partner-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_metrics" as any).select("*");
      if (error) throw error;
      const map: Record<string, PartnerMetric> = {};
      (data as any[] || []).forEach((r) => {
        const maturity = normalizeMaturity(r.maturity);
        const positive = Array.isArray(r.positive_factors) ? r.positive_factors : [];
        const negative = Array.isArray(r.negative_factors) ? r.negative_factors : [];
        const structured = normalizeFactors(r.factors);
        const hasGenuineNegative =
          negative.length > 0 || structured.some((f) => f.type === "negative");

        let health = Number(r.health_score) || 0;
        let relationship = Number(r.relationship_score) || 0;
        let momentum = Number(r.momentum_score) || 0;
        let engagement = Number(r.engagement_score) || 0;

        // Executive principle: absence of evidence ≠ evidence of problems.
        // For new/onboarding partners without genuine negative signals, lift
        // dimensions and composite to a neutral floor so the partner is not
        // reported as "At Risk" purely because history is thin.
        if (!hasGenuineNegative && (maturity === "new" || maturity === "onboarding")) {
          const floor = maturity === "new" ? 55 : 50;
          relationship = Math.max(relationship, floor);
          momentum = Math.max(momentum, floor);
          engagement = Math.max(engagement, floor);
          health = Math.max(health, floor);
        }

        map[r.partner_id] = {
          partner_id: r.partner_id,
          revenue: Number(r.revenue) || 0,
          pipeline: Number(r.pipeline) || 0,
          clients: Number(r.clients) || 0,
          maturity,
          health_score: health,
          relationship_score: relationship,
          momentum_score: momentum,
          engagement_score: engagement,
          positive_factors: positive,
          negative_factors: negative,
          factors: structured,
        };
      });
      return map;
    },
  });
}
