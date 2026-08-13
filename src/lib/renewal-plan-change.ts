/**
 * Renewal product / plan changes (straight, upgrade, downgrade) — pure
 * calculation layer.
 *
 * A renewal proposal is always built from the REAL current contract baseline.
 * This module adds the only things the baseline cannot provide: an explicit
 * commercial change of the product/plan, the entitlement split between
 * licensed capacity and billable quantity, and the incremental implementation
 * effort.
 *
 * Hard rules encoded here:
 *  - The current plan/product is NEVER inferred from price or description. It
 *    must be proven by the baseline; otherwise the change is blocked.
 *  - Total licensed capacity is PRESERVED. Included quantities are
 *    recalculated from the target product (Professional 1 BO + 1 Web,
 *    Business 3 BO + 1 Web) and only the additions are billed.
 *  - Proposed recurring = target license + billable additions + unchanged
 *    recurring configuration. The proposal always carries the FULL proposed
 *    recurring value, never only the delta.
 *  - Implementation is the REAL incremental effort (configured transition rule
 *    or HQ-confirmed manual amount). It is never derived from the difference
 *    between two full implementation packages, is one-time, and is never ARR.
 *  - Only the incremental implementation line may be discounted.
 *
 * Everything is side-effect free: no client, contract, license, renewal or
 * revenue record is touched. The real operational records are only updated
 * when `close_renewal` succeeds.
 */

import type { RenewalBaseline, BaselineRecurringLine } from "./renewal-baseline";
import {
  buildAccessProposalItems,
  computeEntitlements,
  entitlementPricingFromRules,
  entitlementSnapshot,
  type AccessType,
  type EntitlementSet,
} from "./renewal-entitlements";
import {
  resolveIncrementalImplementation,
  type ImplementationKind,
  type IncrementalDiscountInput,
  type IncrementalImplementationResolution,
  type ManualIncrementalInput,
  type PlanTransitionRule,
} from "./renewal-implementation";
import type {
  PricingRule,
  ProposalItem,
  ProposalPlan,
  ProposalProductFamily,
  ProposalLineDiscountType,
} from "@/types/proposal";

export type RenewalChangeMode = "straight" | "upgrade" | "downgrade";
export type { ImplementationKind } from "./renewal-implementation";

export const RENEWAL_CHANGE_MODES: { value: RenewalChangeMode; label: string }[] = [
  { value: "straight", label: "Straight renewal" },
  { value: "upgrade", label: "Upgrade" },
  { value: "downgrade", label: "Downgrade" },
];

export const PROFESSIONAL_PLANS: ProposalPlan[] = [1, 2, 3];

export interface ImplementationDiscountInput {
  type: ProposalLineDiscountType;
  value: number;
}

export interface PlanChangeInput {
  baseline: RenewalBaseline | null;
  rules: PricingRule[];
  mode: RenewalChangeMode;
  targetPlan: ProposalPlan | null;
  /** Target product family. Defaults to the baseline family. */
  targetFamily?: ProposalProductFamily | null;
  /** Explicit annual license price when the target product is not plan-priced. */
  targetLicenseAnnualPrice?: number | null;
  implementationKind: ImplementationKind;
  implementationDiscount?: ImplementationDiscountInput;
  /** Configured transition rules (precedence 1). */
  transitionRules?: PlanTransitionRule[] | null;
  /** HQ-authorized manual incremental amount (precedence 2). */
  manualImplementation?: ManualIncrementalInput | null;
  /** Business variant, used only to resolve additional-access pricing. */
  variant?: "keepit" | "useit" | null;
}

export interface PlanChangeComputation {
  /** False for straight renewals — the baseline lines are used as they are. */
  applicable: boolean;
  mode: RenewalChangeMode;
  currency: string;

  currentPlan: ProposalPlan | null;
  targetPlan: ProposalPlan | null;
  currentFamily: ProposalProductFamily | null;
  targetFamily: ProposalProductFamily | null;
  currentPlanLabel: string | null;
  targetPlanLabel: string | null;

  /** Entitlements before and after — total capacity is identical in both. */
  currentEntitlements: EntitlementSet;
  proposedEntitlements: EntitlementSet;
  /** Serializable snapshot persisted on the proposal. */
  entitlementSnapshot: Record<string, unknown>;

  /** Recurring contract lines preserved untouched (never license/access). */
  unchangedRecurring: BaselineRecurringLine[];
  /** Core-license and access lines replaced by the target configuration. */
  replacedLicenseLines: BaselineRecurringLine[];
  unchangedRecurringTotal: number;
  billableAccessTotal: number;

  currentRecurring: number | null;
  targetPlanPrice: number | null;
  proposedRecurring: number | null;
  recurringDelta: number | null;

  implementationKind: ImplementationKind;
  implementation: IncrementalImplementationResolution;
  implementationGross: number;
  implementationDiscountAmount: number;
  implementationNet: number;

  year1: number | null;
  year2Plus: number | null;

  /** Proposal lines with structured provenance. Empty when blocked. */
  items: ProposalItem[];
  blockers: string[];
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Catalogue lookups                                                   */
/* ------------------------------------------------------------------ */

const isProfessionalRule = (r: PricingRule) =>
  !r.product_family || String(r.product_family).toLowerCase() === "professional";

export function planLicenseRule(rules: PricingRule[], plan: ProposalPlan | null): PricingRule | null {
  if (!plan) return null;
  const code = `plan_${plan}_annual`;
  return (rules || []).find((r) => r.code === code && r.active !== false && isProfessionalRule(r)) || null;
}

/** Core-license recurring lines of the current contract. */
export function licenseBaselineLines(baseline: RenewalBaseline | null): BaselineRecurringLine[] {
  return (baseline?.recurringLines || []).filter((l) => l.lineType === "license");
}

/** Line types replaced by the target configuration (license + accesses). */
const REPLACED_LINE_TYPES = new Set(["license", "mww_web"]);

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function implementationDiscountAmount(
  gross: number,
  discount: ImplementationDiscountInput | undefined,
): number {
  const g = Math.max(0, round2(gross));
  if (!discount || discount.type === "none" || !(Number(discount.value) > 0) || g <= 0) return 0;
  if (discount.type === "percent") return round2((Math.min(100, Number(discount.value)) * g) / 100);
  return round2(Math.min(Number(discount.value), g));
}

function noImplementation(): IncrementalImplementationResolution {
  return {
    required: false,
    source: null,
    transitionRuleId: null,
    transitionRuleCode: null,
    hours: null,
    hourlyRate: null,
    gross: 0,
    justification: null,
    confirmedBy: null,
    confirmedAt: null,
    discountAmount: 0,
    net: 0,
    blockers: [],
    warnings: [],
  };
}

export function computePlanChange(input: PlanChangeInput): PlanChangeComputation {
  const { baseline, rules, mode, targetPlan } = input;
  const kind: ImplementationKind = input.implementationKind || "standard";
  const currency = baseline?.currency || "EUR";

  const currentPlan = baseline?.plan ?? null;
  const currentFamily = baseline?.productFamily ?? null;
  const targetFamily = (input.targetFamily ?? currentFamily) as ProposalProductFamily | null;

  // Total licensed capacity is preserved on both sides of the change.
  const backofficeTotal = baseline?.backofficeUsers ?? null;
  const webTotal = baseline?.webUsers ?? null;

  const currentEntitlements = computeEntitlements({
    family: currentFamily,
    backofficeTotal,
    webTotal,
    pricing: entitlementPricingFromRules(rules, currentFamily, input.variant ?? null),
  });
  const proposedEntitlements = computeEntitlements({
    family: targetFamily,
    backofficeTotal,
    webTotal,
    pricing: entitlementPricingFromRules(rules, targetFamily, input.variant ?? null),
  });

  const base: PlanChangeComputation = {
    applicable: false,
    mode,
    currency,
    currentPlan,
    targetPlan: null,
    currentFamily,
    targetFamily,
    currentPlanLabel: currentPlan ? `Professional ${currentPlan}` : currentFamily,
    targetPlanLabel: null,
    currentEntitlements,
    proposedEntitlements,
    entitlementSnapshot: entitlementSnapshot(mode === "straight" ? currentEntitlements : proposedEntitlements),
    unchangedRecurring: [],
    replacedLicenseLines: [],
    unchangedRecurringTotal: 0,
    billableAccessTotal: 0,
    currentRecurring: baseline?.currentRecurring ?? null,
    targetPlanPrice: null,
    proposedRecurring: null,
    recurringDelta: null,
    implementationKind: kind,
    implementation: noImplementation(),
    implementationGross: 0,
    implementationDiscountAmount: 0,
    implementationNet: 0,
    year1: null,
    year2Plus: null,
    items: [],
    blockers: [],
    warnings: [],
  };

  if (mode === "straight") {
    return { ...base, warnings: [...currentEntitlements.inconsistencies] };
  }

  const out: PlanChangeComputation = { ...base, applicable: true };
  const blockers: string[] = [];
  const warnings: string[] = [...proposedEntitlements.inconsistencies];

  out.targetPlan = targetPlan;
  out.targetPlanLabel = targetFamily === "Business" ? "ManWinWin Business" : targetPlan ? `Professional ${targetPlan}` : null;

  const familyChange = !!currentFamily && !!targetFamily && currentFamily !== targetFamily;

  if (!baseline?.hasRealData) {
    blockers.push("The current contract baseline could not be loaded for this renewal.");
  }
  if (currentFamily === "Professional" && !currentPlan) {
    blockers.push(
      "The current Professional plan is not recorded on the license. It must be resolved before an upgrade or downgrade — it is never inferred from price or description.",
    );
  }
  if (targetFamily === "Professional" && !targetPlan) {
    blockers.push("Select the target Professional plan for this change.");
  }
  if (!familyChange && currentPlan && targetPlan && currentPlan === targetPlan) {
    blockers.push("The target plan is the same as the current plan. Use a straight renewal instead.");
  }
  if (!familyChange && currentPlan && targetPlan && mode === "upgrade" && targetPlan < currentPlan) {
    blockers.push("An upgrade requires a target plan above the current plan.");
  }
  if (!familyChange && currentPlan && targetPlan && mode === "downgrade" && targetPlan > currentPlan) {
    blockers.push("A downgrade requires a target plan below the current plan.");
  }

  // ── Recurring configuration ──────────────────────────────────────────
  const replaced = (baseline?.recurringLines || []).filter((l) => REPLACED_LINE_TYPES.has(l.lineType));
  const unchanged = (baseline?.recurringLines || []).filter((l) => !REPLACED_LINE_TYPES.has(l.lineType));
  out.replacedLicenseLines = replaced;
  out.unchangedRecurring = unchanged;
  out.unchangedRecurringTotal = round2(unchanged.reduce((s, l) => s + Number(l.amount || 0), 0));
  out.billableAccessTotal = proposedEntitlements.billableAnnualTotal;

  if ((baseline?.recurringLines?.length || 0) > 0 && licenseBaselineLines(baseline).length === 0) {
    blockers.push(
      "No core license line was found in the current contract, so the plan price cannot be replaced safely.",
    );
  }

  const planRule = targetFamily === "Business" ? null : planLicenseRule(rules, targetPlan);
  out.targetPlanPrice =
    input.targetLicenseAnnualPrice != null
      ? round2(input.targetLicenseAnnualPrice)
      : planRule
      ? round2(Number(planRule.unit_price || 0))
      : null;
  if (out.targetPlanPrice == null) {
    blockers.push(
      targetFamily === "Business"
        ? "No annual license price is available for the target ManWinWin Business configuration."
        : `No active price is published for Professional ${targetPlan} (plan_${targetPlan}_annual).`,
    );
  }

  for (const accessType of proposedEntitlements.missingPrices as AccessType[]) {
    blockers.push(
      `No published price for additional ${accessType === "web" ? "Web" : "BackOffice"} accesses under ${targetFamily}. The billable quantity cannot be priced.`,
    );
  }

  // ── Incremental implementation ───────────────────────────────────────
  const implementationRequired = mode === "upgrade";
  const implementation = resolveIncrementalImplementation({
    required: implementationRequired,
    context: {
      sourceFamily: currentFamily,
      targetFamily,
      sourcePlan: currentPlan,
      targetPlan,
      implementationKind: kind,
    },
    transitionRules: input.transitionRules,
    manual: input.manualImplementation,
    discount: input.implementationDiscount as IncrementalDiscountInput | undefined,
  });
  out.implementation = implementation;
  out.implementationGross = implementation.gross;
  out.implementationDiscountAmount = implementation.discountAmount;
  out.implementationNet = implementation.net;
  blockers.push(...implementation.blockers);
  warnings.push(...implementation.warnings);
  if (!implementationRequired) {
    warnings.push("No implementation is charged for this change unless an explicit one-time service is added.");
  }

  if (blockers.length > 0) {
    return { ...out, blockers, warnings, items: [] };
  }

  const proposedRecurring = round2(
    (out.targetPlanPrice || 0) + proposedEntitlements.billableAnnualTotal + out.unchangedRecurringTotal,
  );
  out.proposedRecurring = proposedRecurring;
  out.recurringDelta = out.currentRecurring == null ? null : round2(proposedRecurring - out.currentRecurring);
  out.year2Plus = proposedRecurring;
  out.year1 = round2(proposedRecurring + out.implementationNet);
  out.entitlementSnapshot = entitlementSnapshot(proposedEntitlements);

  // ── Proposal lines with structured provenance ────────────────────────
  const items: ProposalItem[] = [];
  let sort = 0;

  items.push({
    category: "software",
    item_code: planRule?.code ?? (targetFamily === "Business" ? "business_annual_license" : `plan_${targetPlan}_annual`),
    item_name: planRule?.label ?? `${out.targetPlanLabel} — annual license`,
    description: `Target product for this ${mode}. Includes ${proposedEntitlements.backoffice.included} BackOffice + ${proposedEntitlements.web.included} Web accesses.`,
    qty: 1,
    unit_price: out.targetPlanPrice || 0,
    frequency: "yearly",
    total: out.targetPlanPrice || 0,
    discount_type: "none",
    discount_value: 0,
    gross_total: out.targetPlanPrice || 0,
    discount_amount: 0,
    net_total: out.targetPlanPrice || 0,
    is_override: false,
    is_recurring: true,
    sort_order: sort++,
    pricing_rule_code: planRule?.code ?? null,
    pricing_rule_id: planRule?.id ?? null,
    source_plan: currentPlan,
    target_plan: targetPlan,
    line_type: "license",
    change_kind: "plan_change",
    gross_delta: out.currentRecurring == null ? null : out.recurringDelta,
    included_qty: proposedEntitlements.backoffice.included,
    total_licensed_qty: proposedEntitlements.backoffice.total,
    billable_qty: 0,
  });

  const accessItems = buildAccessProposalItems(proposedEntitlements, {
    sourcePlan: currentPlan,
    targetPlan,
    startSortOrder: sort,
  });
  items.push(...accessItems);
  sort += accessItems.length;

  for (const line of unchanged) {
    items.push({
      category: "software",
      item_code: `renewal_${line.lineType}_${sort}`,
      item_name: line.label,
      description: line.needsReview
        ? "Needs review — source line could not be mapped to the catalogue."
        : "Unchanged from the current contract.",
      qty: 1,
      unit_price: round2(line.amount),
      frequency: "yearly",
      total: round2(line.amount),
      discount_type: "none",
      discount_value: 0,
      gross_total: round2(line.amount),
      discount_amount: 0,
      net_total: round2(line.amount),
      is_override: false,
      is_recurring: true,
      sort_order: sort++,
      pricing_rule_code: null,
      pricing_rule_id: null,
      source_plan: currentPlan,
      target_plan: targetPlan,
      line_type: line.lineType,
      change_kind: "unchanged",
      gross_delta: 0,
    });
  }

  if (out.implementationGross > 0) {
    const d = input.implementationDiscount;
    const provenance =
      implementation.source === "transition_rule"
        ? implementation.hours != null && implementation.hourlyRate != null
          ? `Configured transition rule ${implementation.transitionRuleCode} — ${implementation.hours}h × ${implementation.hourlyRate}/h.`
          : `Configured transition rule ${implementation.transitionRuleCode} — explicit incremental amount.`
        : `HQ-confirmed incremental amount — ${implementation.justification}`;
    items.push({
      category: "service",
      item_code: `impl_incremental_${currentPlan ?? currentFamily}_${targetPlan ?? targetFamily}_${kind}`,
      item_name: `Incremental implementation — ${out.currentPlanLabel} → ${out.targetPlanLabel}`,
      description: `Real incremental effort for the newly introduced configuration. ${provenance}`,
      qty: 1,
      unit_price: out.implementationGross,
      frequency: "one-time",
      total: out.implementationGross,
      discount_type: d && d.type !== "none" && Number(d.value) > 0 ? d.type : "none",
      discount_value: d && d.type !== "none" ? Number(d.value) || 0 : 0,
      gross_total: out.implementationGross,
      discount_amount: out.implementationDiscountAmount,
      net_total: out.implementationNet,
      is_override: false,
      is_recurring: false,
      sort_order: sort++,
      pricing_rule_code: null,
      pricing_rule_id: null,
      source_plan: currentPlan,
      target_plan: targetPlan,
      line_type: "implementation",
      change_kind: "implementation_delta",
      gross_delta: out.implementationGross,
      implementation_source: implementation.source,
      transition_rule_code: implementation.transitionRuleCode,
      implementation_hours: implementation.hours,
      implementation_hourly_rate: implementation.hourlyRate,
      justification: implementation.justification,
    });
  }

  return { ...out, items, blockers, warnings };
}

/**
 * A plan change may only discount the incremental implementation line.
 * Recurring software and access lines carry the real commercial price.
 */
export function validatePlanChangeDiscounts(items: ProposalItem[]): { ok: boolean; message?: string } {
  for (const it of items || []) {
    const hasDiscount = (it.discount_type || "none") !== "none" && Number(it.discount_value || 0) > 0;
    if (!hasDiscount) continue;
    if (it.is_recurring || it.change_kind !== "implementation_delta") {
      return {
        ok: false,
        message: `${it.item_name}: a plan change may only discount the incremental implementation line, never recurring software.`,
      };
    }
  }
  return { ok: true };
}
