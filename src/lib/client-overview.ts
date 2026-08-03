/**
 * Client Detail — Overview / Commercial presentation logic (pure).
 *
 * This module contains NO data fetching and NO recomputation of canonical
 * financials. It only shapes values already produced by the canonical
 * helpers (commercial intelligence RPC, renewal resolution, date-format).
 */

import { formatDateOnly } from "@/lib/date-format";
import type { ResolvedRenewal } from "@/lib/renewal-resolution";

export type UrgencyTone = "critical" | "warning" | "calm" | "unknown";

export interface RenewalUrgency {
  label: string;
  tone: UrgencyTone;
}

/** Readable urgency for a renewal, date-only semantics (days already computed upstream). */
export function renewalUrgency(daysTo: number | null | undefined): RenewalUrgency {
  if (daysTo == null) return { label: "No renewal date on record", tone: "unknown" };
  if (daysTo < 0) return { label: `${Math.abs(daysTo)} days overdue`, tone: "critical" };
  if (daysTo === 0) return { label: "Due today", tone: "critical" };
  if (daysTo <= 30) return { label: `Due in ${daysTo} days`, tone: "critical" };
  if (daysTo <= 90) return { label: `Due in ${daysTo} days`, tone: "warning" };
  return { label: `In ${daysTo} days`, tone: "calm" };
}

export interface CommercialSummaryInput {
  intelligence?: { recurring_arr?: number | null; year1_value?: number | null } | null;
  resolvedRenewal?: ResolvedRenewal | null;
  contractStatus?: string | null;
  activeContractCount?: number | null;
}

export interface CommercialSummary {
  contractLabel: string;
  arr: number;
  year1: number;
  /** True when ARR is zero but a Year 1 value exists — never imply a €0 relationship. */
  arrZeroWithYear1: boolean;
  renewalDate: string | null;
  renewalLabel: string;
  daysTo: number | null;
  urgency: RenewalUrgency;
}

export function buildCommercialSummary(input: CommercialSummaryInput): CommercialSummary {
  const arr = Number(input.intelligence?.recurring_arr ?? 0) || 0;
  const year1 = Number(input.intelligence?.year1_value ?? 0) || 0;
  const renewalDate = input.resolvedRenewal?.date ?? null;
  const daysTo = input.resolvedRenewal?.daysTo ?? null;
  const count = Number(input.activeContractCount ?? 0) || 0;
  const contractLabel =
    (input.contractStatus && input.contractStatus.trim()) ||
    (count > 0 ? `${count} active` : "No contract on record");

  return {
    contractLabel,
    arr,
    year1,
    arrZeroWithYear1: arr === 0 && year1 > 0,
    renewalDate,
    renewalLabel: renewalDate ? formatDateOnly(renewalDate) : "Not scheduled",
    daysTo,
    urgency: renewalUrgency(daysTo),
  };
}

export interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  severity: "critical" | "warning" | "info";
  /** Existing, working route. Only rendered when the user may act. */
  route?: string;
  actionLabel?: string;
}

export interface AttentionInput {
  resolvedRenewal?: ResolvedRenewal | null;
  hasLicense?: boolean;
  hasContacts?: boolean;
  clientStatus?: string | null;
}

/**
 * The single highest-priority, evidence-backed item — or null when the client
 * is healthy (calm state). Never returns speculative "opportunities".
 */
export function deriveTopAttention(input: AttentionInput): AttentionItem | null {
  const days = input.resolvedRenewal?.daysTo ?? null;
  const date = input.resolvedRenewal?.date ?? null;

  if (date && days != null && days < 0) {
    return {
      id: "renewal_overdue",
      title: `Renewal overdue by ${Math.abs(days)} days`,
      detail: `The commercial renewal date was ${formatDateOnly(date)}.`,
      severity: "critical",
      route: "?tab=commercial",
      actionLabel: "Open Commercial",
    };
  }
  if (date && days != null && days <= 30) {
    return {
      id: "renewal_due_soon",
      title: days === 0 ? "Renewal due today" : `Renewal due in ${days} days`,
      detail: `Next renewal on ${formatDateOnly(date)}. Start the renewal conversation.`,
      severity: "critical",
      route: "?tab=commercial",
      actionLabel: "Open Commercial",
    };
  }
  if (input.hasLicense === false && (input.clientStatus || "Active") === "Active") {
    return {
      id: "missing_license",
      title: "No license configured",
      detail: "This active client has no license on record.",
      severity: "warning",
      route: "?tab=licensing",
      actionLabel: "Open Licensing",
    };
  }
  if (input.hasContacts === false) {
    return {
      id: "missing_contact",
      title: "No contact on record",
      detail: "Add a primary contact so the account stays reachable.",
      severity: "info",
    };
  }
  return null;
}

/** Primary contact (explicit flag first, otherwise the first by name). */
export function pickPrimaryContact<T extends { is_primary?: boolean | null; contact_name?: string | null }>(
  contacts: T[] | null | undefined,
): T | null {
  const list = contacts || [];
  if (!list.length) return null;
  return (
    list.find((c) => !!c.is_primary) ??
    [...list].sort((a, b) => (a.contact_name || "").localeCompare(b.contact_name || ""))[0] ??
    null
  );
}

const EVENT_LABELS: Record<string, string> = {
  client_imported: "Client imported",
  client_created: "Client created",
  configuration_update: "Configuration updated",
  configuration: "Configuration recorded",
  contract: "Contract event",
  contract_created: "Contract created",
  contract_renewed: "Contract renewed",
  installation: "Installation",
  first_installation: "First installation",
  license_created: "License created",
  license_updated: "License updated",
  proposal_generated: "Proposal generated",
  proposal_sent: "Proposal sent",
  proposal_won: "Proposal won",
  renewal_created: "Renewal scheduled",
  note: "Note added",
};

/** Never show raw database keys to users. */
export function humanizeEventLabel(raw: string | null | undefined): string {
  const key = (raw || "").trim();
  if (!key) return "Activity";
  const mapped = EVENT_LABELS[key.toLowerCase()];
  if (mapped) return mapped;
  const words = key.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const SYSTEM_EVENT_KEYS = new Set([
  "client_imported",
  "client_created",
  "configuration_update",
  "configuration",
  "installation",
  "first_installation",
  "license_created",
  "license_updated",
  "contract",
  "contract_created",
  "renewal_created",
  "proposal_generated",
]);

export function isSystemEvent(raw: string | null | undefined): boolean {
  return SYSTEM_EVENT_KEYS.has((raw || "").trim().toLowerCase());
}

export interface HistoryEntryInput {
  key: string;
  kind: "proposal" | "note" | "event";
  rawType?: string | null;
  title?: string | null;
  meta?: string | null;
  /** The real business event date. */
  eventDate?: string | null;
  /** Audit/import metadata date, only shown when it differs. */
  recordedAt?: string | null;
}

export interface HistoryEntry {
  key: string;
  kind: HistoryEntryInput["kind"];
  title: string;
  meta: string | null;
  eventDate: string | null;
  eventDateLabel: string;
  recordedLabel: string | null;
  isSystem: boolean;
}

function sameDay(a?: string | null, b?: string | null) {
  return (a || "").slice(0, 10) === (b || "").slice(0, 10);
}

/** Chronology with humanized labels; the business date always stays primary. */
export function buildHistory(entries: HistoryEntryInput[]): HistoryEntry[] {
  return entries
    .map((e) => {
      const eventDate = e.eventDate || e.recordedAt || null;
      const showRecorded = !!e.recordedAt && !sameDay(e.recordedAt, eventDate);
      return {
        key: e.key,
        kind: e.kind,
        title: e.title?.trim() || humanizeEventLabel(e.rawType),
        meta: e.meta || null,
        eventDate,
        eventDateLabel: eventDate ? formatDateOnly(eventDate) : "Date unknown",
        recordedLabel: showRecorded ? `Recorded on ${formatDateOnly(e.recordedAt!)}` : null,
        isSystem: e.kind === "event" ? isSystemEvent(e.rawType) : false,
      };
    })
    .sort((a, b) => (b.eventDate || "").localeCompare(a.eventDate || ""));
}

/** Real opportunities only — proposals that are still commercially open. */
const CLOSED_PROPOSAL_STATUSES = new Set(["won", "lost", "rejected", "cancelled", "canceled", "expired"]);

export function openProposals<T extends { status?: string | null }>(proposals: T[] | null | undefined): T[] {
  return (proposals || []).filter((p) => !CLOSED_PROPOSAL_STATUSES.has((p.status || "").trim().toLowerCase()));
}
