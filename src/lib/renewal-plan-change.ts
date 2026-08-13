/**
 * Renewal plan changes (upgrade / downgrade) — pure calculation layer.
 *
 * A renewal proposal is always built from the REAL current contract baseline.
 * This module adds the only thing the baseline cannot provide: an explicit
 * commercial change of the Professional plan, priced from the active
 * `pricing_rules` catalogue.
 *
 * Hard rules encoded here (see PartnerOS renewal specification):
 *  - The current plan is NEVER inferred from price or description. It must be
 *    proven by the baseline (`baseline.plan`); otherwise the change is blocked.
 *  - Unchanged recurring lines (add-ons, web users, hosting, S&AT …) are kept
 *    exactly as they are in the contract. Only the core license line is
 *    replaced by the target plan price.
 *  - Proposed recurring = target plan + unchanged recurring configuration.
 *    The proposal keeps the FULL proposed recurring value, never the delta.
 *  - Implementation is incremental:
 *      gross delta = max(0, target-plan implementation − current-plan
 *      implementation), matched standard→standard or light→light, never mixed.
 *  - A downgrade never produces an implementation delta (item 8).
 *  - A discount may only be applied to the incremental implementation line.
 *    Recurring software is never discounted by a plan change.
 *
 * Everything is side-effect free: no client, contract, license, renewal or
 * revenue record is touched. Persistence happens elsewhere, and the real
 * operational records are only updated when `close_renewal` succeeds.
 */

import type { RenewalBaseline, BaselineRecurringLine } from "./renewal-baseline";
import type { PricingRule, ProposalItem, ProposalPlan, ProposalLineDiscountType } from "@/types/proposal";

export type RenewalChangeMode = "straight" | "upgrade" | "downgrade";

/** Implementation flavour. Standard and Light are never mixed. */
export type ImplementationKind = "standard" | "light";

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
  implementationKind: ImplementationKind;
  implementationDiscount?: ImplementationDiscountInput;
}

export interface PlanChangeComputation {
  /** False for straight renewals — nothing in here applies. */
  applicable: boolean;
  mode: RenewalChangeMode;
  currency: string;

  currentPlan: ProposalPlan | null;
  targetPlan: ProposalPlan | null;
  currentPlanLabel: string | null;
  targetPlanLabel: string | null;

  /** Recurring contract lines preserved untouched. */
  unchangedRecurring: BaselineRecurringLine[];
  /** Core-license lines replaced by the target plan. */
  replacedLicenseLines: BaselineRecurringLine[];
  unchangedRecurringTotal: number;

  currentRecurring: number | null;
  targetPlanPrice: number | null;
  proposedRecurring: number | null;
  recurringDelta: number | null;

  implementationKind: ImplementationKind;
  targetImplementation: number | null;
  currentImplementationCredit: number | null;
  implementationGrossDelta: number;
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

export function implementationRule(
  rules: PricingRule[],
  plan: ProposalPlan | null,
  kind: ImplementationKind,
): PricingRule | null {
  if (!plan) return null;
  const code = kind === "light" ? `impl_light_p${plan}` : `impl_online_p${plan}`;
  return (rules || []).find((r) => r.code === code && r.active !== false && isProfessionalRule(r)) || null;
}

/** Core-license recurring lines of the current contract. */
export function licenseBaselineLines(baseline: RenewalBaseline | null): BaselineRecurringLine[] {
  return (baseline?.recurringLines || []).filter((l) => l.lineType === "license");
}

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
  if (discount.type === "percent") return round2(Math.min(100, Number(discount.value)) * g / 100);
  return round2(Math.min(Number(discount.value), g));
}

function emptyComputation(mode: RenewalChangeMode, currency: string, kind: ImplementationKind): PlanChangeComputation {
  return {
    applicable: false,
    mode,
    currency,
    currentPlan: null,
    targetPlan: null,
    currentPlanLabel: null,
    targetPlanLabel: null,
    unchangedRecurring: [],
    replacedLicenseLines: [],
    unchangedRecurringTotal: 0,
    currentRecurring: null,
    targetPlanPrice: null,
    proposedRecurring: null,
    recurringDelta: null,
    implementationKind: kind,
    targetImplementation: null,
    currentImplementationCredit: null,
    implementationGrossDelta: 0,
    implementationDiscountAmount: 0,
    implementationNet: 0,
    year1: null,
    year2Plus: null,
    items: [],
    blockers: [],
    warnings: [],
  };
}

export function computePlanChange(input: PlanChangeInput): PlanChangeComputation {
  const { baseline, rules, mode, targetPlan } = input;
  const kind: ImplementationKind = input.implementationKind || "standard";
  const currency = baseline?.currency || "EUR";
  const base = emptyComputation(mode, currency, kind);

  if (mode === "straight") return base;

  const out: PlanChangeComputation = { ...base, applicable: true };
  const blockers: string[] = [];
  const warnings: string[] = [];

  const currentPlan = baseline?.plan ?? null;
  out.currentPlan = currentPlan;
  out.targetPlan = targetPlan;
  out.currentPlanLabel = currentPlan ? `Professional ${currentPlan}` : null;
  out.targetPlanLabel = targetPlan ? `Professional ${targetPlan}` : null;
  out.currentRecurring = baseline?.currentRecurring ?? null;

  if (!baseline?.hasRealData) {
    blockers.push("The current contract baseline could not be loaded for this renewal.");
  }
  if (!currentPlan) {
    blockers.push(
      "The current Professional plan is not recorded on the license. It must be resolved before an upgrade or downgrade — it is never inferred from price or description.",
    );
  }
  if (!targetPlan) {
    blockers.push("Select the target Professional plan for this change.");
  }
  if (currentPlan && targetPlan && currentPlan === targetPlan) {
    blockers.push("The target plan is the same as the current plan. Use a straight renewal instead.");
  }
  if (currentPlan && targetPlan && mode === "upgrade" && targetPlan < currentPlan) {
    blockers.push("An upgrade requires a target plan above the current plan.");
  }
  if (currentPlan && targetPlan && mode === "downgrade" && targetPlan > currentPlan) {
    blockers.push("A downgrade requires a target plan below the current plan.");
  }

  // ── Recurring configuration ──────────────────────────────────────────
  const replaced = licenseBaselineLines(baseline);
  const unchanged = (baseline?.recurringLines || []).filter((l) => l.lineType !== "license");
  out.replacedLicenseLines = replaced;
  out.unchangedRecurring = unchanged;
  out.unchangedRecurringTotal = round2(unchanged.reduce((s, l) => s + Number(l.amount || 0), 0));

  if ((baseline?.recurringLines?.length || 0) > 0 && replaced.length === 0) {
    blockers.push(
      "No core license line was found in the current contract, so the plan price cannot be replaced safely.",
    );
  }

  const planRule = planLicenseRule(rules, targetPlan);
  out.targetPlanPrice = planRule ? round2(Number(planRule.unit_price || 0)) : null;
  if (targetPlan && !planRule) {
    blockers.push(`No active price is published for Professional ${targetPlan} (plan_${targetPlan}_annual).`);
  }

  // ── Implementation (incremental, never mixed) ────────────────────────
  const kindLabel = kind === "light" ? "Light" : "Standard";
  if (mode === "upgrade") {
    const targetRule = implementationRule(rules, targetPlan, kind);
    const currentRule = implementationRule(rules, currentPlan, kind);
    out.targetImplementation = targetRule ? round2(Number(targetRule.unit_price || 0)) : null;
    out.currentImplementationCredit = currentRule ? round2(Number(currentRule.unit_price || 0)) : null;
    if (targetPlan && !targetRule) {
      blockers.push(`No active ${kindLabel.toLowerCase()} implementation price for Professional ${targetPlan}.`);
    }
    if (currentPlan && !currentRule) {
      blockers.push(
        `No active ${kindLabel.toLowerCase()} implementation price for the current Professional ${currentPlan}; the credit cannot be computed.`,
      );
    }
    if (targetRule && currentRule) {
      out.implementationGrossDelta = Math.max(
        0,
        round2(Number(targetRule.unit_price || 0) - Number(currentRule.unit_price || 0)),
      );
    }
  } else {
    // Downgrade: no implementation delta unless an explicit one-time service
    // is added manually by the user in the Preview step.
    out.targetImplementation = null;
    out.currentImplementationCredit = null;
    out.implementationGrossDelta = 0;
    warnings.push("Downgrade — no implementation is charged unless an explicit one-time service is added.");
  }

  out.implementationDiscountAmount = implementationDiscountAmount(
    out.implementationGrossDelta,
    input.implementationDiscount,
  );
  out.implementationNet = round2(out.implementationGrossDelta - out.implementationDiscountAmount);

  if (blockers.length > 0) {
    return { ...out, blockers, warnings, items: [] };
  }

  const proposedRecurring = round2((out.targetPlanPrice || 0) + out.unchangedRecurringTotal);
  out.proposedRecurring = proposedRecurring;
  out.recurringDelta = out.currentRecurring == null ? null : round2(proposedRecurring - out.currentRecurring);
  out.year2Plus = proposedRecurring;
  out.year1 = round2(proposedRecurring + out.implementationNet);

  // ── Proposal lines with structured provenance ────────────────────────
  const items: ProposalItem[] = [];
  let sort = 0;

  items.push({
    category: "software",
    item_code: planRule!.code,
    item_name: planRule!.label,
    description: `Target plan for this ${mode} — priced from the active catalogue.`,
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
    pricing_rule_code: planRule!.code,
    pricing_rule_id: planRule!.id ?? null,
    source_plan: currentPlan,
    target_plan: targetPlan,
    line_type: "license",
    change_kind: "plan_change",
    gross_delta: out.currentRecurring == null ? null : out.recurringDelta,
  });

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

  if (out.implementationGrossDelta > 0) {
    const targetRule = implementationRule(rules, targetPlan, kind);
    const d = input.implementationDiscount;
    items.push({
      category: "service",
      item_code: `impl_delta_p${currentPlan}_p${targetPlan}_${kind}`,
      item_name: `Incremental implementation — Professional ${currentPlan} → ${targetPlan} (${kindLabel})`,
      description:
        `${kindLabel} implementation Professional ${targetPlan} ${fmt(out.targetImplementation, currency)} ` +
        `− current Professional ${currentPlan} credit ${fmt(out.currentImplementationCredit, currency)}.`,
      qty: 1,
      unit_price: out.implementationGrossDelta,
      frequency: "one-time",
      total: out.implementationGrossDelta,
      discount_type: d && d.type !== "none" && Number(d.value) > 0 ? d.type : "none",
      discount_value: d && d.type !== "none" ? Number(d.value) || 0 : 0,
      gross_total: out.implementationGrossDelta,
      discount_amount: out.implementationDiscountAmount,
      net_total: out.implementationNet,
      is_override: false,
      is_recurring: false,
      sort_order: sort++,
      pricing_rule_code: targetRule?.code ?? null,
      pricing_rule_id: targetRule?.id ?? null,
      source_plan: currentPlan,
      target_plan: targetPlan,
      line_type: "implementation",
      change_kind: "implementation_delta",
      gross_delta: out.implementationGrossDelta,
    });
  }

  return { ...out, items, blockers, warnings };
}

function fmt(value: number | null, currency: string): string {
  if (value == null) return "—";
  return `${currency === "EUR" ? "€" : `${currency} `}${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * A plan change may only discount the incremental implementation line.
 * Recurring software carries the real commercial price.
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
