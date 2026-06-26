import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CommercialOpportunity {
  id: string;
  type: string;
  title: string;
  description: string;
  reason: string;
  estimated_arr: number;
  confidence: "high" | "medium" | "low";
  priority: "high" | "medium" | "low";
  source: string;
  related_item: string;
  recommended_action: string;
}

export interface CommercialRecommendedAction {
  id: string;
  priority: number;
  title: string;
  description: string;
  reason: string;
  impact: string;
  estimated_arr: number;
  action_type: string;
  related_route: string;
}

export interface CommercialRiskSignal {
  code: string;
  severity: "high" | "medium" | "low";
  message: string;
}

export interface ClientCommercialIntelligence {
  client_id: string;
  partner_id: string | null;
  client_name: string | null;
  partner_name: string | null;
  country: string | null;
  sector: string | null;
  active_license_count: number;
  active_contract_count: number;
  active_renewal_count: number;
  year1_value: number;
  recurring_arr: number;
  one_time_value: number;
  next_renewal_date: string | null;
  next_renewal_value: number;
  days_to_renewal: number | null;
  has_license: boolean;
  has_contract: boolean;
  has_active_renewal: boolean;
  license_family: string | null;
  license_variant: string | null;
  deployment_type: string | null;
  backoffice_users: number;
  web_users: number;
  api_access: boolean;
  sat_active: boolean;
  active_modules: Array<{ id: string; name: string; code: string | null; category: string | null }>;
  active_plugins: Array<{ id: string; name: string; code: string | null; category: string | null }>;
  recurring_items: Array<{ id: string; description: string; type: string; amount: number; billing_frequency: string | null }>;
  one_time_items: Array<{ id: string; description: string; type: string; amount: number }>;
  not_renewed_items: unknown[];
  missing_modules: Array<{ id: string; name: string; code: string | null; category: string | null }>;
  missing_plugins: Array<{ id: string; name: string; code: string | null; category: string | null }>;
  proposed_not_purchased: Array<{ item: string; code: string | null; category: string; reason: string; estimated_arr: number; confidence: string; recommended_action: string }>;
  upsell_opportunities: CommercialOpportunity[];
  risk_signals: CommercialRiskSignal[];
  recommended_actions: CommercialRecommendedAction[];
  commercial_score: number;
  expansion_potential: number;
  high_confidence_potential: number;
  medium_confidence_potential: number;
  low_confidence_potential: number;
  renewal_risk: "high" | "medium" | "low" | "unknown";
  confidence: "high" | "medium" | "low";
  updated_at: string;
}

export function useClientCommercialIntelligence(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ["client-commercial-intelligence", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_commercial_intelligence")
        .select("*")
        .eq("client_id", clientId!)
        .maybeSingle();
      if (error) throw error;
      return data as ClientCommercialIntelligence | null;
    },
  });
}

export interface CommercialIntelligenceFilters {
  partnerId?: string;
  renewalRisk?: "high" | "medium" | "low" | "unknown";
  minScore?: number;
  maxScore?: number;
}

export function useCommercialIntelligenceSummary(filters: CommercialIntelligenceFilters = {}) {
  return useQuery({
    queryKey: ["commercial-intelligence-summary", filters],
    queryFn: async () => {
      let query = (supabase as any).from("client_commercial_intelligence").select("*");
      if (filters.partnerId) query = query.eq("partner_id", filters.partnerId);
      if (filters.renewalRisk) query = query.eq("renewal_risk", filters.renewalRisk);
      if (typeof filters.minScore === "number") query = query.gte("commercial_score", filters.minScore);
      if (typeof filters.maxScore === "number") query = query.lte("commercial_score", filters.maxScore);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ClientCommercialIntelligence[];
    },
  });
}
