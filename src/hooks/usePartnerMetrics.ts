import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PartnerMetric {
  partner_id: string;
  revenue: number;
  pipeline: number;
  clients: number;
  health_score: number;
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
        };
      });
      return map;
    },
  });
}
