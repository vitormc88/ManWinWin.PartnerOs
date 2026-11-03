/**
 * Financial projection of Business catalogue engine lines into persisted proposal_items.
 *
 * Business pricing computes gross/net/renewal policy in proposal-business-engine.
 * Never drop those computed discounts while materializing the commercial contract.
 * This projection is intentionally pure and shared with reconciliation tests.
 */
import type { BusinessLineItem, BusinessOptionTotals } from "./proposal-business-engine";
import type { ProposalItem } from "@/types/proposal";

const toCents = (value: number): number => Math.round((Number(value) + Number.EPSILON) * 100);
const fromCents = (cents: number): number => cents / 100;

export function buildBusinessProposalItemRows(
  option: BusinessOptionTotals,
  proposalId: string | null = null,
): ProposalItem[] {
  const lines: BusinessLineItem[] = [
    ...option.software,
    ...(option.api ? [option.api] : []),
    ...option.hosting,
    ...(option.sat ? [option.sat] : []),
    ...option.services,
  ];

  return lines.map((line, index) => ({
    ...(proposalId ? { proposal_id: proposalId } : {}),
    category: line.category === "service" ? "service" :
      line.category === "module" || line.category === "plugin" ? "software" : "addon",
    item_code: line.code,
    item_name: line.label,
    description: null,
    qty: line.qty,
    unit_price: line.unitPrice,
    frequency: line.frequency,
    // "total" is the before-discount amount, as for other proposal items.
    total: fromCents(toCents(line.amount)),
    discount_type: line.discountAmount > 0 ? "percent" : "none",
    discount_value: line.discountAmount > 0 ? line.discountPct : 0,
    gross_total: fromCents(toCents(line.amount)),
    discount_amount: fromCents(toCents(line.discountAmount)),
    net_total: fromCents(toCents(line.netAmount)),
    is_override: false,
    is_recurring: line.recurring,
    apply_discount_to_renewal: line.discountAppliesToRenewal,
    sort_order: index,
  }));
}

/**
 * Y1 is billed at each line's negotiated net price.
 * Y2+ uses that net price only for explicitly continuing discounts;
 * a temporary Y1 discount expires and the gross recurring price applies.
 */
export function businessPersistedTotals(items: ProposalItem[]): {
  year1: number;
  year2Plus: number;
  discount: number;
} {
  let year1 = 0;
  let year2Plus = 0;
  let discount = 0;
  for (const item of items) {
    const gross = toCents(Number(item.gross_total ?? item.total));
    const net = toCents(Number(item.net_total ?? item.total));
    const reduction = toCents(Number(item.discount_amount ?? 0));
    if (![gross, net, reduction].every(Number.isFinite) || gross < 0 || net < 0 ||
      reduction < 0 || Math.abs(gross - net - reduction) > 1) {
      throw new Error(`Invalid Business price on line ${item.item_code || item.item_name}`);
    }
    year1 += net;
    discount += reduction;
    if (item.is_recurring) {
      year2Plus += item.apply_discount_to_renewal ? net : gross;
    }
  }
  return { year1: fromCents(year1), year2Plus: fromCents(year2Plus), discount: fromCents(discount) };
}

export function assertBusinessProposalTotals(
  items: ProposalItem[],
  expected: Pick<BusinessOptionTotals, "totalYear1" | "totalYear2Plus">,
): void {
  const totals = businessPersistedTotals(items);
  if (Math.abs(toCents(totals.year1) - toCents(expected.totalYear1)) > 1 ||
      Math.abs(toCents(totals.year2Plus) - toCents(expected.totalYear2Plus)) > 1) {
    throw new Error(
      `BUSINESS_TOTAL_MISMATCH: lines Y1 ${totals.year1} / Y2 ${totals.year2Plus}; ` +
      `proposal Y1 ${expected.totalYear1} / Y2 ${expected.totalYear2Plus}`,
    );
  }
}
