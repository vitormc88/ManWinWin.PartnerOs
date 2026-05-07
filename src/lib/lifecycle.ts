import { supabase } from "@/integrations/supabase/client";
import { logSystemActivity } from "@/lib/activity-log";
import { computeBusinessOption, type BusinessConfig, DEFAULT_BUSINESS_CONFIG } from "@/lib/proposal-business-engine";
import type { PricingRule, ProposalLicenseModel } from "@/types/proposal";

/** Default included accesses per Business proposal (per HQ pricing). */
export const BUSINESS_INCLUDED_BACKOFFICE = 3;
export const BUSINESS_INCLUDED_WEB = 1;

/** Map a Business proposal config to the canonical operational module/plugin labels. */
export function modulesFromBusinessConfig(cfg: Partial<BusinessConfig> | null | undefined): string[] {
  if (!cfg) return [];
  const out: string[] = ["Maintenance Module"]; // always
  if (cfg.includeRequests) out.push("Maintenance Requests");
  if (cfg.includeStock) out.push("Stock Management");
  if (cfg.includePurchase) out.push("Purchase Orders");
  if (cfg.pluginSLA) out.push("SLA");
  if (cfg.pluginWorkflow) out.push("Workflow");
  if (cfg.pluginAdvancedReports) out.push("Advanced Reports");
  if (cfg.pluginImport) out.push("Import Tool");
  if (cfg.api) out.push("API");
  return out;
}

/** Whether this proposal requires the user to explicitly pick KeepIT or UseIT before operationalization. */
export function requiresAwardChoice(proposal: any): boolean {
  return (
    proposal?.product_family === "Business" &&
    proposal?.proposal_mode === "compare_keepit_useit"
  );
}

/**
 * License model — used internally for renewal/billing logic.
 * Mirrors Proposal Generator semantics:
 *  - "SaaS"      → Professional (always) OR Business UseIT
 *  - "Perpetual" → Business KeepIT (with optional S&AT renewal)
 */
export type LicenseModel = "SaaS" | "Perpetual";
export type BillingFrequency = "Annual" | "Monthly" | "One-time";
export type Hosting = "SaaS" | "On-Premise";
export type ProductFamily = "Professional" | "Business" | "START" | "Express";
export type BusinessProposalMode = "UseIT" | "KeepIT";

export const LICENSE_TYPE_OPTIONS = [
  "Express",
  "START",
  "Professional 1",
  "Professional 2",
  "Professional 3",
  "Business UseIT",
  "Business KeepIT",
] as const;

export interface CreateLicensePayload {
  client_id: string;
  license_type: string;
  license_model: LicenseModel;
  product_family?: ProductFamily;
  proposal_mode?: BusinessProposalMode | null;
  hosting?: Hosting;
  contract_start_date: string;
  renewal_date?: string | null;
  contract_value?: number | null;
  initial_contract_value?: number | null;
  recurring_contract_value?: number | null;
  billing_frequency: BillingFrequency;
  num_users?: number | null;
  notes?: string | null;
  is_draft?: boolean;
  source_proposal_id?: string | null;
  /** Operational accesses inherited from the proposal. */
  included_backoffice?: number | null;
  additional_backoffice?: number | null;
  included_web?: number | null;
  additional_web?: number | null;
  api_enabled?: boolean | null;
  /** Canonical module names (e.g. "Stock Management", "SLA", "API"). */
  modules?: string[] | null;
}

export interface ProposalDefaults {
  product_family: ProductFamily;
  plan: number | null;
  proposal_mode: BusinessProposalMode | null;
  hosting: Hosting;
  license_type: string;
  license_model: LicenseModel;
  billing_frequency: BillingFrequency;
  initial_contract_value: number;
  recurring_contract_value: number;
  num_users: number | null;
  notes: string;
  source_proposal_id: string;
  /** Operational defaults (Business-aware). */
  included_backoffice: number;
  additional_backoffice: number;
  included_web: number;
  additional_web: number;
  api_enabled: boolean;
  modules: string[];
  /** True when proposal compares KeepIT vs UseIT and the caller must explicitly choose. */
  requires_award_choice: boolean;
}

/**
 * Inherit operational license defaults from an approved proposal — mirrors Proposal Generator.
 * For Business "Compare KeepIT vs UseIT" proposals, the caller MUST pass the awarded option;
 * otherwise the function returns `requires_award_choice = true` and zeroed commercial values.
 */
export function proposalToLicenseDefaults(
  proposal: any,
  awarded?: BusinessProposalMode,
  pricingRules?: PricingRule[],
): ProposalDefaults {
  const family: ProductFamily =
    (proposal?.product_family as ProductFamily) || "Professional";

  let proposal_mode: BusinessProposalMode | null = null;
  let hosting: Hosting = "SaaS";
  let license_type = "";
  let license_model: LicenseModel = "SaaS";
  let included_backoffice = 0;
  let additional_backoffice = 0;
  let included_web = 0;
  let additional_web = 0;
  let api_enabled = false;
  let modules: string[] = [];
  let requires_award_choice = false;
  let initial_contract_value = Number(proposal?.total_year_1 || 0);
  let recurring_contract_value = Number(proposal?.total_recurring || 0);

  if (family === "Business") {
    const cfg = (proposal?.business_config || {}) as Partial<BusinessConfig>;
    const dep = (proposal?.deployment || cfg?.deployment || "").toString().toLowerCase();
    const host = (proposal?.hosting || "").toString().toLowerCase();
    hosting =
      dep === "on_premise" || host === "on-premise" || host === "on_premise"
        ? "On-Premise"
        : "SaaS";

    const isCompare = proposal?.proposal_mode === "compare_keepit_useit";
    if (isCompare && !awarded) {
      requires_award_choice = true;
      proposal_mode = null;
      license_type = "Business";
      license_model = "SaaS";
      initial_contract_value = 0;
      recurring_contract_value = 0;
    } else {
      proposal_mode =
        awarded ||
        (proposal?.license_model === "keepit" ? "KeepIT" : "UseIT");
      license_type = `Business ${proposal_mode}`;
      license_model = proposal_mode === "KeepIT" ? "Perpetual" : "SaaS";

      // Recompute totals for the awarded option from business_config when in compare mode
      if (isCompare && pricingRules && cfg && Object.keys(cfg).length > 0) {
        const fullCfg: BusinessConfig = { ...DEFAULT_BUSINESS_CONFIG, ...cfg } as BusinessConfig;
        const opt = computeBusinessOption(
          pricingRules,
          fullCfg,
          (proposal_mode === "KeepIT" ? "keepit" : "useit") as ProposalLicenseModel,
        );
        if (opt) {
          initial_contract_value = opt.totalYear1;
          recurring_contract_value = opt.totalYear2Plus;
        }
      }
    }

    included_backoffice = BUSINESS_INCLUDED_BACKOFFICE;
    included_web = BUSINESS_INCLUDED_WEB;
    additional_backoffice = Math.max(0, Number(cfg?.additionalBackoffice || 0));
    additional_web = Math.max(0, Number(cfg?.additionalWebUsers || 0));
    api_enabled = !!cfg?.api;
    modules = modulesFromBusinessConfig(cfg);
  } else if (family === "Professional") {
    hosting = "SaaS";
    const plan = Number(proposal?.plan ?? 1);
    license_type = `Professional ${plan}`;
    license_model = "SaaS";
    included_backoffice = 1;
    // Professional always includes 1 Web/Mobile access; proposal.web_users is the *additional* count.
    included_web = 1;
    additional_web = Math.max(0, Number(proposal?.web_users || 0));
    api_enabled = plan === 3;
    const baseModules = plan >= 3
      ? ["Maintenance Module", "Stock Management", "Purchase Orders", "Workflow", "SLA", "Advanced Reports", "Import Tool", "API"]
      : plan === 2
      ? ["Maintenance Module", "Stock Management", "Purchase Orders"]
      : ["Maintenance Module"];
    // Maintenance Requests is optional but, when sold in the proposal, must be inherited as enabled.
    if (proposal?.include_requests_module && !baseModules.includes("Maintenance Requests")) {
      baseModules.splice(1, 0, "Maintenance Requests");
    }
    modules = baseModules;
  } else {
    hosting = "SaaS";
    license_type = family;
    license_model = "SaaS";
    included_backoffice = 1;
    included_web = 1;
    modules = ["Maintenance Module"];
  }

  return {
    product_family: family,
    plan: family === "Professional" ? Number(proposal?.plan ?? 1) : null,
    proposal_mode,
    hosting,
    license_type,
    license_model,
    billing_frequency: "Annual",
    initial_contract_value,
    recurring_contract_value,
    num_users: (included_web + additional_web) || null,
    notes: `Inherited from Proposal v${proposal?.version ?? 1}${proposal?.project_name ? ` — ${proposal.project_name}` : ""}${requires_award_choice ? " (awaiting awarded option selection)" : ""}.`,
    source_proposal_id: proposal?.id,
    included_backoffice,
    additional_backoffice,
    included_web,
    additional_web,
    api_enabled,
    modules,
    requires_award_choice,
  };
}

export function computeRenewalDate(
  startDate: string,
  model: LicenseModel,
  frequency: BillingFrequency
): string | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (isNaN(d.getTime())) return null;
  if (frequency === "Monthly") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function computeRenewalStatus(renewalDate: string): string {
  const days = Math.ceil((new Date(renewalDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return "Overdue";
  if (days <= 30) return "Due Soon";
  return "Active";
}

/** Renewal naming aligned with Proposal Generator structure. */
export function computeRenewalType(payload: {
  license_type: string;
  product_family?: ProductFamily;
  proposal_mode?: BusinessProposalMode | null;
  hosting?: Hosting;
  license_model: LicenseModel;
}): string {
  const family = payload.product_family;
  if (family === "Business") {
    if (payload.proposal_mode === "KeepIT") return "Business KeepIT S&AT Renewal";
    return "Business UseIT Renewal";
  }
  if (family === "Professional") return "Professional SaaS Renewal";
  if (family === "START") return "START S&AT Renewal";
  if (family === "Express") return "Express Renewal";
  // Fallback derived from license_type
  if (payload.license_type?.startsWith("Business KeepIT")) return "Business KeepIT S&AT Renewal";
  if (payload.license_type?.startsWith("Business")) return "Business UseIT Renewal";
  if (payload.license_type?.startsWith("Professional")) return "Professional SaaS Renewal";
  return payload.license_model === "Perpetual" ? "Support Renewal" : "License Renewal";
}

/** Whether this license should auto-create a recurring renewal. */
export function shouldCreateRenewal(family: ProductFamily | undefined, mode: BusinessProposalMode | null | undefined): boolean {
  if (!family) return true;
  if (family === "Express") return false; // no renewal by default
  if (family === "START") return true; // S&AT renewal
  if (family === "Business" && mode === "KeepIT") return true; // S&AT renewal
  return true;
}

interface Deal {
  id: string;
  company_name: string;
  partner_id?: string | null;
  country?: string | null;
  sector?: string | null;
  industry?: string | null;
  contact_person_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  assigned_salesperson?: string | null;
  description?: string | null;
  notes?: string | null;
  client_id?: string | null;
}

/** Find existing client by (company name + partner) or create one. Idempotent. */
export async function findOrCreateClientFromDeal(
  deal: Deal
): Promise<{ client: any; created: boolean }> {
  if (deal.client_id) {
    const { data } = await supabase.from("clients").select("*").eq("id", deal.client_id).maybeSingle();
    if (data) return { client: data, created: false };
  }

  const name = (deal.company_name || "").trim();
  if (!name) throw new Error("Deal has no company name");

  let q = supabase.from("clients").select("*").ilike("commercial_name", name);
  if (deal.partner_id) q = q.eq("partner_id", deal.partner_id);
  else q = q.is("partner_id", null);
  const { data: matches } = await q.limit(1);
  if (matches && matches.length > 0) {
    const existing = matches[0];
    await supabase.from("deals").update({ client_id: existing.id }).eq("id", deal.id);
    return { client: existing, created: false };
  }

  const country = (deal.country || "XX").slice(0, 2).toUpperCase();
  const slug = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "CLI";
  const suffix = Math.floor(Math.random() * 9000 + 1000);
  const client_code = `${country}-${slug}-${suffix}`;

  const insert: any = {
    client_code,
    commercial_name: name,
    short_name: name.slice(0, 32),
    country: deal.country || null,
    sector: deal.sector || deal.industry || null,
    partner_id: deal.partner_id || null,
    account_manager: deal.assigned_salesperson || null,
    manager_owner: deal.assigned_salesperson || null,
    email: deal.contact_email || null,
    phone: deal.contact_phone || null,
    observations: deal.description || deal.notes || null,
    status: "Active",
    source_deal_id: deal.id,
  };

  const { data: created, error } = await supabase
    .from("clients")
    .insert(insert)
    .select()
    .single();
  if (error) throw error;

  if (deal.contact_person_name) {
    await supabase.from("client_contacts").insert({
      client_id: created.id,
      contact_name: deal.contact_person_name,
      email: deal.contact_email || null,
      phone: deal.contact_phone || null,
    });
  }

  await supabase.from("deals").update({ client_id: created.id }).eq("id", deal.id);

  await logSystemActivity(
    deal.id,
    "Client created",
    `Client ${created.client_code} (${created.commercial_name}) was created from this deal.`
  );

  return { client: created, created: true };
}

export async function createLicenseAndRenewal(
  payload: CreateLicensePayload,
  opts: { dealId?: string; createRenewal: boolean }
) {
  const renewalDate =
    payload.renewal_date ||
    computeRenewalDate(payload.contract_start_date, payload.license_model, payload.billing_frequency);

  const recurringValue = payload.recurring_contract_value ?? payload.contract_value ?? null;
  const initialValue = payload.initial_contract_value ?? payload.contract_value ?? null;
  const hosting: Hosting = payload.hosting || (payload.license_model === "Perpetual" ? "On-Premise" : "SaaS");

  const includedBO = Number(payload.included_backoffice ?? 0);
  const addBO = Number(payload.additional_backoffice ?? 0);
  const includedWeb = Number(payload.included_web ?? 0);
  const addWeb = Number(payload.additional_web ?? 0);
  const totalBO = includedBO + addBO;
  const totalWeb = includedWeb + addWeb;

  const { data: license, error: licErr } = await supabase
    .from("licenses")
    .insert({
      client_id: payload.client_id,
      license_model: payload.license_model,
      product: payload.license_type,
      license_start_date: payload.contract_start_date || null,
      license_end_date: renewalDate,
      periodicity: payload.billing_frequency,
      billing_frequency: payload.billing_frequency,
      contract_value: initialValue,
      initial_contract_value: initialValue,
      recurring_contract_value: recurringValue,
      num_users: payload.num_users ?? (totalBO + totalWeb || null),
      backoffice_users: totalBO || null,
      backoffice_employee_users: includedBO || null,
      web_accesses: totalWeb || null,
      mobile_users: addWeb || null,
      api_access: !!payload.api_enabled,
      // Professional is SaaS-only and ALWAYS includes active S&AT. Leave Business logic untouched.
      ...(payload.product_family === "Professional"
        ? { sat_active: true, sat_end_date: renewalDate }
        : {}),
      notes: payload.notes ?? null,
      is_draft: !!payload.is_draft,
      source_proposal_id: payload.source_proposal_id ?? null,
      database_type: hosting,
    } as any)
    .select()
    .single();
  if (licErr) throw licErr;

  // Persist enabled modules (idempotent — replace any existing rows for this license)
  if (payload.modules && payload.modules.length > 0) {
    await supabase.from("licensed_modules").delete().eq("license_id", license.id);
    const rows = payload.modules.map((m) => ({
      license_id: license.id,
      module_name: m,
      enabled: true,
      license_type: payload.license_type,
    }));
    await supabase.from("licensed_modules").insert(rows);
  }

  // Sync client-level license_type & hosting so list views show correct badges.
  if (!payload.is_draft) {
    await supabase
      .from("clients")
      .update({
        license_type: payload.license_type,
        cloud_onpremise: hosting === "On-Premise" ? "On-premise" : "SaaS",
      })
      .eq("id", payload.client_id);
  }

  let renewal: any = null;
  if (opts.createRenewal && renewalDate && shouldCreateRenewal(payload.product_family, payload.proposal_mode ?? null)) {
    const { data: client } = await supabase
      .from("clients")
      .select("partner_id")
      .eq("id", payload.client_id)
      .maybeSingle();

    const renewalType = computeRenewalType(payload);

    const { data: ren, error: renErr } = await supabase
      .from("renewals")
      .insert({
        client_id: payload.client_id,
        license_id: license.id,
        partner_id: (client as any)?.partner_id || null,
        renewal_type: renewalType,
        renewal_date: renewalDate,
        // ARR / renewals always use recurring values only (Year 2+)
        estimated_value: recurringValue ?? 0,
        billing_frequency: payload.billing_frequency,
        status: computeRenewalStatus(renewalDate),
        notes: payload.notes ?? null,
        source_proposal_id: payload.source_proposal_id ?? null,
      } as any)
      .select()
      .single();
    if (renErr) throw renErr;
    renewal = ren;
  }

  if (opts.dealId) {
    await logSystemActivity(
      opts.dealId,
      "License operationalized",
      `License "${payload.license_type}" (${hosting}) operationalized${
        payload.source_proposal_id ? " from approved proposal" : ""
      }${renewal ? ` — renewal scheduled for ${renewalDate} at ${recurringValue ?? 0}€/yr recurring` : ""}.`
    );
  }

  return { license, renewal };
}
