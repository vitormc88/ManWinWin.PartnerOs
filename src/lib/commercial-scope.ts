/**
 * Sales Module v1 — Sprint 1 commercial scope model.
 * Mirrors the server rules in
 * supabase/review-migrations/sales-s1/20261106140000_sales_s1_commercial_scope.sql.
 * The database is the authority; this is used for query scoping, cache keys
 * and to keep the rules under test. Never use it as the only guard.
 */
import type { ModuleAccessLevel } from "@/lib/module-access";

export const SALES_ENGINES = ["new_business", "partner", "account"] as const;
export type SalesEngine = (typeof SALES_ENGINES)[number];

export type ScopeActor = {
  id: string;
  isHq: boolean;
  isActive: boolean;
  partnerId: string | null;
  salesAccess: ModuleAccessLevel;
};

export type ScopeDeal = {
  sales_engine: SalesEngine | null;
  partner_id: string | null;
  assigned_user_id: string | null;
};

const rank: Record<ModuleAccessLevel, number> = { no_access: 0, view: 1, edit: 2, admin: 3 };

export const isDirect = (d: Pick<ScopeDeal, "sales_engine">) => d.sales_engine === "new_business";

export function isSalesManager(a: ScopeActor): boolean {
  return a.isHq && a.isActive && rank[a.salesAccess] >= 3;
}

function directAccess(a: ScopeActor, d: ScopeDeal, level: "view" | "edit"): boolean {
  if (!a.isHq || !a.isActive) return false;
  if (rank[a.salesAccess] >= 3) return true;
  return d.assigned_user_id === a.id && rank[a.salesAccess] >= (level === "edit" ? 2 : 1);
}

/** Pre-Sprint-1 rule, unchanged, for every non-Direct deal. */
function legacyAccess(a: ScopeActor, d: ScopeDeal): boolean {
  return a.isHq || (d.partner_id !== null && d.partner_id === a.partnerId);
}

export function canViewDeal(a: ScopeActor, d: ScopeDeal): boolean {
  return isDirect(d) ? directAccess(a, d, "view") : legacyAccess(a, d);
}

export function canManageDeal(a: ScopeActor, d: ScopeDeal): boolean {
  return isDirect(d) ? directAccess(a, d, "edit") : legacyAccess(a, d);
}

/** Scope-field change check (owner/engine/partner). Current AND proposed row must pass. */
export function canChangeScope(a: ScopeActor, current: ScopeDeal, next: ScopeDeal): boolean {
  if (!canManageDeal(a, current) || !canManageDeal(a, next)) return false;
  const touchesDirect = isDirect(current) || isDirect(next);
  if (!touchesDirect) return true;
  const changed =
    current.sales_engine !== next.sales_engine ||
    current.partner_id !== next.partner_id ||
    current.assigned_user_id !== next.assigned_user_id;
  return !changed || isSalesManager(a);
}

/** Sprint 1 interlock: Direct deals cannot be closed/awarded. */
export function canCloseAsWon(d: Pick<ScopeDeal, "sales_engine">): boolean {
  return !isDirect(d);
}

/** Query-key segment so Direct and Partner caches never mix. */
export function dealScopeKey(filters?: { sales_engine?: SalesEngine | null; assigned_user_id?: string }) {
  return { engine: filters?.sales_engine ?? "any", owner: filters?.assigned_user_id ?? "any" };
}
