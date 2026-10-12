/**
 * FIN-03 — A commercial document may be rendered only from the last persisted,
 * internally consistent Business proposal snapshot.
 *
 * This is a client-side safeguard. True immutable commercial-document storage
 * still requires a versioned artifact / server-side fingerprint ledger.
 */
import {
  computeBusinessOptions,
  DEFAULT_BUSINESS_CONFIG,
  type BusinessConfig,
} from "./proposal-business-engine";
import { buildBusinessProposalItemRows, businessPersistedTotals } from "./proposal-business-persistence";
import type { PricingRule } from "@/types/proposal";

type SavedProposal = {
  product_family?: string | null;
  proposal_mode?: string | null;
  business_config?: unknown;
  total_year_1?: number | string | null;
  total_recurring?: number | string | null;
  discount_amount?: number | string | null;
};
type PersistedLine = {
  item_code?: string | null;
  qty?: number | string | null;
  gross_total?: number | string | null;
  net_total?: number | string | null;
  discount_amount?: number | string | null;
  discount_value?: number | string | null;
  discount_type?: string | null;
  is_recurring?: boolean | null;
  apply_discount_to_renewal?: boolean | null;
};
const cents = (n: unknown): number => n == null || n === "" || !Number.isFinite(Number(n)) ? NaN : Math.round(Number(n) * 100);
const stable = (v: unknown): string => {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter(k=>o[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
};

export function savedBusinessConfig(raw: unknown): BusinessConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const cfg = raw as Partial<BusinessConfig>;
  return {
    ...DEFAULT_BUSINESS_CONFIG,
    ...cfg,
    implementation: {...DEFAULT_BUSINESS_CONFIG.implementation, ...(cfg.implementation || {})},
    discounts: {...DEFAULT_BUSINESS_CONFIG.discounts, ...(cfg.discounts || {})},
  };
}

export function businessDocumentSnapshotBlocker(
  proposal: SavedProposal,
  persisted: PersistedLine[],
  rules: PricingRule[],
): string | null {
  if (proposal.product_family !== "Business") return null;
  const cfg=savedBusinessConfig(proposal.business_config);
  if (!cfg) return "FIN03_MISSING_SAVED_BUSINESS_CONFIG";
  const mode=proposal.proposal_mode;
  if (!["keepit_only","useit_only"].includes(mode || "")) {
    return "FIN03_COMPARISON_REQUIRES_FROZEN_OPTION_SNAPSHOTS";
  }
  const model=mode==="keepit_only"?"keepit":"useit";
  const out=computeBusinessOptions(rules,cfg,[model]);
  const option=out[model];
  if (!option) return "FIN03_CATALOGUE_RULES_UNAVAILABLE";
  const rows=buildBusinessProposalItemRows(option);
  if (rows.length!==persisted.length) return "FIN03_SAVED_LINES_DIVERGE_FROM_DOCUMENT";
  for(let i=0;i<rows.length;i++) {
    const a=rows[i], b=persisted[i];
    if (a.item_code!==b.item_code ||
        cents(a.qty)!==cents(b.qty) ||
        cents(a.gross_total)!==cents(b.gross_total) ||
        cents(a.net_total)!==cents(b.net_total) ||
        cents(a.discount_amount)!==cents(b.discount_amount) ||
        cents(a.discount_value)!==cents(b.discount_value) ||
        (a.discount_type||"none")!==(b.discount_type||"none") ||
        Boolean(a.is_recurring)!==Boolean(b.is_recurring) ||
        Boolean(a.apply_discount_to_renewal)!==Boolean(b.apply_discount_to_renewal)) {
      return "FIN03_SAVED_LINES_DIVERGE_FROM_DOCUMENT";
    }
  }
  const totals=businessPersistedTotals(rows);
  if (cents(proposal.total_year_1)!==cents(totals.year1) ||
      cents(proposal.total_recurring)!==cents(totals.year2Plus) ||
      cents(proposal.discount_amount)!==cents(totals.discount)) {
    return "FIN03_SAVED_HEADER_DIVERGES_FROM_DOCUMENT";
  }
  return null;
}

type EditableBusinessFields = {
  business_config: unknown;
  client_name?: string | null;
  project_name?: string | null;
  country?: string | null;
  language?: string | null;
  proposal_mode?: string | null;
  deployment?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
};

/** A DOCX must not implicitly apply unsaved wizard changes. */
export function businessDocumentHasUnsavedChanges(
  saved: EditableBusinessFields,
  editor: EditableBusinessFields,
): boolean {
  const normalize=(v: EditableBusinessFields)=>({
    business_config:savedBusinessConfig(v.business_config),
    client_name:(v.client_name||"").trim(),
    project_name:(v.project_name||"").trim(),
    country:(v.country||"").trim(),
    language:v.language||"",
    proposal_mode:v.proposal_mode||"",
    deployment:v.deployment||"",
    payment_terms:(v.payment_terms||"").trim(),
    notes:(v.notes||"").trim(),
  });
  return stable(normalize(saved))!==stable(normalize(editor));
}
