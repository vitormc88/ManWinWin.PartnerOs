import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Server-authoritative renewal owner reassignment.
 * Authorization, eligibility, task migration and history are enforced inside
 * public.reassign_renewal_owner — the client never writes assigned_user_id directly.
 */
export function useReassignRenewalOwner() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      renewalId,
      newOwnerId,
      reason,
    }: {
      renewalId: string;
      newOwnerId: string | null;
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc("reassign_renewal_owner", {
        _renewal_id: renewalId,
        _new_owner: newOwnerId,
        _reason: reason ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["renewals"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "Owner updated", description: "The renewal owner was reassigned." });
    },
    onError: (e: any) => {
      const msg = String(e?.message || "");
      toast({
        variant: "destructive",
        title: "Could not reassign owner",
        description: msg.includes("NOT_AUTHORIZED")
          ? "You do not have permission to manage this renewal."
          : msg.includes("OWNER_NOT_ELIGIBLE")
          ? "That user cannot own this renewal."
          : msg.includes("RENEWAL_CLOSED")
          ? "Closed renewals are read-only."
          : msg || "Unexpected error.",
      });
    },
  });
}
