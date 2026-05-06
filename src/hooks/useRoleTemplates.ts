import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AccessLevel, EffectivePermission } from "@/lib/permissions";

export interface RoleTemplateRow {
  id: string;
  role: string;
  module_key: string;
  access_level: AccessLevel;
  updated_at: string;
}

export function useRoleTemplates() {
  return useQuery({
    queryKey: ["role-permission-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permission_templates" as any)
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as RoleTemplateRow[];
    },
  });
}

export function useSaveRoleTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      role,
      perms,
    }: {
      role: string;
      perms: { module_key: string; access_level: AccessLevel }[];
    }) => {
      const rows = perms.map((p) => ({
        role,
        module_key: p.module_key,
        access_level: p.access_level,
      }));
      const { error } = await supabase
        .from("role_permission_templates" as any)
        .upsert(rows as any, { onConflict: "role,module_key" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-permission-templates"] });
      qc.invalidateQueries({ queryKey: ["my-effective-permissions"] });
      qc.invalidateQueries({ queryKey: ["effective-permissions"] });
      toast.success("Role template saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save template"),
  });
}

export function useApplyRoleTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ role, overwriteOverrides }: { role: string; overwriteOverrides: boolean }) => {
      const { error } = await supabase.rpc("sync_role_template_to_users" as any, {
        _role: role as any,
        _overwrite_overrides: overwriteOverrides,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-effective-permissions"] });
      qc.invalidateQueries({ queryKey: ["effective-permissions"] });
      toast.success("Template applied to existing users");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to apply template"),
  });
}

export function useEffectivePermissions(userId: string | undefined) {
  return useQuery({
    queryKey: ["effective-permissions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_effective_permissions" as any, {
        _user_id: userId,
      } as any);
      if (error) throw error;
      return (data ?? []) as unknown as EffectivePermission[];
    },
  });
}

export function useMyEffectivePermissions() {
  return useQuery({
    queryKey: ["my-effective-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_effective_permissions" as any);
      if (error) throw error;
      return (data ?? []) as unknown as EffectivePermission[];
    },
    staleTime: 30_000,
  });
}

export function useResetUserToTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("reset_user_to_role_template" as any, {
        _user_id: userId,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_d, userId) => {
      qc.invalidateQueries({ queryKey: ["effective-permissions", userId] });
      qc.invalidateQueries({ queryKey: ["user-permissions", userId] });
      qc.invalidateQueries({ queryKey: ["my-effective-permissions"] });
      toast.success("Reset to role template");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reset"),
  });
}
