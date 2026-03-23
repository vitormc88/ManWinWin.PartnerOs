import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const mapUserError = (error: any, fallback: string) => {
  const message = error?.message || fallback;
  if (message.toLowerCase().includes("last active hq admin")) return "You cannot change or deactivate the last active HQ Admin.";
  if (message.toLowerCase().includes("row-level security") || message.toLowerCase().includes("permission denied")) return "You do not have permission to perform this action.";
  return message;
};

export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  partner_id: string | null;
  is_hq: boolean | null;
  is_active: boolean | null;
  last_login_at: string | null;
  invitation_status: string | null;
  created_at: string | null;
  roles: string[];
  partner_name?: string;
}

export interface ModulePermission {
  module_key: string;
  access_level: string;
}

const MODULE_KEYS = [
  "dashboard", "clients", "renewals", "pipeline", "deal_registrations",
  "commissions", "onboarding", "certifications", "knowledge_base",
  "training", "announcements", "community", "settings",
];

export const MODULE_KEYS_LIST = MODULE_KEYS;

export const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  clients: "Clients & Licenses",
  renewals: "Renewals",
  pipeline: "Pipeline",
  deal_registrations: "Deal Registrations",
  commissions: "Commissions",
  onboarding: "Onboarding",
  certifications: "Certifications",
  knowledge_base: "Knowledge Base",
  training: "Training",
  announcements: "Announcements",
  community: "Community",
  settings: "Settings",
};

export function useUsers() {
  return useQuery({
    queryKey: ["users-management"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const { data: allRoles } = await supabase
        .from("user_roles")
        .select("user_id, role");

      const { data: partners } = await supabase
        .from("partners")
        .select("id, company_name");

      const partnerMap = new Map(partners?.map(p => [p.id, p.company_name]) || []);
      const roleMap = new Map<string, string[]>();
      allRoles?.forEach(r => {
        const existing = roleMap.get(r.user_id) || [];
        existing.push(r.role);
        roleMap.set(r.user_id, existing);
      });

      return (profiles || []).map(p => ({
        ...p,
        roles: roleMap.get(p.id) || [],
        partner_name: p.partner_id ? partnerMap.get(p.partner_id) || "Unknown" : undefined,
      })) as UserProfile[];
    },
  });
}

export function useUserPermissions(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-permissions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_module_permissions")
        .select("module_key, access_level")
        .eq("user_id", userId!);
      if (error) throw error;
      return data as ModulePermission[];
    },
  });
}

export function useMyPermissions() {
  const { user, isLoading: authLoading } = useAuth();
  const authUserId = user?.id ?? null;

  const query = useQuery({
    queryKey: ["my-permissions", authUserId],
    enabled: !!authUserId && !authLoading,
    queryFn: async () => {
      if (!authUserId) return [];
      const { data, error } = await supabase
        .from("user_module_permissions")
        .select("module_key, access_level")
        .eq("user_id", authUserId);
      if (error) throw error;
      return (data ?? []) as ModulePermission[];
    },
    staleTime: 30_000,
  });

  const isResolved = authLoading ? false : !authUserId || query.status === "success" || query.isError;

  return useMemo(
    () => ({
      ...query,
      data: isResolved ? (query.data ?? []) : undefined,
      isLoading: !isResolved,
      isResolved,
    }),
    [isResolved, query]
  );
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, updates }: {
      userId: string;
      updates: { full_name?: string; phone?: string; partner_id?: string | null; is_hq?: boolean; is_active?: boolean };
    }) => {
      const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users-management"] }); toast.success("User updated"); },
    onError: (e: any) => toast.error(mapUserError(e, "Failed to update user")),
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data: existingRoles, error: readErr } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (readErr) throw readErr;

      const hasRoleAlready = existingRoles?.some((item) => String(item.role) === role);
      if (!hasRoleAlready) {
        const { error: insErr } = await supabase.from("user_roles").insert({ user_id: userId, role } as any);
        if (insErr) throw insErr;
      }

      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId).neq("role", role as any);
      if (delErr) throw delErr;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users-management"] }); toast.success("Role updated"); },
    onError: (e: any) => toast.error(mapUserError(e, "Failed to update role")),
  });
}

export function useSavePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, permissions }: { userId: string; permissions: ModulePermission[] }) => {
      // Delete all existing
      const { error: delErr } = await supabase.from("user_module_permissions").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      // Insert new ones (skip no_access)
      const toInsert = permissions
        .filter(p => p.access_level !== "no_access")
        .map(p => ({ user_id: userId, module_key: p.module_key, access_level: p.access_level }));
      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from("user_module_permissions").insert(toInsert);
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_data, variables) => {
      // Invalidate the specific user's permissions cache
      qc.invalidateQueries({ queryKey: ["user-permissions", variables.userId] });
      // Invalidate my-permissions only if the edited user is the current user
      // (this is safe — if it's a different user, the invalidation just triggers a no-op refetch)
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
      toast.success("Permissions saved");
    },
    onError: (e: any) => toast.error(mapUserError(e, "Failed to save permissions")),
  });
}
