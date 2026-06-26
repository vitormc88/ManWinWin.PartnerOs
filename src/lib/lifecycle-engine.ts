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
import { logSystemActivity } from "@/lib/activity-log";
import {
  proposalToLicenseDefaults,
  createLicenseAndRenewal,
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

  // Exact commercial_name match (scoped by partner when known).
  let q = supabase.from("clients").select("*").ilike("commercial_name", name);
  if (partnerId) q = q.eq("partner_id", partnerId);
  const { data: exact } = await q.limit(5);
  if (exact && exact.length > 0) candidates.push(...exact);

  // Fuzzy match within partner.
  if (partnerId && candidates.length < 5) {
    const { data: fuzzy } = await supabase
      .from("clients")
      .select("*")
      .ilike("commercial_name", `%${name}%`)
      .eq("partner_id", partnerId)
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

function categoryToLineType(category: string | null | undefined): string {
  switch ((category || "").toLowerCase()) {
    case "software":
      return "Software";
    case "service":
      return "Service";
    case "addon":
      return "Add-on";
    default:
      return "Other";
  }
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
        line_type: "Software",
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

  const { data: items } = await supabase
    .from("proposal_items")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("sort_order");

  // Resolve partner from the deal/lead this proposal belongs to.
  const { data: deal } = await supabase
    .from("deals")
    .select("partner_id, country, company_name, client_id")
    .eq("id", proposal.lead_id)
    .maybeSingle();
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
  const contractLines = buildContractLinesFromProposal(proposal, items || []);
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

function buildClientCode(country: string | null, name: string): string {
  const c = (country || "XX").slice(0, 2).toUpperCase();
  const slug = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "CLI";
  const suffix = Math.floor(Math.random() * 9000 + 1000);
  return `${c}-${slug}-${suffix}`;
}

export async function convertProposalToCustomer(
  proposalId: string,
  opts: ConvertOptions = {},
  pricingRules?: PricingRule[],
): Promise<ConversionResult> {
  const plan = await buildConversionPlan(proposalId, {
    awardedMode: opts.awardedMode ?? null,
    pricingRules,
  });
  const proposal = plan.proposal;

  // Resolve the partner id from the deal (proposals don't have it directly).
  const { data: deal } = await supabase
    .from("deals")
    .select("partner_id, country, client_id")
    .eq("id", proposal.lead_id)
    .maybeSingle();
  const partnerId = (deal?.partner_id as string) || null;

  // ---- Step 1: Client ----
  let client: any;
  let clientWasCreated = false;
  if (opts.existingClientId) {
    const { data } = await supabase.from("clients").select("*").eq("id", opts.existingClientId).single();
    client = data;
  } else if (plan.client.mode === "existing") {
    client = plan.client.record;
  } else {
    const draft = plan.client.draft;
    const insert: any = {
      client_code: buildClientCode(draft.country, draft.commercial_name),
      commercial_name: draft.commercial_name,
      short_name: draft.commercial_name.slice(0, 32),
      country: draft.country,
      partner_id: partnerId,
      source_proposal_id: proposalId,
      source_deal_id: proposal.lead_id,
      status: "Active",
    };
    const { data, error } = await supabase.from("clients").insert(insert).select().single();
    if (error) throw error;
    client = data;
    clientWasCreated = true;
  }

  // Link the deal to the client (idempotent).
  if (!deal?.client_id || deal.client_id !== client.id) {
    await supabase.from("deals").update({ client_id: client.id }).eq("id", proposal.lead_id);
  }

  await recordLifecycleEvent({
    clientId: client.id,
    eventType: "proposal_won",
    title: `Proposal v${proposal.version} won`,
    description: `Conversion started for ${proposal.client_name}.`,
    proposalId,
    proposalNumber: `v${proposal.version}`,
  });

  await recordLifecycleEvent({
    clientId: client.id,
    eventType: clientWasCreated ? "client_created" : "client_linked",
    title: clientWasCreated ? `Client ${client.client_code} created` : `Linked to existing client ${client.client_code}`,
    proposalId,
    proposalNumber: `v${proposal.version}`,
  });

  // ---- Step 2: License ----
  // Re-use the existing licence engine for consistency with the rest of the app.
  const contractStartDate = opts.contractStartDate || new Date().toISOString().slice(0, 10);
  const licenseDefaults = plan.licenseDefaults;
  if (licenseDefaults.requires_award_choice) {
    throw new Error(
      "This proposal compares KeepIT and UseIT. Please choose the awarded option before converting.",
    );
  }

  const { license, renewal } = await createLicenseAndRenewal(
    {
      client_id: client.id,
      license_type: licenseDefaults.license_type,
      license_model: licenseDefaults.license_model,
      product_family: licenseDefaults.product_family,
      proposal_mode: licenseDefaults.proposal_mode,
      hosting: licenseDefaults.hosting,
      contract_start_date: contractStartDate,
      billing_frequency: licenseDefaults.billing_frequency,
      initial_contract_value: licenseDefaults.initial_contract_value,
      recurring_contract_value: licenseDefaults.recurring_contract_value,
      num_users: licenseDefaults.num_users,
      notes: licenseDefaults.notes,
      source_proposal_id: proposalId,
      included_backoffice: licenseDefaults.included_backoffice,
      additional_backoffice: licenseDefaults.additional_backoffice,
      included_web: licenseDefaults.included_web,
      additional_web: licenseDefaults.additional_web,
      api_enabled: licenseDefaults.api_enabled,
      modules: licenseDefaults.modules,
      plan: licenseDefaults.plan,
    },
    { dealId: proposal.lead_id, createRenewal: false }, // we will create renewals tied to contract below
  );

  // Stamp the license with proposal + deal lineage.
  await supabase
    .from("licenses")
    .update({ proposal_id: proposalId, deal_id: proposal.lead_id })
    .eq("id", license.id);

  await recordLifecycleEvent({
    clientId: client.id,
    eventType: "license_created",
    title: `License created (${licenseDefaults.license_type})`,
    description: `Inherited from Proposal v${proposal.version}.`,
    proposalId,
    licenseId: license.id,
    metadata: {
      modules: licenseDefaults.modules,
      users: licenseDefaults.num_users,
    },
  });

  // ---- Step 3: Contract + Contract Lines ----
  const noticeDays = opts.noticePeriodDays ?? 90;
  const lines = opts.contractLines && opts.contractLines.length > 0 ? opts.contractLines : plan.contractLines;

  // Contract end date follows the license end date (which the engine derived from billing freq).
  const contractEndDate = license.license_end_date;

  const { data: contract, error: cErr } = await (supabase as any)
    .from("contracts")
    .insert({
      client_id: client.id,
      source_proposal_id: proposalId,
      is_imported: false,
      contract_start_date: contractStartDate,
      contract_end_date: contractEndDate,
      notice_period_days: noticeDays,
      currency: "EUR",
      // legacy money columns intentionally left null — `calculated_total` is authoritative.
      observations: `Auto-generated from Proposal v${proposal.version} (${proposal.client_name}).`,
    })
    .select()
    .single();
  if (cErr) throw cErr;

  // Insert contract lines, then link the license to the contract.
  if (lines.length > 0) {
    const rows = lines.map((l) => ({
      contract_id: contract.id,
      client_id: client.id,
      line_type: l.line_type,
      description: l.description,
      amount: l.amount,
      currency: l.currency || "EUR",
      billing_frequency: l.billing_frequency || null,
      related_license_id: license.id,
      related_module_id: l.related_module_id || null,
      related_plugin_id: l.related_plugin_id || null,
      source: l.source,
      source_item_id: l.source_item_id || null,
      notes: l.notes || null,
      start_date: contractStartDate,
      end_date: contractEndDate,
    }));
    const { data: insertedLines, error: lErr } = await (supabase as any)
      .from("contract_lines")
      .insert(rows)
      .select();
    if (lErr) throw lErr;

    await supabase.from("licenses").update({ contract_id: contract.id }).eq("id", license.id);

    await recordLifecycleEvent({
      clientId: client.id,
      eventType: "contract_created",
      title: `Contract created with ${insertedLines.length} line${insertedLines.length === 1 ? "" : "s"}`,
      description: `Auto-generated from Proposal v${proposal.version}.`,
      proposalId,
      contractId: contract.id,
      licenseId: license.id,
      metadata: { line_count: insertedLines.length },
    });
  }

  // ---- Step 4: Renewal tied to the contract ----
  let contractRenewal: any = null;
  if (contractEndDate) {
    const recurring = Number(licenseDefaults.recurring_contract_value || 0);
    const { data: ren, error: rErr } = await (supabase as any)
      .from("renewals")
      .insert({
        client_id: client.id,
        contract_id: contract.id,
        license_id: license.id,
        target_type: "contract",
        target_id: contract.id,
        partner_id: partnerId,
        partner_uuid: partnerId,
        renewal_type: "Contract Renewal",
        renewal_date: contractEndDate,
        notice_period_days: noticeDays,
        alert_window_days: noticeDays,
        estimated_value: recurring,
        billing_frequency: licenseDefaults.billing_frequency,
        status: "Upcoming",
        source_proposal_id: proposalId,
      })
      .select()
      .single();
    if (rErr) throw rErr;
    contractRenewal = ren;

    await recordLifecycleEvent({
      clientId: client.id,
      eventType: "renewal_scheduled",
      title: `Renewal scheduled for ${contractEndDate}`,
      description: `Reminder set ${noticeDays} days before renewal date.`,
      proposalId,
      contractId: contract.id,
      renewalId: ren.id,
    });
  }

  // ---- Audit trail on the deal ----
  await logSystemActivity(
    proposal.lead_id,
    "Converted to customer",
    `Proposal v${proposal.version} converted → client ${client.client_code}, license ${licenseDefaults.license_type}, contract auto-generated.`,
  );

  // Fetch the inserted contract lines for the result payload.
  const { data: lineRows } = await (supabase as any)
    .from("contract_lines")
    .select("*")
    .eq("contract_id", contract.id);

  return {
    client,
    clientWasCreated,
    license,
    contract,
    contractLines: lineRows || [],
    renewal: contractRenewal || renewal,
  };
}
