// Canonical "Due in N days" renewal KPI.
//
// The Renewals Pipeline is the source of truth: it consolidates explicit
// renewal records with those derived from contracts and licenses into ONE
// commercial renewal per client. The Clients & Licenses KPI must reuse the
// exact same consolidated rows and date-only semantics, otherwise it reports
// 0 while the pipeline shows real work (e.g. Raven / APS 08 Aug 2026).

import { parseDateOnly } from "@/lib/date-format";

export interface RenewalKpiRow {
  client_id?: string | null;
  renewal_date?: string | null;
  status?: string | null;
}

/** Statuses that are commercially closed and must never count as due work. */
const CLOSED_STATUSES = new Set(["won", "lost", "completed", "cancelled", "canceled"]);

export function isClosedRenewalStatus(status?: string | null): boolean {
  return CLOSED_STATUSES.has((status || "").trim().toLowerCase());
}

/**
 * Whole calendar days from today to the renewal date, using date-only
 * semantics (no timezone day shift).
 */
export function daysToRenewal(
  renewalDate: string | Date | null | undefined,
  today: Date = new Date()
): number | null {
  const d = parseDateOnly(renewalDate);
  if (!d) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}

/**
 * Distinct client IDs with at least one open commercial renewal whose
 * days_to_renewal is within [0, windowDays] inclusive.
 *
 * `activeClientIds`, when provided, restricts the count to clients the caller
 * considers active/visible (already partner/RLS scoped upstream).
 */
export function countClientsDueWithin(
  rows: RenewalKpiRow[],
  windowDays = 30,
  activeClientIds?: Set<string> | null,
  today: Date = new Date()
): number {
  const clients = new Set<string>();
  for (const r of rows) {
    if (!r.client_id) continue;
    if (activeClientIds && !activeClientIds.has(r.client_id)) continue;
    if (isClosedRenewalStatus(r.status)) continue;
    const days = daysToRenewal(r.renewal_date, today);
    if (days === null) continue;
    if (days >= 0 && days <= windowDays) clients.add(r.client_id);
  }
  return clients.size;
}
