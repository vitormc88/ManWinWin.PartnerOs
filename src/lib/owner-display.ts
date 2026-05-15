/**
 * Single source of truth for owner display + ownership status.
 * Mirrors public.v_deal_ownership_status in the database.
 */

export type OwnershipStatus =
  | "assigned"
  | "inactive"
  | "unassigned"
  | "orphaned"
  | "needs_review";

export interface OwnerLike {
  assigned_user_id?: string | null;
  assigned_salesperson?: string | null;
}

export interface ProfileLite {
  full_name: string | null;
  email?: string;
  is_active?: boolean | null;
}

export type ProfilesMap = Map<string, ProfileLite>;

const UNASSIGNED_TEXT = new Set(["", "unassigned", "n/a", "-", "none"]);

export function getOwnershipStatus(
  owner: OwnerLike,
  profiles: ProfilesMap | undefined
): OwnershipStatus {
  const uid = owner.assigned_user_id ?? null;
  const text = (owner.assigned_salesperson || "").trim();
  if (uid) {
    const p = profiles?.get(uid);
    if (!p) return "orphaned";
    if (p.is_active === false) return "inactive";
    return "assigned";
  }
  if (text && !UNASSIGNED_TEXT.has(text.toLowerCase())) return "needs_review";
  return "unassigned";
}

export function getOwnerDisplay(
  owner: OwnerLike,
  profiles: ProfilesMap | undefined
): string {
  const uid = owner.assigned_user_id ?? null;
  if (uid) {
    const p = profiles?.get(uid);
    if (p?.full_name) return p.full_name;
    if (p?.email) return p.email;
    return "Orphaned user";
  }
  const text = (owner.assigned_salesperson || "").trim();
  if (text && !UNASSIGNED_TEXT.has(text.toLowerCase())) return text;
  return "Unassigned";
}

export function ownershipStatusLabel(s: OwnershipStatus): string {
  switch (s) {
    case "assigned": return "Assigned";
    case "inactive": return "Inactive";
    case "unassigned": return "Unassigned";
    case "orphaned": return "Orphaned";
    case "needs_review": return "Needs Review";
  }
}

export function ownershipStatusColor(s: OwnershipStatus): string {
  switch (s) {
    case "assigned": return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "inactive": return "text-slate-700 bg-slate-100 border-slate-200";
    case "unassigned": return "text-muted-foreground bg-muted border-border";
    case "orphaned": return "text-rose-700 bg-rose-50 border-rose-200";
    case "needs_review": return "text-amber-800 bg-amber-50 border-amber-200";
  }
}
