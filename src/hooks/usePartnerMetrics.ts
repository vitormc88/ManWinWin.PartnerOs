import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PartnerMetric {
  partner_id: string;
  revenue: number;
  pipeline: number;
  clients: number;
  /** Composite 0-100 score derived from the three dimensions below. */
  health_score: number;
  /** Relationship Health dimension (0-100). Weight in composite: 40%. */
  relationship_score: number;
  /** Business Momentum dimension (0-100). Weight in composite: 35%. */
  momentum_score: number;
  /** Operational Engagement dimension (0-100). Weight in composite: 25%. */
  engagement_score: number;
  /** Human-readable positive drivers (exposed for future UI). */
  positive_factors: string[];
  /** Human-readable negative drivers (exposed for future UI). */
  negative_factors: string[];
}

export function usePartnerMetrics() {
  return useQuery({
    queryKey: ["partner-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_metrics" as any).select("*");
      if (error) throw error;
      const map: Record<string, PartnerMetric> = {};
      (data as any[] || []).forEach((r) => {
        map[r.partner_id] = {
          partner_id: r.partner_id,
          revenue: Number(r.revenue) || 0,
          pipeline: Number(r.pipeline) || 0,
          clients: Number(r.clients) || 0,
          health_score: Number(r.health_score) || 0,
          relationship_score: Number(r.relationship_score) || 0,
          momentum_score: Number(r.momentum_score) || 0,
          engagement_score: Number(r.engagement_score) || 0,
          positive_factors: Array.isArray(r.positive_factors) ? r.positive_factors : [],
          negative_factors: Array.isArray(r.negative_factors) ? r.negative_factors : [],
        };
      });
      return map;
    },
  });
}
