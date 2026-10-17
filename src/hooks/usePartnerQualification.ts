import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { PartnerModel } from "@/hooks/usePartnerGrowth";

export type EvidenceAnswer = "yes" | "no" | "unknown";
export interface ProspectQualification {
  prospect_id: string;
  research_summary: string;
  market_fit: EvidenceAnswer;
  commercial_reach: EvidenceAnswer;
  complementary_value: EvidenceAnswer;
  commitment: EvidenceAnswer;
  business_viability: EvidenceAnswer;
  can_introduce: EvidenceAnswer;
  can_sell: EvidenceAnswer;
  can_implement: EvidenceAnswer;
  discovery_notes: string;
  risks_and_gaps: string;
  recommended_next_action: string;
  updated_at: string;
}
export type QualificationDraft = Omit<ProspectQualification, "prospect_id" | "updated_at">;
export interface ResearchSource {
  id: string;
  prospect_id: string;
  title: string;
  source_url: string | null;
  source_kind: "website" | "public_source" | "meeting" | "internal";
  finding: string;
  evidence_state: "unverified" | "verified_by_hq";
  verified_at: string | null;
  created_at: string;
}

export const EMPTY_QUALIFICATION: QualificationDraft = {
  research_summary: "",
  market_fit: "unknown",
  commercial_reach: "unknown",
  complementary_value: "unknown",
  commitment: "unknown",
  business_viability: "unknown",
  can_introduce: "unknown",
  can_sell: "unknown",
  can_implement: "unknown",
  discovery_notes: "",
  risks_and_gaps: "",
  recommended_next_action: "",
};

export const FIT_DIMENSIONS = [
  { field: "market_fit", name: "Market Fit", help: "Customers and sectors relevant to ManWinWin" },
  { field: "commercial_reach", name: "Commercial Reach", help: "Access to real customer decision-makers" },
  { field: "complementary_value", name: "Complementary Value", help: "A clear technical or commercial value proposition" },
  { field: "commitment", name: "Commitment", help: "A named sponsor and concrete next step" },
  { field: "business_viability", name: "Business Viability", help: "A realistic contractual and operating model" },
] as const;

export function getRecommendedModel(q: Pick<QualificationDraft, "can_introduce" | "can_sell" | "can_implement">): PartnerModel | null {
  if (q.can_implement === "yes" && q.can_sell === "yes") return "CMAI";
  if (q.can_sell === "yes") return "CMAR";
  if (q.can_introduce === "yes") return "CMSC";
  return null;
}

export function getQualificationSummary(q: QualificationDraft) {
  const answers = FIT_DIMENSIONS.map((item) => q[item.field]);
  const positives = answers.filter((x) => x === "yes").length;
  const gaps = answers.filter((x) => x === "unknown").length;
  const concerns = answers.filter((x) => x === "no").length;
  const model = getRecommendedModel(q);
  const readiness = q.can_sell === "yes" && q.can_implement === "yes"
    ? "Potential implementer pathway — HQ practical accreditation required"
    : q.can_sell === "yes"
      ? "Commercial pathway — demo assessment and HQ approval still required"
      : q.can_introduce === "yes"
        ? "Connector pathway — software demo accreditation not required"
        : "Operational role has not been established";
  const next = q.recommended_next_action.trim() || (concerns >= 2
    ? "Clarify critical concerns before proceeding"
    : gaps > 0
      ? "Resolve missing evidence in the next discovery call"
      : "Request an explicit HQ qualification decision");
  return {
    positives, gaps, concerns, model, readiness, next,
    assessment: concerns >= 2 ? "Reassess partnership fit"
      : gaps > 0 ? "Further qualification needed"
      : "Ready for HQ assessment",
  };
}

export function buildDiscoveryQuestions(q: QualificationDraft, companyName: string) {
  const questions = [
    "Which customer segments, industries and decision-makers can your company access?",
    "What business problem would a partnership with ManWinWin solve for your customers?",
    "Who will own the relationship, and what first concrete action can they commit to?",
  ];
  if (q.can_introduce === "unknown") {
    questions.push("Would you be comfortable introducing qualified customers while ManWinWin manages the demo, proposal and sale?");
  }
  if (q.can_sell === "unknown") {
    questions.push("Do you intend to handle the sales cycle yourself, or mainly refer prospects?");
  } else if (q.can_sell === "yes") {
    questions.push("Who would run the ManWinWin demonstrations, prepare quotations and handle negotiations?");
  }
  if (q.can_implement === "unknown") {
    questions.push("Does your team want to implement the software, or would delivery remain with ManWinWin?");
  } else if (q.can_implement === "yes") {
    questions.push("Which team members can demonstrate practical CMMS implementation experience?");
  }
  if (q.complementary_value !== "yes") {
    questions.push("What concrete joint use case would make " + companyName + " and ManWinWin more valuable together?");
  }
  if (q.commitment !== "yes") {
    questions.push("What named resource and first milestone can your company commit to?");
  }
  return questions;
}

const root = ["partner-growth"];
function check(error: { message: string } | null) { if (error) throw error; }

export function useProspectQualification(prospectId?: string) {
  return useQuery({
    queryKey: [...root, "qualification", prospectId], enabled: !!prospectId,
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_prospect_qualifications" as any)
        .select("*").eq("prospect_id", prospectId!).maybeSingle();
      check(error);
      return data as unknown as ProspectQualification | null;
    },
  });
}
export function useResearchSources(prospectId?: string) {
  return useQuery({
    queryKey: [...root, "sources", prospectId], enabled: !!prospectId,
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_prospect_research_sources" as any)
        .select("*").eq("prospect_id", prospectId!).order("created_at", { ascending: false });
      check(error);
      return (data ?? []) as unknown as ResearchSource[];
    },
  });
}
export function useSaveProspectQualification(prospectId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: QualificationDraft) => {
      if (!user?.id) throw new Error("Authentication required");
      const { error } = await supabase.from("partner_prospect_qualifications" as any)
        .upsert({ ...draft, prospect_id: prospectId, updated_by: user.id }, { onConflict: "prospect_id" });
      check(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}
export function useAddResearchSource(prospectId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Pick<ResearchSource, "title" | "source_url" | "source_kind" | "finding">) => {
      if (!user?.id) throw new Error("Authentication required");
      const { error } = await supabase.from("partner_prospect_research_sources" as any).insert({
        ...input, prospect_id: prospectId, created_by: user.id, evidence_state: "unverified",
      });
      check(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}
export function useVerifyResearchSource(prospectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, verified }: { id: string; verified: boolean }) => {
      const { error } = await supabase.from("partner_prospect_research_sources" as any)
        .update({ evidence_state: verified ? "verified_by_hq" : "unverified" }).eq("id", id).eq("prospect_id", prospectId);
      check(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}
