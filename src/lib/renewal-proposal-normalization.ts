/**
 * Renewals P0D — single normalization/validation layer for contract-driven
 * renewal proposals.
 *
 * Pure functions. Used before every persistence path (Draft, Ready, DOCX) so
 * that what is displayed, what is persisted and what is generated are the same
 * values. Catalogue/pipeline proposals are returned untouched.
 *
 * Invariant: for a contract-driven renewal every field is either proven by the
 * linked contract/license, explicitly selected for this proposal, or null.
 */

export interface RenewalNormalizationContext {
  /** True only for renewals whose line items come from the real contract. */
  usesContractBaselineItems: boolean;
  /** Product identity (never the pricing mode). */
  isBusinessProduct: boolean;
  /** Baseline-proven Professional plan, when the source proves it. */
  baselinePlan?: number | null;
  /** Explicitly selected target plan for an upgrade/downgrade renewal. */
  targetPlan?: number | null;
  /** Variant resolved from the baseline or explicitly chosen for the proposal. */
  effectiveVariant?: "keepit" | "useit" | null;
  /** True when the baseline does not record the commercial variant. */
  variantNeedsReview?: boolean;
  /** Canonical identifiers that must survive normalization. */
  canonical?: {
    contract_id?: string | null;
    license_id?: string | null;
    renewal_id?: string | null;
    client_id?: string | null;
    partner_uuid?: string | null;
  };
  clientName?: string | null;
}

export interface RenewalReadiness {
  /** Draft is always allowed; `ok` gates Ready / DOCX generation. */
  ok: boolean;
  blockers: string[];
  warnings: string[];
}

/** Generic catalogue project name that must never leak into a renewal. */
export const GENERIC_PROJECT_NAME = "Maintenance Software Implementation";

/** Neutral, renewal-specific project name default. */
export function defaultRenewalProjectName(clientName: string | null | undefined): string {
  const name = (clientName || "").trim();
  return name ? `Annual Contract Renewal — ${name}` : "Annual Contract Renewal";
}

/**
 * Returns the project name to display for a renewal proposal.
 * A name deliberately saved by the user is always preserved.
 */
export function resolveRenewalProjectName(input: {
  savedProjectName?: string | null;
  clientName?: string | null;
}): string {
  const saved = (input.savedProjectName || "").trim();
  if (saved && saved !== GENERIC_PROJECT_NAME) return saved;
  return defaultRenewalProjectName(input.clientName);
}

/**
 * Removes inapplicable catalogue defaults from a proposal payload before it is
 * persisted. Only contract-driven renewals are altered.
 */
export function normalizeProposalPayload<T extends Record<string, any>>(
  payload: T,
  ctx: RenewalNormalizationContext,
): T {
  if (!ctx.usesContractBaselineItems) return payload;

  const next: Record<string, any> = { ...payload };

  // 1. Plan — an explicitly selected target plan, otherwise only a Professional
  //    plan proven by the source. Never a catalogue default.
  next.plan = ctx.isBusinessProduct ? null : ctx.targetPlan ?? ctx.baselinePlan ?? null;

  // 2. Implementation — never invented for a renewal.
  next.implementation_type = null;
  next.service_days = null;

  // 3. Business catalogue configuration does not apply to a contract renewal.
  if (ctx.isBusinessProduct) next.business_config = null;

  // 4. Variant is persisted only when proven or explicitly selected.
  next.license_model = ctx.isBusinessProduct ? ctx.effectiveVariant ?? null : null;

  // 5. Project name — never the generic catalogue name.
  const pn = (next.project_name || "").toString().trim();
  next.project_name = !pn || pn === GENERIC_PROJECT_NAME
    ? defaultRenewalProjectName(ctx.clientName ?? next.client_name)
    : pn;

  // 6. Canonical identifiers are preserved verbatim.
  for (const [k, v] of Object.entries(ctx.canonical || {})) {
    if (v != null) next[k] = v;
  }

  return next as T;
}

/**
 * Gate for Ready status and document generation. Draft is always permitted,
 * but material identity gaps must be resolved before a final document.
 */
export function validateRenewalReadiness(
  ctx: RenewalNormalizationContext,
  input: { totalYear1?: number; itemCount?: number } = {},
): RenewalReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!ctx.usesContractBaselineItems) return { ok: true, blockers, warnings };

  if (ctx.isBusinessProduct && ctx.variantNeedsReview && !ctx.effectiveVariant) {
    blockers.push(
      "Commercial variant is not recorded. Select KeepIT or UseIT before generating the renewal proposal.",
    );
  }
  if (!ctx.isBusinessProduct && (ctx.targetPlan ?? ctx.baselinePlan) == null) {
    blockers.push(
      "Professional plan is not recorded. The exact plan must be resolved before generating the renewal proposal.",
    );
  }
  if ((input.itemCount ?? 0) === 0) {
    blockers.push("This renewal has no line items to propose.");
  }
  if (ctx.variantNeedsReview && ctx.effectiveVariant) {
    warnings.push("Variant selected for proposal · source baseline not recorded");
  }

  return { ok: blockers.length === 0, blockers, warnings };
}

/** Totals must always derive from the proposal's real line items. */
export function totalsFromItems(
  items: { total?: number | null; net_total?: number | null; is_recurring?: boolean }[],
): { totalYear1: number; totalRecurring: number } {
  let totalYear1 = 0;
  let totalRecurring = 0;
  for (const it of items || []) {
    const value = Number(it.net_total ?? it.total ?? 0) || 0;
    totalYear1 += value;
    if (it.is_recurring) totalRecurring += value;
  }
  return { totalYear1: +totalYear1.toFixed(2), totalRecurring: +totalRecurring.toFixed(2) };
}
