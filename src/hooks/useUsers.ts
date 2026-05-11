import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { MODULE_KEYS_LIST, MODULE_LABELS } from "@/lib/module-access";

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
  invitation_sent_at?: string | null;
  invitation_accepted_at?: string | null;
  created_at: string | null;
  roles: string[];
  partner_name?: string;
}

export interface ModulePermission {
  module_key: string;
  access_level: string;
}

export { MODULE_KEYS_LIST, MODULE_LABELS };

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
      const { data, error } = await supabase.rpc("get_my_effective_permissions" as any);
      if (error) throw error;
      return ((data ?? []) as any[]).map((d) => ({
        module_key: d.module_key,
        access_level: d.access_level,
      })) as ModulePermission[];
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
      // Determine the user's role(s) and the matching role template, so we
      // only persist rows that actually differ from the template (real
      // overrides). This keeps `is_override` accurate and prevents the
      // "Custom permissions override active" banner from appearing for
      // unmodified users.
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const roles = (userRoles ?? []).map((r: any) => String(r.role));

      let templateMap = new Map<string, string>();
      if (roles.length > 0) {
        const { data: templates } = await supabase
          .from("role_permission_templates" as any)
          .select("module_key, access_level, role")
          .in("role", roles as any);
        // If user has multiple roles, take the highest access level per module.
        const rank: Record<string, number> = { no_access: 0, view: 1, edit: 2, admin: 3 };
        for (const row of (templates ?? []) as any[]) {
          const cur = templateMap.get(row.module_key);
          if (!cur || (rank[row.access_level] ?? 0) > (rank[cur] ?? 0)) {
            templateMap.set(row.module_key, row.access_level);
          }
        }
      }

      // Replace all overrides for this user
      const { error: delErr } = await supabase.from("user_module_permissions").delete().eq("user_id", userId);
      if (delErr) throw delErr;

      const toInsert = permissions
        .filter(p => {
          const tmpl = templateMap.get(p.module_key) ?? "no_access";
          return p.access_level !== tmpl; // only true overrides
        })
        .map(p => ({
          user_id: userId,
          module_key: p.module_key,
          access_level: p.access_level,
          is_override: true,
        } as any));

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from("user_module_permissions").insert(toInsert);
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["user-permissions", variables.userId] });
      qc.invalidateQueries({ queryKey: ["effective-permissions", variables.userId] });
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
      qc.invalidateQueries({ queryKey: ["my-effective-permissions"] });
      toast.success("Permissions saved");
    },
    onError: (e: any) => toast.error(mapUserError(e, "Failed to save permissions")),
  });
}
