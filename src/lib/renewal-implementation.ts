/**
 * Incremental implementation for a renewal product/plan change.
 *
 * The blind formula "full target implementation package − full current
 * package" is WRONG and is not used anywhere. Implementation is only the real
 * incremental effort for newly introduced modules/configuration, resolved
 * through a strict, traceable precedence:
 *
 *   1. a configured plan-transition rule (incremental hours × rate, or an
 *      explicit incremental gross);
 *   2. otherwise an HQ-authorized manual incremental amount WITH a mandatory
 *      justification;
 *   3. otherwise the renewal is blocked for Ready / PDF / generation.
 *
 * A value is never invented and never falls back to the full target package.
 */

import type { ProposalProductFamily } from "@/types/proposal";

export type ImplementationKind = "standard" | "light";
export type IncrementalImplementationSource = "transition_rule" | "manual_hq";

export const INCREMENTAL_IMPLEMENTATION_BLOCKER = "Incremental implementation requires confirmation";

/** Row of `public.plan_transition_rules`. */
export interface PlanTransitionRule {
  id: string;
  code: string;
  label: string;
  source_family?: string | null;
  target_family?: string | null;
  source_plan?: number | null;
  target_plan?: number | null;
  implementation_kind?: ImplementationKind | string | null;
  pricing_mode: "fixed" | "hours_rate" | string;
  hours?: number | null;
  hourly_rate?: number | null;
  incremental_gross?: number | null;
  currency?: string | null;
  active?: boolean;
}

export interface TransitionContext {
  sourceFamily: ProposalProductFamily | null;
  targetFamily: ProposalProductFamily | null;
  sourcePlan: number | null;
  targetPlan: number | null;
  implementationKind: ImplementationKind;
}

export interface ManualIncrementalInput {
  /** Incremental gross confirmed by HQ. */
  gross?: number | null;
  justification?: string | null;
  /** True only when the current actor may authorize a manual amount (HQ). */
  authorized?: boolean;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
}

export interface IncrementalDiscountInput {
  type: "none" | "percent" | "fixed";
  value: number;
}

export interface IncrementalImplementationResolution {
  /** False for a straight renewal or a downgrade — nothing is charged. */
  required: boolean;
  source: IncrementalImplementationSource | null;
  transitionRuleId: string | null;
  transitionRuleCode: string | null;
  hours: number | null;
  hourlyRate: number | null;
  gross: number;
  justification: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  discountAmount: number;
  net: number;
  blockers: string[];
  warnings: string[];
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const fam = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Most specific active rule that matches the transition. Never inferred. */
export function findTransitionRule(
  rules: PlanTransitionRule[] | null | undefined,
  ctx: TransitionContext,
): PlanTransitionRule | null {
  const candidates = (rules || []).filter((r) => {
    if (r.active === false) return false;
    const kind = fam(r.implementation_kind || "standard");
    if (kind && kind !== ctx.implementationKind) return false;
    if (r.source_family && fam(r.source_family) !== fam(ctx.sourceFamily)) return false;
    if (r.target_family && fam(r.target_family) !== fam(ctx.targetFamily)) return false;
    if (r.source_plan != null && Number(r.source_plan) !== Number(ctx.sourcePlan)) return false;
    if (r.target_plan != null && Number(r.target_plan) !== Number(ctx.targetPlan)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  const score = (r: PlanTransitionRule) =>
    (r.source_plan != null ? 2 : 0) +
    (r.target_plan != null ? 2 : 0) +
    (r.source_family ? 1 : 0) +
    (r.target_family ? 1 : 0);
  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

/** Gross value proven by a configured rule, or null when it proves nothing. */
export function transitionRuleGross(rule: PlanTransitionRule | null): {
  gross: number | null;
  hours: number | null;
  hourlyRate: number | null;
} {
  if (!rule) return { gross: null, hours: null, hourlyRate: null };
  if (fam(rule.pricing_mode) === "hours_rate") {
    const hours = Number(rule.hours ?? 0);
    const rate = Number(rule.hourly_rate ?? 0);
    if (!(hours > 0) || !(rate > 0)) return { gross: null, hours: rule.hours ?? null, hourlyRate: rule.hourly_rate ?? null };
    return { gross: round2(hours * rate), hours, hourlyRate: rate };
  }
  const gross = rule.incremental_gross == null ? null : round2(Number(rule.incremental_gross));
  return { gross, hours: null, hourlyRate: null };
}

export function incrementalDiscountAmount(gross: number, discount?: IncrementalDiscountInput): number {
  const g = Math.max(0, round2(gross));
  if (!discount || discount.type === "none" || !(Number(discount.value) > 0) || g <= 0) return 0;
  if (discount.type === "percent") return round2((Math.min(100, Number(discount.value)) * g) / 100);
  return round2(Math.min(Number(discount.value), g));
}

export function resolveIncrementalImplementation(input: {
  /** Only an upgrade / product change introduces new configuration. */
  required: boolean;
  context: TransitionContext;
  transitionRules?: PlanTransitionRule[] | null;
  manual?: ManualIncrementalInput | null;
  discount?: IncrementalDiscountInput;
}): IncrementalImplementationResolution {
  const empty: IncrementalImplementationResolution = {
    required: input.required,
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

  if (!input.required) return empty;

  // 1 — configured plan-transition rule.
  const rule = findTransitionRule(input.transitionRules, input.context);
  const fromRule = transitionRuleGross(rule);
  if (rule && fromRule.gross != null) {
    const gross = Math.max(0, fromRule.gross);
    const discountAmount = incrementalDiscountAmount(gross, input.discount);
    return {
      ...empty,
      source: "transition_rule",
      transitionRuleId: rule.id,
      transitionRuleCode: rule.code,
      hours: fromRule.hours,
      hourlyRate: fromRule.hourlyRate,
      gross,
      discountAmount,
      net: round2(gross - discountAmount),
    };
  }
  const warnings = rule && fromRule.gross == null
    ? [`Transition rule ${rule.code} does not define a usable incremental amount.`]
    : [];

  // 2 — HQ-authorized manual incremental amount with mandatory justification.
  const manual = input.manual;
  const manualGross = manual?.gross == null ? null : round2(Number(manual.gross));
  if (manualGross != null && manualGross >= 0) {
    const blockers: string[] = [];
    if (!manual?.authorized) {
      blockers.push(
        `${INCREMENTAL_IMPLEMENTATION_BLOCKER} — only HQ can authorize a manual incremental implementation amount.`,
      );
    }
    if (!String(manual?.justification || "").trim()) {
      blockers.push(
        `${INCREMENTAL_IMPLEMENTATION_BLOCKER} — a justification is mandatory for a manual incremental amount.`,
      );
    }
    if (blockers.length > 0) return { ...empty, blockers, warnings };

    const gross = Math.max(0, manualGross);
    const discountAmount = incrementalDiscountAmount(gross, input.discount);
    return {
      ...empty,
      source: "manual_hq",
      gross,
      justification: String(manual?.justification || "").trim(),
      confirmedBy: manual?.confirmedBy ?? null,
      confirmedAt: manual?.confirmedAt ?? null,
      discountAmount,
      net: round2(gross - discountAmount),
      warnings,
    };
  }

  // 3 — nothing proven: block, never invent.
  return {
    ...empty,
    warnings,
    blockers: [
      `${INCREMENTAL_IMPLEMENTATION_BLOCKER} — no configured transition rule and no HQ-confirmed incremental amount for this change.`,
    ],
  };
}
