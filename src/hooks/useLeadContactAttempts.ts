import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const CONTACT_CHANNELS = ["call", "email", "linkedin", "meeting", "other"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CONTACT_OUTCOMES = [
  "no_answer",
  "left_voicemail",
  "reached",
  "bounced",
  "replied",
  "scheduled",
  "unreachable",
  "other",
] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

export const OUTCOME_LABEL: Record<ContactOutcome, string> = {
  no_answer: "No answer",
  left_voicemail: "Left voicemail",
  reached: "Reached contact",
  bounced: "Bounced / invalid",
  replied: "Replied",
  scheduled: "Meeting scheduled",
  unreachable: "Marked unreachable",
  other: "Other",
};

export const CHANNEL_LABEL: Record<ContactChannel, string> = {
  call: "Call",
  email: "Email",
  linkedin: "LinkedIn",
  meeting: "Meeting",
  other: "Other",
};

export type LeadContactAttempt = {
  id: string;
  lead_id: string;
  channel: ContactChannel;
  outcome: ContactOutcome;
  notes: string | null;
  performed_by: string | null;
  performed_at: string;
  created_at: string;
};

export function useLeadContactAttempts(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead-contact-attempts", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lead_contact_attempts")
        .select("*")
        .eq("lead_id", leadId!)
        .order("performed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as LeadContactAttempt[];
    },
  });
}

/** Derives a new engagement status from attempts after a fresh one is logged. */
export function deriveEngagement(
  attempts: { outcome: ContactOutcome }[],
): string {
  if (attempts.length === 0) return "New";
  const reached = attempts.some((a) => a.outcome === "reached" || a.outcome === "replied");
  const scheduled = attempts.some((a) => a.outcome === "scheduled");
  const failed = attempts.filter((a) =>
    ["no_answer", "left_voicemail", "bounced"].includes(a.outcome),
  ).length;
  const unreachable = attempts.some((a) => a.outcome === "unreachable");
  if (scheduled) return "Discovery Scheduled";
  if (reached) return "Engaged";
  if (unreachable || failed >= 5) return "Unreachable";
  if (failed >= 3) return "Silent";
  return "Attempted";
}

export function useLogContactAttempt() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: {
      lead_id: string;
      channel: ContactChannel;
      outcome: ContactOutcome;
      notes?: string;
    }) => {
      const performed_at = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from("lead_contact_attempts")
        .insert({
          lead_id: args.lead_id,
          channel: args.channel,
          outcome: args.outcome,
          notes: args.notes || null,
          performed_by: user?.id || null,
          performed_at,
        })
        .select("*")
        .single();
      if (error) throw error;

      // Fetch existing attempts (including the new one) to derive engagement.
      const { data: all } = await (supabase as any)
        .from("lead_contact_attempts")
        .select("outcome")
        .eq("lead_id", args.lead_id);
      const next = deriveEngagement((all || []) as { outcome: ContactOutcome }[]);

      await (supabase as any)
        .from("incoming_leads")
        .update({
          last_contact_at: performed_at,
          last_outcome: args.outcome,
          engagement_status: next,
        })
        .eq("id", args.lead_id);

      return data as LeadContactAttempt;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["lead-contact-attempts", data.lead_id] });
      qc.invalidateQueries({ queryKey: ["incoming_lead", data.lead_id] });
      qc.invalidateQueries({ queryKey: ["incoming_leads"] });
    },
  });
}
