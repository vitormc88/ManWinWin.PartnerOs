/**
 * Pure view-model for the Commercial Contract view (Phase 2B).
 *
 * Extracted so the grouping and the renewal resolution used by the UI can be
 * tested without rendering the whole page. The component imports these helpers
 * — there is no duplicated vocabulary.
 */

import {
  classifyContractLine,
  UNCLASSIFIED_LABEL,
  UNCLASSIFIED_LINE_TYPE,
  type ClassifiableLine,
  type EffectiveLineType,
} from "./contract-lines";
import {
  resolveRenewal,
  type ContractLike,
  type LicenseLike,
  type RenewalRecordLike,
  type ResolvedRenewal,
} from "./renewal-resolution";

export type CommercialCategoryKey =
  | "license" | "modules" | "plugins" | "hosting" | "support" | "services" | "discounts" | "needs_review";

export interface CommercialCategory {
  key: CommercialCategoryKey;
  label: string;
  types: EffectiveLineType[];
  recurring: boolean;
}

export const COMMERCIAL_CATEGORIES: CommercialCategory[] = [
  { key: "license", label: "Core License", types: ["license"], recurring: true },
  { key: "modules", label: "Included Modules", types: ["module"], recurring: true },
  { key: "plugins", label: "Included Plugins", types: ["plugin"], recurring: true },
  { key: "hosting", label: "Hosting", types: ["hosting"], recurring: true },
  { key: "support", label: "Support", types: ["sat", "mww_web"], recurring: true },
  { key: "services", label: "Professional Services", types: ["implementation", "training", "other"], recurring: false },
  { key: "discounts", label: "Discounts", types: ["discount"], recurring: false },
  // Unknown / legacy lines are NEVER hidden.
  { key: "needs_review", label: UNCLASSIFIED_LABEL, types: [UNCLASSIFIED_LINE_TYPE], recurring: false },
];

/** Effective category — a canonical type or the explicit `unclassified` sentinel. */
export function effectiveLineCategory(line: ClassifiableLine): EffectiveLineType {
  return classifyContractLine(line).effectiveType;
}

export interface CommercialGroup<T extends ClassifiableLine = ClassifiableLine> extends CommercialCategory {
  items: T[];
  subtotal: number;
}

/** Every line lands in exactly one group, including unclassified ones. */
export function buildCommercialGroups<T extends ClassifiableLine>(lines: T[]): CommercialGroup<T>[] {
  return COMMERCIAL_CATEGORIES.map((c) => {
    const items = (lines || []).filter((l) => c.types.includes(effectiveLineCategory(l)));
    const subtotal = items.reduce((s, l) => s + Number(l.amount || 0), 0);
    return { ...c, items, subtotal };
  }).filter((g) => g.items.length > 0);
}

/**
 * Renewal resolution as used by the contract view: an open renewal row wins,
 * then the contract end date, then the license end date.
 */
export function resolveContractRenewal(args: {
  renewal?: RenewalRecordLike | null;
  contract?: ContractLike | null;
  license?: LicenseLike | null;
  today?: Date;
}): ResolvedRenewal {
  return resolveRenewal({
    renewals: args.renewal ? [args.renewal] : [],
    contract: args.contract ?? null,
    license: args.license ?? null,
    today: args.today,
  });
}
