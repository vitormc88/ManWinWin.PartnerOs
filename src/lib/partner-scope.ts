/**
 * Partner-scoped UI derivation (presentation only — never changes query/RLS scope).
 *
 * A user is "partner scoped" when they are not HQ and can genuinely only see a
 * single partner. In that case partner filters / partner columns are noise.
 */
export interface PartnerScopeInput {
  isHQ: boolean;
  partnerId?: string | null;
  /** Number of partners actually visible to this user (post-RLS). */
  visiblePartnerCount?: number;
}

export function isPartnerScopedView({ isHQ, partnerId, visiblePartnerCount }: PartnerScopeInput): boolean {
  if (isHQ) return false;
  if (partnerId) return true;
  return typeof visiblePartnerCount === "number" && visiblePartnerCount <= 1;
}

export function clientsSubtitle(partnerScoped: boolean): string {
  return partnerScoped
    ? "Your clients, licenses and contract status"
    : "Centralized license management across all partners";
}
