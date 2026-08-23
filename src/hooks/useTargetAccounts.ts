import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  buildLeadNotes,
  matchDuplicates,
  normaliseDomain,
  type DuplicateCandidate,
} from "@/lib/prospecting";

export type TargetAccount = Tables<"target_accounts">;
export type TargetAccountEvidence = Tables<"target_account_evidence">;
export type TargetAccountSignal = Tables<"target_account_signals">;
export type TargetAccountPerson = Tables<"target_account_people">;

export type TargetAccountRow = TargetAccount & {
  evidence_count: number;
  signal_count: number;
  people_with_role_count: number;
  primary_contact_name: string | null;
};

const LIST_KEY = ["target_accounts"] as const;

/** List view: accounts plus lightweight child counts for completeness/priority. */
export function useTargetAccounts() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async (): Promise<TargetAccountRow[]> => {
      const { data: accounts, error } = await supabase
        .from("target_accounts")
        .select("*")
        .order("priority_total", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const ids = (accounts || []).map((a) => a.id);
      if (ids.length === 0) return [];

      const [evidence, signals, people] = await Promise.all([
        supabase.from("target_account_evidence").select("target_account_id").in("target_account_id", ids),
        supabase.from("target_account_signals").select("target_account_id").in("target_account_id", ids),
        supabase
          .from("target_account_people")
          .select("target_account_id, full_name, conversation_role, is_primary_contact")
          .in("target_account_id", ids),
      ]);

      const count = (rows: { target_account_id: string }[] | null | undefined) => {
        const m = new Map<string, number>();
        (rows || []).forEach((r) => m.set(r.target_account_id, (m.get(r.target_account_id) || 0) + 1));
        return m;
      };
      const evidenceMap = count(evidence.data);
      const signalMap = count(signals.data);
      const roleMap = new Map<string, number>();
      const primaryMap = new Map<string, string>();
      (people.data || []).forEach((p) => {
        if (p.conversation_role && p.conversation_role !== "unknown") {
          roleMap.set(p.target_account_id, (roleMap.get(p.target_account_id) || 0) + 1);
        }
        if (p.is_primary_contact) primaryMap.set(p.target_account_id, p.full_name);
      });

      return (accounts || []).map((a) => ({
        ...a,
        evidence_count: evidenceMap.get(a.id) || 0,
        signal_count: signalMap.get(a.id) || 0,
        people_with_role_count: roleMap.get(a.id) || 0,
        primary_contact_name: primaryMap.get(a.id) || null,
      }));
    },
  });
}

export function useTargetAccount(id: string | undefined) {
  return useQuery({
    queryKey: ["target_account", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("target_accounts").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as TargetAccount;
    },
  });
}

export function useTargetAccountEvidence(id: string | undefined) {
  return useQuery({
    queryKey: ["target_account_evidence", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("target_account_evidence")
        .select("*")
        .eq("target_account_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TargetAccountEvidence[];
    },
  });
}

export function useTargetAccountSignals(id: string | undefined) {
  return useQuery({
    queryKey: ["target_account_signals", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("target_account_signals")
        .select("*")
        .eq("target_account_id", id!)
        .order("signal_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as TargetAccountSignal[];
    },
  });
}

export function useTargetAccountPeople(id: string | undefined) {
  return useQuery({
    queryKey: ["target_account_people", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("target_account_people")
        .select("*")
        .eq("target_account_id", id!)
        .order("is_primary_contact", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as TargetAccountPerson[];
    },
  });
}

function invalidateAccount(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: LIST_KEY });
  if (id) {
    qc.invalidateQueries({ queryKey: ["target_account", id] });
    qc.invalidateQueries({ queryKey: ["target_account_evidence", id] });
    qc.invalidateQueries({ queryKey: ["target_account_signals", id] });
    qc.invalidateQueries({ queryKey: ["target_account_people", id] });
  }
}

export function useCreateTargetAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      company_name: string;
      country: string;
      website?: string | null;
      industry?: string | null;
      owner_user_id?: string | null;
      partner_uuid?: string | null;
      created_by?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("target_accounts")
        .insert({
          ...input,
          website_domain: normaliseDomain(input.website) || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as TargetAccount;
    },
    onSuccess: (data) => invalidateAccount(qc, data.id),
  });
}

export function useUpdateTargetAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, unknown>) => {
      const payload: Record<string, unknown> = { ...updates };
      delete payload.priority_total; // generated column
      if (typeof updates.website === "string") {
        payload.website_domain = normaliseDomain(updates.website) || null;
      }
      const { data, error } = await supabase
        .from("target_accounts")
        .update(payload as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as TargetAccount;
    },
    onSuccess: (data) => invalidateAccount(qc, data.id),
  });
}

export function useAddEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      target_account_id: string;
      fact: string;
      source?: string | null;
      link?: string | null;
      evidence_date?: string | null;
      created_by?: string | null;
    }) => {
      const { error } = await supabase.from("target_account_evidence").insert(input);
      if (error) throw error;
      return input.target_account_id;
    },
    onSuccess: (id) => invalidateAccount(qc, id),
  });
}

export function useAddSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      target_account_id: string;
      signal_type: string;
      description?: string | null;
      signal_date?: string | null;
      source?: string | null;
      created_by?: string | null;
    }) => {
      const { error } = await supabase.from("target_account_signals").insert(input);
      if (error) throw error;
      return input.target_account_id;
    },
    onSuccess: (id) => invalidateAccount(qc, id),
  });
}

export function useAddPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      target_account_id: string;
      full_name: string;
      job_title?: string | null;
      conversation_role: string;
      email?: string | null;
      phone?: string | null;
      linkedin_url?: string | null;
      created_by?: string | null;
    }) => {
      const { error } = await supabase.from("target_account_people").insert(input);
      if (error) throw error;
      return input.target_account_id;
    },
    onSuccess: (id) => invalidateAccount(qc, id),
  });
}

export function useSetPrimaryContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, personId }: { accountId: string; personId: string }) => {
      // Clear first — a partial unique index allows only one primary per account.
      const { error: clearError } = await supabase
        .from("target_account_people")
        .update({ is_primary_contact: false })
        .eq("target_account_id", accountId)
        .eq("is_primary_contact", true);
      if (clearError) throw clearError;
      const { error } = await supabase
        .from("target_account_people")
        .update({ is_primary_contact: true })
        .eq("id", personId);
      if (error) throw error;
      return accountId;
    },
    onSuccess: (id) => invalidateAccount(qc, id),
  });
}

export function useDeleteChildRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      table,
      id,
      accountId,
    }: {
      table: "target_account_evidence" | "target_account_signals" | "target_account_people";
      id: string;
      accountId: string;
    }) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      return accountId;
    },
    onSuccess: (id) => invalidateAccount(qc, id),
  });
}

/**
 * Soft duplicate lookup across Target Accounts, Leads, Opportunities and Clients.
 * Advisory only — the UI never blocks on the result.
 */
export function useDuplicateCheck(input: { company_name: string; website?: string | null }) {
  const domain = normaliseDomain(input.website);
  const name = input.company_name.trim();
  return useQuery({
    queryKey: ["target_account_duplicates", name.toLowerCase(), domain],
    enabled: name.length >= 3,
    queryFn: async (): Promise<DuplicateCandidate[]> => {
      const like = `%${name}%`;
      const [accounts, leads, deals, clients] = await Promise.all([
        supabase.from("target_accounts").select("id, company_name, website_domain").ilike("company_name", like).limit(10),
        supabase.from("incoming_leads").select("id, company_name").ilike("company_name", like).limit(10),
        supabase.from("deals").select("id, company_name").ilike("company_name", like).limit(10),
        supabase.from("clients").select("id, commercial_name, short_name, website").ilike("commercial_name", like).limit(10),
      ]);

      const candidates = [
        ...(accounts.data || []).map((r) => ({
          entity: "Target Account" as const,
          id: r.id,
          name: r.company_name,
          route: `/prospecting/${r.id}`,
          domain: r.website_domain,
        })),
        ...(leads.data || []).map((r) => ({
          entity: "Lead" as const,
          id: r.id,
          name: r.company_name || "",
          route: `/incoming-leads/${r.id}`,
          domain: null,
        })),
        ...(deals.data || []).map((r) => ({
          entity: "Opportunity" as const,
          id: r.id,
          name: r.company_name || "",
          route: `/deals/${r.id}`,
          domain: null,
        })),
        ...(clients.data || []).map((r) => ({
          entity: "Client" as const,
          id: r.id,
          name: r.commercial_name || r.short_name || "",
          route: `/clients/${r.id}`,
          domain: r.website,
        })),
      ];

      return matchDuplicates({ company_name: name, website_domain: domain }, candidates);
    },
  });
}

/**
 * The ONLY event that turns a Target Account into a Lead.
 * Copies company + primary contact + a context digest; research stays behind.
 */
export function useConvertTargetAccountToLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      account,
      primaryContact,
      evidence,
      signals,
    }: {
      account: TargetAccount;
      primaryContact: TargetAccountPerson;
      evidence: TargetAccountEvidence[];
      signals: TargetAccountSignal[];
    }) => {
      const { data: lead, error } = await supabase
        .from("incoming_leads")
        .insert({
          company_name: account.company_name,
          country: account.country,
          sector: account.industry,
          contact_name: primaryContact.full_name,
          email: primaryContact.email,
          phone: primaryContact.phone,
          job_role: primaryContact.job_title,
          lead_source: "Prospecting",
          linked_partner_id: account.partner_uuid,
          assigned_user_id: account.owner_user_id,
          source_target_account_id: account.id,
          notes: buildLeadNotes({
            maintenance_hypothesis: account.maintenance_hypothesis,
            key_research_gap: account.key_research_gap,
            evidence,
            signals,
          }),
        })
        .select()
        .single();
      if (error) throw error;

      const { error: linkError } = await supabase
        .from("target_accounts")
        .update({ status: "Converted", converted_lead_id: lead.id })
        .eq("id", account.id);
      if (linkError) throw linkError;

      return lead;
    },
    onSuccess: (lead) => {
      invalidateAccount(qc, lead.source_target_account_id || undefined);
      qc.invalidateQueries({ queryKey: ["incoming_leads"] });
    },
  });
}
