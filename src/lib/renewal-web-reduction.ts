import { buildBaselineProposalItems, type RenewalBaseline } from "./renewal-baseline";
import type { ProposalItem } from "@/types/proposal";

export interface WebReductionInput {
  billable: number;
  annual: string;
  reason: string;
}

export function calculateWebReduction(baseline: RenewalBaseline, input: WebReductionInput, items: ProposalItem[]) {
  const included = baseline.includedWebUsers;
  const current = baseline.webUsers;
  if (included == null || current == null || !Number.isInteger(included) || included < 0 ||
      !Number.isInteger(current) || !Number.isInteger(input.billable) || input.billable < 0 ||
      included + input.billable >= current) return null;

  const total = included + input.billable;
  const initialItems = buildBaselineProposalItems(baseline);
  const webLines = baseline.recurringLines.flatMap((line, index) => line.declaredType === "mww_web" && !line.needsReview ? [index] : []);
  const hasSeparatePrice = webLines.length === 1 && baseline.recurringLines[webLines[0]].amount > 0;
  const line = hasSeparatePrice ? initialItems[webLines[0]] : initialItems.length === 1 ? initialItems[0] : null;
  const annual = hasSeparatePrice
    ? Math.round((line!.unit_price * input.billable / (current - included)) * 100) / 100
    : input.annual.trim() ? Math.round(Number(input.annual) * 100) / 100 : NaN;
  const priced = line != null && Number.isFinite(annual) && annual >= 0 && annual <= line.unit_price &&
    (hasSeparatePrice || !!input.reason.trim());
  const index = items.findIndex(item => item.item_code === line?.item_code || item.item_name === line?.item_name);
  const ready = priced && index >= 0;
  const description = `WEB accesses: ${current} → ${total} (${included} included, ${input.billable} billable).`;
  const nextItems = ready ? items.map((item, position) => position === index ? {
    ...item, description, qty: 1, frequency: "yearly" as const, is_recurring: true, unit_price: annual, total: annual, gross_total: annual,
    net_total: annual, discount_type: "none" as const, discount_value: 0, discount_amount: 0,
  } : item) : items;

  return {
    total, included, ready, hasSeparatePrice, items: nextItems, itemIndex: index,
    blocker: !line || index < 0 ? "The contract charges need review before this WEB reduction can be priced."
      : "Confirm the agreed annual amount and enter a reason for the WEB reduction.",
    entitlements: {
      web: { total, included, billable: input.billable },
      web_reduction: { previous_total: current, annual: Number.isFinite(annual) ? annual : null, reason: input.reason.trim(), item_code: index >= 0 ? items[index].item_code : null,
        pricing: hasSeparatePrice ? "contract_web_line" : "manual", ready },
    },
  };
}
