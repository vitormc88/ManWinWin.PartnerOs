import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { AcademyCertificate, CertificateVerification } from "@/lib/academy-certificates";
import type { ItemAccessMap } from "@/lib/academy-access";

const QK = {
  mine: ["academy", "certificates", "mine"] as const,
  managed: ["academy", "certificates", "managed"] as const,
  verify: ["academy", "certificates", "verify"] as const,
  access: ["academy", "item-access"] as const,
};

/** Certificates owned by the authenticated learner only. */
export function useMyCertificates() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...QK.mine, user?.id ?? "anon"],
    enabled: !!user?.id,
    queryFn: async (): Promise<AcademyCertificate[]> => {
      const { data, error } = await supabase.rpc("academy_my_certificates");
      if (error) throw error;
      return (data ?? []) as unknown as AcademyCertificate[];
    },
  });
}

/**
 * Management surface. HQ/Academy admins see everything; partner users are
 * scoped server-side to their own partner.
 */
export function useManagedCertificates(partnerId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...QK.managed, user?.id ?? "anon", partnerId ?? "all"],
    enabled: !!user?.id,
    queryFn: async (): Promise<AcademyCertificate[]> => {
      const { data, error } = await supabase.rpc("academy_managed_certificates", {
        _partner_id: partnerId ?? undefined,
      });
      if (error) throw error;
      return (data ?? []) as unknown as AcademyCertificate[];
    },
  });
}

/** Public verification — minimized payload, safe for unauthenticated visitors. */
export function useVerifyCertificate(reference?: string) {
  return useQuery({
    queryKey: [...QK.verify, reference ?? "none"],
    enabled: !!reference,
    queryFn: async (): Promise<CertificateVerification> => {
      const { data, error } = await supabase.rpc("academy_verify_certificate", {
        _reference: reference!,
      });
      if (error) throw error;
      return (data ?? { found: false }) as unknown as CertificateVerification;
    },
  });
}

/** Server-authoritative sequencing for one module's learning items. */
export function useAcademyItemAccess(moduleId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...QK.access, user?.id ?? "anon", moduleId ?? "none"],
    enabled: !!moduleId && !!user?.id,
    queryFn: async (): Promise<ItemAccessMap> => {
      const { data, error } = await supabase.rpc("academy_item_access", {
        _module_id: moduleId!,
      });
      if (error) throw error;
      return data as unknown as ItemAccessMap;
    },
  });
}
