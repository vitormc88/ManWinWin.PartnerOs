import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyPermissions } from "@/hooks/useUsers";
import { INTERNAL_ONLY_MODULES } from "@/lib/module-access";
import { rank, type AccessLevel } from "@/lib/permissions";

/**
 * Frontend access-level gate (no_access < view < edit < admin).
 *
 * This is a UX affordance only — production RLS remains the security boundary.
 */
export function useModuleAccess() {
  const { isAdmin, profile } = useAuth();
  const { data: perms, isLoading, isResolved } = useMyPermissions();
  const isPartnerUser = profile?.is_hq === false;

  return useMemo(() => {
    const levelOf = (moduleKey: string): AccessLevel => {
      if (isAdmin) return "admin";
      if (isPartnerUser && INTERNAL_ONLY_MODULES.has(moduleKey)) return "no_access";
      const found = perms?.find((p) => p.module_key === moduleKey)?.access_level;
      return (found as AccessLevel) ?? "no_access";
    };

    return {
      isLoading: isLoading || !isResolved,
      isResolved,
      levelOf,
      canView: (moduleKey: string) => rank(levelOf(moduleKey)) >= 1,
      canEdit: (moduleKey: string) => rank(levelOf(moduleKey)) >= 2,
      canAdmin: (moduleKey: string) => rank(levelOf(moduleKey)) >= 3,
    };
  }, [perms, isAdmin, isPartnerUser, isLoading, isResolved]);
}
