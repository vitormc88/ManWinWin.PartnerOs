/**
 * Renewal source of truth (Phase 2).
 *
 * Precedence:
 *  1. an active operational renewal record (workflow row);
 *  2. the active/current contract `contract_end_date` (the factual boundary);
 *  3. the active license `license_end_date`;
 *  4. otherwise unknown.
 *
 * The `renewals` table is workflow/tracking — its absence must NOT by itself
 * mean High risk when a future contract end exists.
 */

export type RenewalSource = "renewal_record" | "contract_end" | "license_end" | "unknown";

const CLOSED_RENEWAL_STATUSES = new Set(["completed", "cancelled", "canceled", "lost", "renewed"]);

export interface RenewalRecordLike {
  id?: string | null;
  renewal_date?: string | null;
  status?: string | null;
  assigned_user_id?: string | null;
  estimated_value?: number | null;
  target_type?: string | null;
  target_id?: string | null;
  client_id?: string | null;
}

export interface ContractLike {
  contract_end_date?: string | null;
  status?: string | null;
}

export interface LicenseLike {
  license_end_date?: string | null;
  license_status?: string | null;
}

export interface ResolvedRenewal {
  date: string | null;
  source: RenewalSource;
  daysTo: number | null;
  /** True when an open workflow renewal row exists. */
  hasWorkflowRecord: boolean;
  /** True when the workflow row has an owner. */
  isAssigned: boolean;
  estimatedValue: number | null;
  label: string;
}

/** Accepts only real ISO-like dates (YYYY-MM-DD...) that parse. Invalid values never win precedence. */
export function isValidDateString(value: string | null | undefined): boolean {
  const v = (value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return false;
  const d = new Date(`${v.slice(0, 10)}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v.slice(0, 10);
}

export function isOpenRenewal(r: RenewalRecordLike | null | undefined): boolean {
  if (!r || !isValidDateString(r.renewal_date)) return false;
  return !CLOSED_RENEWAL_STATUSES.has((r.status || "").trim().toLowerCase());
}

function daysBetween(target: string, today: Date): number {
  const t = new Date(`${target}T00:00:00Z`).getTime();
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((t - base) / 86_400_000);
}

export interface ResolveRenewalInput {
  renewals?: RenewalRecordLike[] | RenewalRecordLike | null;
  contract?: ContractLike | null;
  license?: LicenseLike | null;
  today?: Date;
}

export function resolveRenewal(input: ResolveRenewalInput): ResolvedRenewal {
  const today = input.today ?? new Date();
  const list = Array.isArray(input.renewals)
    ? input.renewals
    : input.renewals
    ? [input.renewals]
    : [];

  const open = list
    .filter(isOpenRenewal)
    .sort((a, b) => String(a.renewal_date).localeCompare(String(b.renewal_date)));

  const build = (
    date: string | null,
    source: RenewalSource,
    record?: RenewalRecordLike | null,
    label = ""
  ): ResolvedRenewal => ({
    date,
    source,
    daysTo: date ? daysBetween(date, today) : null,
    hasWorkflowRecord: !!record,
    isAssigned: !!record?.assigned_user_id,
    estimatedValue: record?.estimated_value != null ? Number(record.estimated_value) : null,
    label,
  });

  if (open.length) {
    return build(String(open[0].renewal_date).slice(0, 10), "renewal_record", open[0], "Scheduled renewal");
  }

  const contractEnd = (input.contract?.contract_end_date || "").trim().slice(0, 10);
  if (isValidDateString(contractEnd)) {
    return build(contractEnd, "contract_end", null, "Contract end date");
  }

  const licenseEnd = (input.license?.license_end_date || "").trim().slice(0, 10);
  if (isValidDateString(licenseEnd)) {
    return build(licenseEnd, "license_end", null, "License end date");
  }

  return build(null, "unknown", null, "No renewal date on record");
}

/* ───────────────────────── Risk ───────────────────────── */

export type RenewalRiskLevel = "high" | "medium" | "low" | "unknown";

export interface RenewalRiskConfig {
  /** Days below which an unprepared renewal is High risk. */
  criticalWindowDays: number;
  /** Days below which a renewal is at least Medium risk. */
  attentionWindowDays: number;
}

export const DEFAULT_RENEWAL_RISK_CONFIG: RenewalRiskConfig = {
  criticalWindowDays: 30,
  attentionWindowDays: 90,
};

export interface RenewalRiskAssessment {
  level: RenewalRiskLevel;
  /** Stable, deterministic code — never a random id. */
  code: string;
  reasons: string[];
}

export function assessRenewalRisk(
  resolved: ResolvedRenewal,
  config: RenewalRiskConfig = DEFAULT_RENEWAL_RISK_CONFIG
): RenewalRiskAssessment {
  if (!resolved.date || resolved.daysTo == null) {
    return { level: "unknown", code: "renewal_date_unknown", reasons: ["No contract, license or renewal date on record"] };
  }

  const days = resolved.daysTo;
  const reasons: string[] = [];

  if (days < 0) {
    reasons.push(`Renewal date passed ${Math.abs(days)} days ago`);
    if (!resolved.hasWorkflowRecord) reasons.push("No renewal workflow record");
    return { level: "high", code: "renewal_overdue", reasons };
  }

  if (days <= config.criticalWindowDays) {
    reasons.push(`Renews in ${days} days`);
    if (!resolved.hasWorkflowRecord) {
      reasons.push("Renewal workflow not started");
      return { level: "high", code: "renewal_imminent_no_workflow", reasons };
    }
    if (!resolved.isAssigned) {
      reasons.push("No owner assigned");
      return { level: "high", code: "renewal_imminent_unassigned", reasons };
    }
    return { level: "medium", code: "renewal_imminent_prepared", reasons };
  }

  if (days <= config.attentionWindowDays) {
    reasons.push(`Renews in ${days} days`);
    if (!resolved.hasWorkflowRecord) reasons.push("Renewal workflow not started yet");
    return { level: "medium", code: "renewal_approaching", reasons };
  }

  reasons.push(`Renews in ${days} days`);
  if (!resolved.hasWorkflowRecord) {
    reasons.push("Renewal workflow not started yet — expected at this distance");
  }
  if (resolved.source === "contract_end") reasons.push("Date taken from the contract end date");
  return { level: "low", code: "renewal_future", reasons };
}

/* ───────────────────────── Workflow materialization safety ───────────────────────── */

export interface RenewalWorkflowTarget {
  client_id: string;
  target_type?: string | null;
  target_id?: string | null;
  renewal_date: string;
}

/**
 * True only when no equivalent open workflow row already exists.
 * Prevents duplicate renewal rows on repeated saves.
 */
export function shouldCreateRenewalWorkflowRow(
  existing: RenewalRecordLike[] | null | undefined,
  target: RenewalWorkflowTarget
): boolean {
  const rows = (existing || []).filter(isOpenRenewal);
  return !rows.some(
    (r) =>
      (r.client_id ?? target.client_id) === target.client_id &&
      (target.target_id ? r.target_id === target.target_id : true) &&
      (target.target_type ? (r.target_type ?? target.target_type) === target.target_type : true) &&
      String(r.renewal_date) === target.renewal_date
  );
}
