/**
 * Renewal closing lifecycle (client-side mirror of `public.close_renewal`).
 *
 * Pure, testable helpers. The database RPC is the security and transaction
 * boundary — everything here is a UX affordance that must agree with it:
 * the same eligibility rules, the same derived dates and the same money math.
 */

export type RenewalOutcome = "renewed" | "lost";

/** Proposal statuses a renewal may be closed as Renewed from. */
export const CLOSE_ELIGIBLE_PROPOSAL_STATUSES = ["Ready", "Sent", "Accepted", "Won"] as const;

/** Renewal statuses that mean the commercial cycle is finished. */
export const CLOSED_RENEWAL_STATUSES = new Set(["Won", "Lost", "Completed"]);

export interface ClosableRenewalLike {
  id?: string | null;
  status?: string | null;
  outcome?: string | null;
  closed_at?: string | null;
  renewal_date?: string | null;
  billing_frequency?: string | null;
}

export interface ClosableProposalLike {
  id?: string | null;
  status?: string | null;
  product_family?: string | null;
  license_model?: string | null;
  total_recurring?: number | null;
  total_year_1?: number | null;
}

export function isClosedRenewal(r: ClosableRenewalLike | null | undefined): boolean {
  if (!r) return false;
  if (r.closed_at) return true;
  return CLOSED_RENEWAL_STATUSES.has((r.status || "").trim());
}

/** A derived (non-operational) renewal row can never be closed. */
export function isOperationalRenewal(id: string | null | undefined): boolean {
  return !!id && !String(id).startsWith("derived-");
}

const MONTHS_BY_FREQUENCY: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  semestral: 6,
  annual: 12,
  annually: 12,
  yearly: 12,
};

/**
 * Next cycle date derived from the renewed contract's real frequency.
 * Irregular / multi-year / unknown periods are NOT assumed to be annual:
 * they return null so the closing flow requires an explicit next date.
 */
export function nextRenewalDateFrom(
  effectiveDate: string | null | undefined,
  billingFrequency: string | null | undefined
): string | null {
  if (!effectiveDate) return null;
  const base = new Date(`${String(effectiveDate).slice(0, 10)}T00:00:00Z`);
  if (isNaN(base.getTime())) return null;
  const months = MONTHS_BY_FREQUENCY[(billingFrequency || "").trim().toLowerCase()];
  if (!months) return null;
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + months);

  return d.toISOString().slice(0, 10);
}

/** Inclusive contract end = day before the next renewal date. */
export function contractEndBefore(nextRenewalDate: string | null | undefined): string | null {
  if (!nextRenewalDate) return null;
  const d = new Date(`${String(nextRenewalDate).slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface ClosurePreviewInput {
  renewal: ClosableRenewalLike | null | undefined;
  proposal: ClosableProposalLike | null | undefined;
  /** Recurring value currently contracted (from contract lines, annualized). */
  previousRecurringValue: number | null | undefined;
  outcome: RenewalOutcome;
  lossReason?: string | null;
  effectiveDate?: string | null;
  nextRenewalDate?: string | null;
  hasContract?: boolean;
}

export interface ClosurePreview {
  ok: boolean;
  blockers: string[];
  outcome: RenewalOutcome;
  effectiveDate: string | null;
  nextRenewalDate: string | null;
  contractEndDate: string | null;
  previousRecurring: number;
  renewedRecurring: number;
  oneTimeValue: number;
  deltaValue: number;
  deltaPct: number | null;
}

const money = (v: unknown) => {
  const n = Number(v ?? 0);
  return isFinite(n) ? n : 0;
};

/**
 * Single evaluation used by the confirmation dialog and by the submit guard.
 * Mirrors the exceptions raised by `close_renewal`.
 */
export function evaluateRenewalClosure(input: ClosurePreviewInput): ClosurePreview {
  const { renewal, proposal, outcome } = input;
  const blockers: string[] = [];

  const effectiveDate =
    (input.effectiveDate && String(input.effectiveDate).slice(0, 10)) ||
    (renewal?.renewal_date ? String(renewal.renewal_date).slice(0, 10) : null);

  const nextRenewalDate =
    outcome === "renewed"
      ? (input.nextRenewalDate && String(input.nextRenewalDate).slice(0, 10)) ||
        nextRenewalDateFrom(effectiveDate, renewal?.billing_frequency)
      : null;

  const previousRecurring = money(input.previousRecurringValue);
  const renewedRecurring = outcome === "renewed" ? money(proposal?.total_recurring) : 0;
  const year1 = money(proposal?.total_year_1);
  const oneTimeValue = outcome === "renewed" ? Math.max(year1 - renewedRecurring, 0) : 0;
  const deltaValue = outcome === "renewed" ? renewedRecurring - previousRecurring : 0;
  const deltaPct =
    outcome === "renewed" && previousRecurring > 0 ? (deltaValue / previousRecurring) * 100 : null;

  if (!renewal?.id || !isOperationalRenewal(renewal.id)) {
    blockers.push("This renewal is derived from contract/license dates. Operationalize it first.");
  }
  if (isClosedRenewal(renewal)) {
    blockers.push("This renewal is already closed.");
  }
  if (!effectiveDate) {
    blockers.push("A renewal effective date is required.");
  }

  if (outcome === "lost") {
    if (!input.lossReason || !input.lossReason.trim()) blockers.push("A loss reason is required.");
    return {
      ok: blockers.length === 0,
      blockers,
      outcome,
      effectiveDate,
      nextRenewalDate: null,
      contractEndDate: null,
      previousRecurring,
      renewedRecurring: 0,
      oneTimeValue: 0,
      deltaValue: 0,
      deltaPct: null,
    };
  }

  if (!proposal?.id) {
    blockers.push("No renewal proposal found. Create the renewal proposal first.");
  } else {
    if (!(CLOSE_ELIGIBLE_PROPOSAL_STATUSES as readonly string[]).includes((proposal.status || "").trim())) {
      blockers.push(`The renewal proposal must be Ready or later (current: ${proposal.status || "unknown"}).`);
    }
    if (
      (proposal.product_family || "").trim() === "Business" &&
      !(proposal.license_model || "").trim()
    ) {
      blockers.push("The commercial variant (KeepIT / UseIT) is unresolved on the proposal.");
    }
    if (year1 <= 0) blockers.push("The renewal proposal has no commercial value.");
  }

  if (input.hasContract === false) {
    blockers.push("No contract found to renew for this client.");
  }
  if (!nextRenewalDate) {
    blockers.push(
      "Next renewal date requires confirmation — the next renewal date cannot be assumed for this period."
    );
  }
  if (nextRenewalDate && effectiveDate && nextRenewalDate <= effectiveDate) {
    blockers.push("The next renewal date must be after the effective date.");
  }


  return {
    ok: blockers.length === 0,
    blockers,
    outcome,
    effectiveDate,
    nextRenewalDate,
    contractEndDate: contractEndBefore(nextRenewalDate),
    previousRecurring,
    renewedRecurring,
    oneTimeValue,
    deltaValue,
    deltaPct,
  };
}

/** Every cached surface that must agree after a closure. */
export function renewalClosureRefreshKeys(renewalId: string, clientId?: string | null): unknown[][] {
  const keys: unknown[][] = [
    ["renewals"],
    ["renewals", "real"],
    ["renewal_activities", renewalId],
    ["proposal", "renewal", renewalId],
    ["proposals"],
    ["contracts"],
    ["contract_lines"],
    ["clients"],
    ["deals"],
    ["analytics"],
    ["dashboard"],
    ["revenue-history"],
    ["partner-metrics"],
  ];
  if (clientId) {
    keys.push(["client", clientId]);
    keys.push(["client_commercial_intelligence", clientId]);
    keys.push(["lifecycle_events", clientId]);
    keys.push(["client-aggregates"]);
  }
  return keys;
}
