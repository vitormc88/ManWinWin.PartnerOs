export type AccessLevel = "no_access" | "view" | "edit" | "admin";

export interface EffectivePermission {
  module_key: string;
  access_level: AccessLevel;
  is_override: boolean;
  template_level: AccessLevel;
}

const RANK: Record<AccessLevel, number> = {
  no_access: 0,
  view: 1,
  edit: 2,
  admin: 3,
};

export function rank(level: string | undefined | null): number {
  return RANK[(level as AccessLevel) ?? "no_access"] ?? 0;
}

export function getLevel(perms: EffectivePermission[] | undefined, moduleKey: string): AccessLevel {
  return ((perms?.find((p) => p.module_key === moduleKey)?.access_level) as AccessLevel) ?? "no_access";
}

export function canAccessModule(perms: EffectivePermission[] | undefined, moduleKey: string) {
  return rank(getLevel(perms, moduleKey)) >= 1;
}
export function canView(perms: EffectivePermission[] | undefined, moduleKey: string) {
  return rank(getLevel(perms, moduleKey)) >= 1;
}
export function canEdit(perms: EffectivePermission[] | undefined, moduleKey: string) {
  return rank(getLevel(perms, moduleKey)) >= 2;
}
export function canAdmin(perms: EffectivePermission[] | undefined, moduleKey: string) {
  return rank(getLevel(perms, moduleKey)) >= 3;
}

export const ROLE_OPTIONS = [
  { value: "hq_admin", label: "HQ Admin", type: "hq", deprecated: false },
  { value: "hq_standard", label: "HQ Standard", type: "hq", deprecated: false },
  { value: "partner_admin", label: "Partner Admin", type: "partner", deprecated: false },
  { value: "partner_sales", label: "Partner Sales", type: "partner", deprecated: false },
  { value: "partner_restricted", label: "Partner Read Only", type: "partner", deprecated: false },
  { value: "partner_manager", label: "Partner Manager (deprecated)", type: "partner", deprecated: true },
] as const;

export type RoleValue = (typeof ROLE_OPTIONS)[number]["value"];

export function roleType(role: string | undefined | null): "hq" | "partner" {
  return role?.startsWith("hq_") ? "hq" : "partner";
}
