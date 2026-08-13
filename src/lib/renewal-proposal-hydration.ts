/**
 * Canonical hydration for an EXISTING renewal proposal.
 *
 * A saved renewal proposal is the source of truth for its own commercial
 * definition. When it is reopened, the wizard must restore that definition
 * BEFORE any financial derivation runs — otherwise a persisted upgrade is
 * rendered (and can be re-saved) as a straight renewal with default values.
 *
 * This module is pure: it reads the persisted `proposals` row plus its
 * `proposal_items` and returns the exact UI state to restore. It never writes
 * to the database and never invents a value: everything is either proven by
 * the saved proposal, safely derived from a persisted line, or reported as
 * missing so the caller can fail closed.
 */

import type { ProposalItem, ProposalPlan } from "@/types/proposal";
import type { RenewalChangeMode } from "./renewal-plan-change";
import type { ImplementationKind } from "./renewal-implementation";

export interface HydratedAccessLine {
  accessType: string | null;
  totalLicensedQty: number | null;
  includedQty: number | null;
  billableQty: number | null;
  unitPrice: number;
  netTotal: number;
}

export interface RenewalProposalHydration {
  /** True when the saved proposal is a plan/product change (not straight). */
  isRenewalChange: boolean;
  changeMode: RenewalChangeMode;
  sourcePlan: ProposalPlan | null;
  targetPlan: ProposalPlan | null;

  implementationKind: ImplementationKind;
  implementationSource: "transition_rule" | "manual_hq" | null;
  implementationTransitionRuleId: string | null;
  implementationTransitionRuleCode: string | null;
  implementationHours: number | null;
  implementationHourlyRate: number | null;
  implementationGross: number | null;
  implementationDiscountPct: number;
  implementationDiscountAmount: number;
  implementationNet: number | null;
  implementationJustification: string | null;
  /** Gross to re-seed the manual HQ input (null unless the source is manual). */
  manualImplementationGross: number | null;

  entitlements: Record<string, unknown> | null;
  accessLines: HydratedAccessLine[];

  items: ProposalItem[];
  totalYear1: number | null;
  totalRecurring: number | null;

  /** True when every field required to safely re-save is available. */
  complete: boolean;
  /** Human-readable list of what could not be restored. */
  missing: string[];
  /** True when some UI state was derived from line items, not proposal columns. */
  derivedFromItems: boolean;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const str = (v: unknown): string | null => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s ? s : null;
};

function asPlan(v: unknown): ProposalPlan | null {
  const n = num(v);
  return n === 1 || n === 2 || n === 3 ? (n as ProposalPlan) : null;
}

function implementationKindFromCode(code: string | null | undefined): ImplementationKind {
  return String(code || "").endsWith("_light") ? "light" : "standard";
}

export function hydrateRenewalProposal(input: {
  proposal: Record<string, any> | null | undefined;
  items?: ProposalItem[] | null;
}): RenewalProposalHydration {
  const p = input.proposal || {};
  const items = (input.items || []).slice().sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  const missing: string[] = [];
  let derivedFromItems = false;

  const planItem = items.find((it) => it.change_kind === "plan_change") || null;
  const implItem = items.find((it) => it.change_kind === "implementation_delta") || null;
  const accessItems = items.filter((it) => it.change_kind === "access_addition");

  // ── Change definition ────────────────────────────────────────────────
  const storedMode = str(p.renewal_change_mode);
  let changeMode: RenewalChangeMode =
    storedMode === "upgrade" || storedMode === "downgrade" ? (storedMode as RenewalChangeMode) : "straight";

  let sourcePlan = asPlan(p.source_plan) ?? asPlan(planItem?.source_plan);
  let targetPlan = asPlan(p.target_plan) ?? asPlan(planItem?.target_plan);
  if (asPlan(p.source_plan) == null && sourcePlan != null) derivedFromItems = true;
  if (asPlan(p.target_plan) == null && targetPlan != null) derivedFromItems = true;

  // Backwards compatibility: a persisted plan-change line proves the mode even
  // when the proposal row predates the structured columns.
  if (changeMode === "straight" && planItem && sourcePlan != null && targetPlan != null && sourcePlan !== targetPlan) {
    changeMode = targetPlan > sourcePlan ? "upgrade" : "downgrade";
    derivedFromItems = true;
  }

  const isRenewalChange = changeMode !== "straight";

  // ── Incremental implementation ───────────────────────────────────────
  const implementationKind = implementationKindFromCode(implItem?.item_code);

  const rawSource = str(p.implementation_source) ?? str(implItem?.implementation_source);
  const implementationSource =
    rawSource === "transition_rule" || rawSource === "manual_hq" ? rawSource : null;
  if (str(p.implementation_source) == null && implementationSource) derivedFromItems = true;

  const implementationGross =
    num(p.implementation_gross) ?? num(implItem?.gross_total) ?? (implItem ? num(implItem.total) : null);
  const implementationNet = num(p.implementation_net) ?? num(implItem?.net_total);
  let implementationDiscountAmount = num(p.implementation_discount_amount) ?? num(implItem?.discount_amount) ?? 0;
  if (
    implementationDiscountAmount === 0 &&
    implementationGross != null &&
    implementationNet != null &&
    implementationGross > implementationNet
  ) {
    implementationDiscountAmount = round2(implementationGross - implementationNet);
  }

  let implementationDiscountPct = 0;
  if (implItem?.discount_type === "percent") {
    implementationDiscountPct = Number(implItem.discount_value || 0);
  } else if (implementationGross && implementationGross > 0 && implementationDiscountAmount > 0) {
    implementationDiscountPct = round2((implementationDiscountAmount / implementationGross) * 100);
  }

  const implementationJustification =
    str(p.implementation_justification) ?? str(implItem?.justification);
  const implementationHours = num(p.implementation_hours) ?? num(implItem?.implementation_hours);
  const implementationHourlyRate =
    num(p.implementation_hourly_rate) ?? num(implItem?.implementation_hourly_rate);
  const implementationTransitionRuleCode =
    str(p.implementation_transition_rule_code) ?? str(implItem?.transition_rule_code);
  const implementationTransitionRuleId = str(p.implementation_transition_rule_id);

  // ── Entitlements ─────────────────────────────────────────────────────
  const entitlements =
    p.entitlements && typeof p.entitlements === "object" ? (p.entitlements as Record<string, unknown>) : null;
  const accessLines: HydratedAccessLine[] = accessItems.map((it) => ({
    accessType: it.access_type ?? null,
    totalLicensedQty: num(it.total_licensed_qty),
    includedQty: num(it.included_qty),
    billableQty: num(it.billable_qty),
    unitPrice: Number(it.unit_price || 0),
    netTotal: Number(it.net_total ?? it.total ?? 0),
  }));

  // ── Completeness (fail-closed contract) ──────────────────────────────
  if (isRenewalChange) {
    if (items.length === 0) missing.push("proposal line items");
    if (sourcePlan == null) missing.push("source plan");
    if (targetPlan == null) missing.push("target plan");
    if (implItem) {
      if (implementationGross == null || implementationGross <= 0) missing.push("incremental implementation amount");
      if (!implementationSource) missing.push("incremental implementation source");
      if (implementationSource === "manual_hq" && !implementationJustification) {
        missing.push("incremental implementation justification");
      }
    }
  }

  return {
    isRenewalChange,
    changeMode,
    sourcePlan,
    targetPlan,
    implementationKind,
    implementationSource,
    implementationTransitionRuleId,
    implementationTransitionRuleCode,
    implementationHours,
    implementationHourlyRate,
    implementationGross,
    implementationDiscountPct,
    implementationDiscountAmount,
    implementationNet,
    implementationJustification,
    manualImplementationGross: implementationSource === "manual_hq" ? implementationGross : null,
    entitlements,
    accessLines,
    items,
    totalYear1: num(p.total_year_1),
    totalRecurring: num(p.total_recurring),
    complete: missing.length === 0,
    missing,
    derivedFromItems,
  };
}

/**
 * Guard for the write path. A persisted upgrade/downgrade may only be
 * overwritten when the dialog state still represents that same change and the
 * hydration was complete. Otherwise the save must be refused.
 */
export function assertSafeRenewalOverwrite(input: {
  hydration: RenewalProposalHydration | null;
  currentMode: RenewalChangeMode;
  currentTargetPlan: ProposalPlan | null;
  currentImplementationGross: number | null;
  itemCount: number;
}): { ok: boolean; reason?: string } {
  const h = input.hydration;
  if (!h || !h.isRenewalChange) return { ok: true };

  if (!h.complete) {
    return {
      ok: false,
      reason: `This renewal upgrade could not be fully loaded (missing: ${h.missing.join(", ")}). Saving is blocked to protect the persisted proposal.`,
    };
  }
  if (input.itemCount === 0) {
    return { ok: false, reason: "The proposal has no line items to save." };
  }
  if (input.currentMode !== h.changeMode) {
    return {
      ok: false,
      reason: `This proposal is persisted as a ${h.changeMode}. Reopen it and change the mode deliberately before saving.`,
    };
  }
  if (h.targetPlan != null && input.currentTargetPlan !== h.targetPlan) {
    return {
      ok: false,
      reason: `The target plan was not restored correctly (expected Professional ${h.targetPlan}). Saving is blocked.`,
    };
  }
  if (
    h.implementationGross != null &&
    h.implementationGross > 0 &&
    !(Number(input.currentImplementationGross || 0) > 0)
  ) {
    return {
      ok: false,
      reason: "The incremental implementation amount was not restored. Saving is blocked to avoid overwriting it.",
    };
  }
  return { ok: true };
}
