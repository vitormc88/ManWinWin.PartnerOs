/**
 * Sprint B — Customer Lifecycle Engine
 *
 * Orchestrates the conversion of a *Won* Proposal into the canonical
 * commercial structure:
 *
 *   Partner → Client → License → Contract (+ Contract Lines) → Renewals
 *
 * Design rules:
 *  - The Proposal is the single commercial source of truth.
 *  - The engine NEVER deletes or rewrites legacy contracts (is_imported=true).
 *  - All automatic creations record a lifecycle_events row for traceability.
 *  - Contract totals are calculated server-side (trigger), never typed.
 *  - The engine is idempotent: running it twice on the same proposal will not
 *    duplicate a license or contract — it links to the existing ones.
 */

import { supabase } from "@/integrations/supabase/client";
import { requireDealProposalId } from "@/lib/proposal-source";
import { applyPartnerScope, canonicalPartnerScope } from "@/lib/partner-query";
import { canonicalizeLineTypeForWrite } from "@/lib/contract-line-payload";
import type { ContractLineType } from "@/lib/contract-lines";
import { logSystemActivity } from "@/lib/activity-log";
import {
  proposalToLicenseDefaults,
  type ProposalDefaults,
  type BusinessProposalMode,
} from "@/lib/lifecycle";
import type { PricingRule } from "@/types/proposal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LifecycleEventType =
  | "proposal_won"
  | "client_created"
  | "client_linked"
  | "license_created"
  | "contract_created"
  | "contract_line_added"
  | "renewal_scheduled"
  | "license_updated"
  | "contract_updated"
  | "renewal_renewed"
  | "license_closed";

export interface ContractLineDraft {
  line_type: string;
  description: string;
  amount: number;
  currency: string;
  billing_frequency?: string | null;
  source: "proposal" | "legacy" | "manual";
  source_item_id?: string | null;
  related_module_id?: string | null;
  related_plugin_id?: string | null;
  notes?: string | null;
}

export interface ConversionPlan {
  proposal: any;
  proposalItems: any[];
  /** Either the existing matched client or a draft of the client to create. */
  client:
    | { mode: "existing"; record: any }
    | { mode: "new"; draft: { commercial_name: string; country: string | null; partner_id: string | null } };
  /** Other candidate matches the user can pick instead. */
  clientCandidates: any[];
  licenseDefaults: ProposalDefaults;
  contractLines: ContractLineDraft[];
  contractTotal: number;
  awardedMode?: BusinessProposalMode | null;
}

export interface ConvertOptions {
  /** If provided, force linking to this existing client (skips matching). */
  existingClientId?: string | null;
  /** Required when the proposal compares KeepIT vs UseIT. */
  awardedMode?: BusinessProposalMode | null;
  /** Allow overriding the auto-generated contract lines before commit. */
  contractLines?: ContractLineDraft[];
  /** Notice-period days for the renewal reminder (defaults to 90). */
  noticePeriodDays?: number;
  /** Contract start date (defaults to today). */
  contractStartDate?: string;
}

export interface ConversionResult {
  client: any;
  clientWasCreated: boolean;
  license: any;
  contract: any;
  contractLines: any[];
  renewal: any | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getCurrentActor(): Promise<{ id: string | null; name: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { id: null, name: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  return { id: user.id, name: profile?.full_name || profile?.email || null };
}

export interface RecordEventArgs {
  clientId: string | null;
  eventType: LifecycleEventType;
  title: string;
  description?: string;
  proposalId?: string | null;
  proposalNumber?: string | null;
  licenseId?: string | null;
  contractId?: string | null;
  renewalId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordLifecycleEvent(args: RecordEventArgs): Promise<void> {
  const actor = await getCurrentActor();
  await (supabase as any).from("lifecycle_events").insert({
    client_id: args.clientId,
    event_type: args.eventType,
    event_title: args.title,
    event_description: args.description ?? null,
    actor_id: actor.id,
    actor_name: actor.name,
    source_proposal_id: args.proposalId ?? null,
    source_proposal_number: args.proposalNumber ?? null,
    source_license_id: args.licenseId ?? null,
    source_contract_id: args.contractId ?? null,
    source_renewal_id: args.renewalId ?? null,
    metadata: args.metadata ?? {},
  });
}

// ---------------------------------------------------------------------------
// Client matching
// ---------------------------------------------------------------------------

/**
 * Attempts to find existing clients matching the proposal using business keys.
 * Priority: ERP code (client_code) → exact commercial name → fuzzy name within partner.
 * Returns the strongest match and a list of other candidates for the wizard.
 */
async function findClientMatches(
  proposal: any,
  partnerId: string | null,
): Promise<{ best: any | null; candidates: any[] }> {
  const name = (proposal.client_name || "").trim();
  if (!name) return { best: null, candidates: [] };

  const candidates: any[] = [];
  const scope = canonicalPartnerScope(partnerId ?? null);
  const canonicalPartnerId = scope.kind === "partner" ? scope.value : null;

  // FAIL CLOSED: an unresolved (legacy / non-uuid) partner reference produces
  // no automatic match at all. Matching globally by name could attach a client
  // that belongs to a different partner.
  if (scope.kind === "unresolved") return { best: null, candidates: [] };

  // Exact commercial_name match, scoped by the CANONICAL partner uuid only
  // (or by `partner_uuid IS NULL` for explicit HQ Direct).
  const exactBase = supabase.from("clients").select("*").ilike("commercial_name", name);
  const exactQ = applyPartnerScope<any>(exactBase, scope);
  if (!exactQ) return { best: null, candidates: [] };
  const { data: exact } = await exactQ.limit(5);
  if (exact && exact.length > 0) candidates.push(...exact);

  // Fuzzy match within the canonical partner.
  if (canonicalPartnerId && candidates.length < 5) {
    const { data: fuzzy } = await supabase
      .from("clients")
      .select("*")
      .ilike("commercial_name", `%${name}%`)
      .eq("partner_uuid", canonicalPartnerId)
      .limit(5);
    for (const c of fuzzy || []) {
      if (!candidates.find((x) => x.id === c.id)) candidates.push(c);
    }
  }


  return { best: candidates[0] || null, candidates };
}

// ---------------------------------------------------------------------------
// Map proposal items → contract lines
// ---------------------------------------------------------------------------

/**
 * Programmatic writers must persist canonical contract-line types — the shared
 * vocabulary in `contract-lines.ts`. Never the generic legacy values.
 */
function categoryToLineType(category: string | null | undefined): ContractLineType {
  return canonicalizeLineTypeForWrite(category) ?? "other";
}

export function buildContractLinesFromProposal(proposal: any, items: any[]): ContractLineDraft[] {
  const currency = "EUR";
  const lines: ContractLineDraft[] = [];

  for (const it of items || []) {
    // Skip lines with zero amount unless they're explicitly informational.
    const amount = Number(it.net_total ?? it.total ?? 0);
    if (!Number.isFinite(amount) || amount === 0) continue;
    lines.push({
      line_type: categoryToLineType(it.category),
      description: it.item_name || it.description || it.item_code || "Item",
      amount,
      currency,
      billing_frequency: it.is_recurring ? "Annual" : "One-time",
      source: "proposal",
      source_item_id: it.id ?? null,
    });
  }

  // If the proposal_items table is empty but the proposal has totals, fall back to a
  // single aggregated line so the contract is still meaningful.
  if (lines.length === 0) {
    const total = Number(proposal.total_year_1 || 0);
    if (total > 0) {
      lines.push({
        line_type: "license",
        description: `Year 1 total — ${proposal.project_name || proposal.client_name}`,
        amount: total,
        currency,
        billing_frequency: "Annual",
        source: "proposal",
      });
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Build the conversion plan (used by the wizard preview)
// ---------------------------------------------------------------------------

export async function buildConversionPlan(
  proposalId: string,
  opts: { awardedMode?: BusinessProposalMode | null; pricingRules?: PricingRule[] } = {},
): Promise<ConversionPlan> {
  const { data: proposal, error: pErr } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", proposalId)
    .single();
  if (pErr) throw pErr;
  if (!proposal) throw new Error("Proposal not found");
  const dealId = requireDealProposalId(proposal);

  const { data: items } = await supabase
    .from("proposal_items")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("sort_order");

  // Resolve partner from the deal this proposal belongs to.
  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("partner_id, country, company_name, client_id")
    .eq("id", dealId)
    .maybeSingle();
  if (dealError) throw dealError;
  if (!deal) throw new Error("The opportunity linked to this proposal no longer exists.");
  const partnerId = (deal?.partner_id as string) || null;

  // Client matching.
  let best: any | null = null;
  let candidates: any[] = [];
  if (deal?.client_id) {
    const { data } = await supabase.from("clients").select("*").eq("id", deal.client_id).maybeSingle();
    if (data) {
      best = data;
      candidates = [data];
    }
  }
  if (!best) {
    const r = await findClientMatches(proposal, partnerId);
    best = r.best;
    candidates = r.candidates;
  }

  const licenseDefaults = proposalToLicenseDefaults(proposal, opts.awardedMode ?? undefined, opts.pricingRules);
  let contractLines = buildContractLinesFromProposal(proposal, items || []);
  // A compare proposal contains both commercial alternatives. Its generic item
  // list is not an awarded-option breakdown, so use the selected option value.
  if (proposal.proposal_mode === "compare_keepit_useit" && opts.awardedMode &&
      Math.abs(contractLines.reduce((sum, line) => sum + line.amount, 0) -
        licenseDefaults.initial_contract_value) > 0.01) {
    contractLines = [{
      line_type: "license",
      description: `Business ${opts.awardedMode} — awarded Year 1`,
      amount: licenseDefaults.initial_contract_value,
      currency: "EUR",
      billing_frequency: "Annual",
      source: "proposal",
    }];
  }
  const contractTotal = contractLines.reduce((sum, l) => sum + (l.amount || 0), 0);

  return {
    proposal,
    proposalItems: items || [],
    client: best
      ? { mode: "existing", record: best }
      : {
          mode: "new",
          draft: {
            commercial_name: proposal.client_name,
            country: proposal.country || deal?.country || null,
            partner_id: partnerId,
          },
        },
    clientCandidates: candidates,
    licenseDefaults,
    contractLines,
    contractTotal,
    awardedMode: opts.awardedMode ?? null,
  };
}
// ---------------------------------------------------------------------------
// Execute conversion
// ---------------------------------------------------------------------------

/** The only write path used by the deal and proposal conversion dialogs. */
export async function awardProposalAtomically(
  proposalId: string,
  opts: ConvertOptions = {},
  pricingRules?: PricingRule[],
): Promise<ConversionResult> {
  const plan = await buildConversionPlan(proposalId, {
    awardedMode: opts.awardedMode ?? null,
    pricingRules,
  });
  const dealId = requireDealProposalId(plan.proposal);
  if (plan.licenseDefaults.requires_award_choice) {
    throw new Error("Choose the awarded KeepIT or UseIT option before conversion.");
  }
  const clientId = opts.existingClientId === undefined
    ? (plan.client.mode === "existing" ? plan.client.record.id : null)
    : opts.existingClientId;
  const lines = opts.contractLines?.length ? opts.contractLines : plan.contractLines;
  const rpc = await supabase.rpc("award_deal_proposal" as any, {
    _deal_id: dealId,
    _proposal_id: proposalId,
    _existing_client_id: clientId,
    _license: plan.licenseDefaults,
    _contract_lines: lines,
    _start_date: opts.contractStartDate || new Date().toISOString().slice(0, 10),
    _notice_days: opts.noticePeriodDays ?? 90,
  } as any);
  if (rpc.error) throw rpc.error;
  const ids = rpc.data as any;
  if (!ids?.client_id || !ids?.license_id || !ids?.contract_id) {
    throw new Error("The award completed without the expected customer records.");
  }
  const [clientRes, licenseRes, contractRes, linesRes, renewalRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", ids.client_id).single(),
    supabase.from("licenses").select("*").eq("id", ids.license_id).single(),
    supabase.from("contracts").select("*").eq("id", ids.contract_id).single(),
    supabase.from("contract_lines").select("*").eq("contract_id", ids.contract_id),
    ids.renewal_id
      ? supabase.from("renewals").select("*").eq("id", ids.renewal_id).single()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const result of [clientRes, licenseRes, contractRes, linesRes, renewalRes]) {
    if (result.error) throw result.error;
  }
  void logSystemActivity(dealId, "Proposal awarded",
    `Proposal v${plan.proposal.version} operationalized atomically.`).catch(() => {});
  return {
    client: clientRes.data,
    clientWasCreated: !clientId && !ids.already_awarded,
    license: licenseRes.data,
    contract: contractRes.data,
    contractLines: linesRes.data || [],
    renewal: renewalRes.data,
  };
}
