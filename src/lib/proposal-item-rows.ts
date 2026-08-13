/**
 * Proposal item persistence mapping — pure layer.
 *
 * The proposal wizard computes `ProposalItem[]` in memory (baseline lines,
 * renewal plan-change lines, manual edits). This module is the single place
 * that turns those items into the exact rows written to `proposal_items`, and
 * back again when a saved proposal is reopened for editing.
 *
 * Keeping it pure means the persistence contract (including the structured
 * provenance columns used by renewal plan changes) can be verified end to end
 * without a database or a rendered dialog.
 */

import type { ProposalItem } from "@/types/proposal";
import { enrichProposalItem, getItemBaseTotal, getItemNetTotal } from "./proposal-engine";

/** Provenance columns that must survive a save → reopen round trip. */
export const PROPOSAL_ITEM_PROVENANCE_FIELDS = [
  "pricing_rule_code",
  "pricing_rule_id",
  "source_plan",
  "target_plan",
  "line_type",
  "change_kind",
  "gross_delta",
] as const;

export type ProposalItemRow = Record<string, unknown>;

/** Map one in-memory item to its `proposal_items` row. */
export function buildProposalItemRow(
  item: ProposalItem,
  index: number,
  proposalId?: string | null,
): ProposalItemRow {
  const enriched = enrichProposalItem(item, 0, 0);
  const gross = Number(enriched.gross_total ?? getItemBaseTotal(item));
  return {
    ...(proposalId ? { proposal_id: proposalId } : {}),
    category: item.category,
    item_code: item.item_code,
    item_name: item.item_name,
    description: item.description ?? null,
    qty: item.qty,
    unit_price: item.unit_price,
    frequency: item.frequency,
    total: gross,
    discount_type: item.discount_type || "none",
    discount_value: Number(item.discount_value || 0),
    gross_total: gross,
    discount_amount: Number(enriched.discount_amount || 0),
    net_total: Number(enriched.net_total ?? getItemNetTotal(item, 0)),
    is_override: item.is_override,
    is_recurring: item.is_recurring,
    apply_discount_to_renewal: Boolean(item.apply_discount_to_renewal),
    sort_order: index,
    // Structured provenance (renewal plan changes) — auditable without
    // parsing descriptions.
    pricing_rule_code: item.pricing_rule_code ?? null,
    pricing_rule_id: item.pricing_rule_id ?? null,
    source_plan: item.source_plan ?? null,
    target_plan: item.target_plan ?? null,
    line_type: item.line_type ?? null,
    change_kind: item.change_kind ?? null,
    gross_delta: item.gross_delta ?? null,
  };
}

export function buildProposalItemRows(
  items: ProposalItem[],
  proposalId?: string | null,
): ProposalItemRow[] {
  return items.map((item, index) => buildProposalItemRow(item, index, proposalId));
}

/**
 * Rehydrate a persisted row into the shape the wizard edits. Mirrors what the
 * dialog receives from `editingProposal.items` when a proposal is reopened.
 */
export function proposalItemFromRow(row: ProposalItemRow): ProposalItem {
  const r = row as any;
  return {
    id: r.id ?? undefined,
    proposal_id: r.proposal_id ?? undefined,
    category: r.category,
    item_code: r.item_code,
    item_name: r.item_name,
    description: r.description ?? null,
    qty: Number(r.qty ?? 1),
    unit_price: Number(r.unit_price ?? 0),
    frequency: r.frequency,
    total: Number(r.total ?? 0),
    discount_type: r.discount_type ?? "none",
    discount_value: Number(r.discount_value ?? 0),
    gross_total: Number(r.gross_total ?? 0),
    discount_amount: Number(r.discount_amount ?? 0),
    net_total: Number(r.net_total ?? 0),
    is_override: Boolean(r.is_override),
    is_recurring: Boolean(r.is_recurring),
    apply_discount_to_renewal: Boolean(r.apply_discount_to_renewal),
    sort_order: Number(r.sort_order ?? 0),
    pricing_rule_code: r.pricing_rule_code ?? null,
    pricing_rule_id: r.pricing_rule_id ?? null,
    source_plan: r.source_plan ?? null,
    target_plan: r.target_plan ?? null,
    line_type: r.line_type ?? null,
    change_kind: r.change_kind ?? null,
    gross_delta: r.gross_delta ?? null,
  } as ProposalItem;
}
