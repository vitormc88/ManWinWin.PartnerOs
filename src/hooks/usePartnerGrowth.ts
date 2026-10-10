import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const RECRUITMENT_STAGES = ["Identified", "Contacted", "Engaged", "Qualified", "Agreement Pending", "Signed"] as const;
export const CLOSED_OUTCOMES = ["On Hold", "Not a Fit", "No Response"] as const;
export const ALL_STAGES = [...RECRUITMENT_STAGES, ...CLOSED_OUTCOMES] as const;
export type RecruitmentStage = typeof ALL_STAGES[number];
export type PartnerModel = "CMSC" | "CMAR" | "CMAI" | "Strategic Alliance";
export interface PartnerProspect {
  id: string; company_name: string; country: string; website: string | null;
  recruitment_stage: RecruitmentStage; proposed_partner_type: PartnerModel | null;
  hq_owner_user_id: string | null; description: string | null; source: string | null;
  fit_summary: string | null; interest_evidence: string | null;
  qualification_decision: "Proceed" | "Hold" | "Reject" | null;
  qualified_by: string | null; qualified_at: string | null;
  agreement_reference: string | null; agreement_signed_on: string | null;
  signed_verified_by: string | null; signed_verified_at: string | null;
  converted_partner_id: string | null; archived_at: string | null;
  created_at: string; updated_at: string;
}
export interface ProspectContact {
  id: string; prospect_id: string; name: string; job_title: string | null;
  email: string | null; phone: string | null; is_primary: boolean;
}
export interface ProspectActivity {
  id: string; prospect_id: string; kind: string; content: string;
  occurred_at: string; created_by: string;
}
export interface ProspectTask {
  id: string; title: string; due_date: string | null; task_status: string; status: string;
  related_entity_id: string | null; related_type: string;
  owner_user_id: string | null; priority: string | null;
}
const root = ["partner-growth"];
function check(error: { message: string } | null) { if (error) throw error; }

export function usePartnerProspects() {
  return useQuery({
    queryKey: [...root, "prospects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_prospects" as any)
        .select("*").is("archived_at", null).order("company_name");
      check(error);
      return (data ?? []) as unknown as PartnerProspect[];
    },
  });
}
export function usePartnerProspect(id?: string) {
  return useQuery({
    queryKey: [...root, "prospect", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_prospects" as any)
        .select("*").eq("id", id!).single();
      check(error);
      return data as unknown as PartnerProspect;
    },
  });
}
export function useProspectContacts(id?: string) {
  return useQuery({
    queryKey: [...root, "contacts", id], enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_prospect_contacts" as any)
        .select("*").eq("prospect_id", id!).order("is_primary", { ascending: false });
      check(error);
      return (data ?? []) as unknown as ProspectContact[];
    },
  });
}
export function useProspectActivities(id?: string) {
  return useQuery({
    queryKey: [...root, "activities", id], enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_prospect_activities" as any)
        .select("*").eq("prospect_id", id!).order("occurred_at", { ascending: false });
      check(error);
      return (data ?? []) as unknown as ProspectActivity[];
    },
  });
}
export function useProspectTasks(id?: string) {
  return useQuery({
    queryKey: [...root, "tasks", id ?? "all"],
    queryFn: async () => {
      let query = supabase.from("manual_tasks")
        .select("id,title,due_date,status,task_status,related_entity_id,related_type,owner_user_id,priority")
        .eq("related_type", "partner_prospect");
      if (id) query = query.eq("related_entity_id", id);
      const { data, error } = await query.order("due_date", { ascending: true });
      check(error);
      return (data ?? []) as unknown as ProspectTask[];
    },
  });
}
export function useCreateProspect() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { company_name: string; country: string; proposed_partner_type?: PartnerModel | null; website?: string }) => {
      if (!user?.id) throw new Error("Authentication required");
      const { data, error } = await supabase.from("partner_prospects" as any).insert({
        company_name: input.company_name.trim(), country: input.country,
        proposed_partner_type: input.proposed_partner_type || null,
        website: input.website?.trim() || null, created_by: user.id, recruitment_stage: "Identified",
      }).select("*").single();
      check(error);
      return data as unknown as PartnerProspect;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}
export function useUpdateProspect(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<PartnerProspect,
      "recruitment_stage" | "proposed_partner_type" | "company_name" | "country" |
      "website" | "description" | "source" | "fit_summary" | "interest_evidence" |
      "qualification_decision" | "agreement_reference" | "agreement_signed_on" |
      "hq_owner_user_id">>) => {
      const { data, error } = await supabase.from("partner_prospects" as any)
        .update(patch).eq("id", id).select("*").single();
      check(error);
      return data as unknown as PartnerProspect;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}
export function useAddProspectContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; email?: string; job_title?: string; phone?: string }) => {
      const { data, error } = await supabase.from("partner_prospect_contacts" as any)
        .insert({ prospect_id: id, name: input.name.trim(), email: input.email?.trim() || null,
          job_title: input.job_title?.trim() || null, phone: input.phone?.trim() || null })
        .select("*").single();
      check(error);
      return data as unknown as ProspectContact;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}
export function useAddProspectActivity(id: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { kind: "note" | "interaction" | "meeting"; content: string }) => {
      if (!user?.id) throw new Error("Authentication required");
      const { error } = await supabase.from("partner_prospect_activities" as any)
        .insert({ prospect_id: id, kind: input.kind, content: input.content.trim(), created_by: user.id });
      check(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}
export function useCreateProspectTask(id: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { title: string; due_date?: string; priority?: string }) => {
      if (!user?.id) throw new Error("Authentication required");
      const { error } = await supabase.from("manual_tasks").insert({
        title: input.title.trim(), related_type: "partner_prospect" as any,
        related_entity_id: id, created_by: user.id, owner_user_id: user.id,
        task_type: "follow_up", priority: input.priority ?? "Medium",
        due_date: input.due_date || null, task_status: "Open",
      } as any);
      check(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: root });
      qc.invalidateQueries({ queryKey: ["unified_tasks"] });
    },
  });
}
