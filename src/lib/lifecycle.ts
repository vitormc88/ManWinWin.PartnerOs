import { supabase } from "@/integrations/supabase/client";
import { logSystemActivity } from "@/lib/activity-log";

export type LicenseModel = "SaaS / UseIT" | "Perpetual / KeepIT";
export type BillingFrequency = "Annual" | "Monthly" | "One-time";
export const LICENSE_TYPE_OPTIONS = [
  "Express",
  "START",
  "Professional 1",
  "Professional 2",
  "Professional 3",
  "Business",
] as const;

export interface CreateLicensePayload {
  client_id: string;
  license_type: string;
  license_model: LicenseModel;
  contract_start_date: string;
  renewal_date?: string | null;
  /** Legacy aggregate (kept for backwards compat). Prefer initial/recurring split. */
  contract_value?: number | null;
  /** Year-1 invoice = recurring + one-time (services / setup). */
  initial_contract_value?: number | null;
  /** Year-2+ recurring (used for ARR & renewals). */
  recurring_contract_value?: number | null;
  billing_frequency: BillingFrequency;
  num_users?: number | null;
  notes?: string | null;
  is_draft?: boolean;
  source_proposal_id?: string | null;
}

/** Inherit operational license defaults from an approved proposal. */
export function proposalToLicenseDefaults(proposal: any): {
  license_type: string;
  license_model: LicenseModel;
  billing_frequency: BillingFrequency;
  initial_contract_value: number;
  recurring_contract_value: number;
  num_users: number | null;
  notes: string;
  source_proposal_id: string;
} {
  const family = proposal?.product_family || "Professional";
  const model: LicenseModel =
    family === "Business" && proposal?.license_model === "keepit"
      ? "Perpetual / KeepIT"
      : "SaaS / UseIT";
  const license_type =
    family === "Business" ? "Business" : `Professional ${proposal?.plan ?? 1}`;
  const initial = Number(proposal?.total_year_1 || 0);
  const recurring = Number(proposal?.total_recurring || 0);
  const users = Number(proposal?.web_users || 0) || null;
  return {
    license_type,
    license_model: model,
    billing_frequency: "Annual",
    initial_contract_value: initial,
    recurring_contract_value: recurring,
    num_users: users,
    notes: `Inherited from Proposal v${proposal?.version ?? 1}${proposal?.project_name ? ` — ${proposal.project_name}` : ""}.`,
    source_proposal_id: proposal?.id,
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
  if (frequency === "One-time" && model === "Perpetual / KeepIT") {
    // Perpetual: support renewal default 1 year
    d.setFullYear(d.getFullYear() + 1);
  } else if (frequency === "Monthly") {
    d.setMonth(d.getMonth() + 1);
  } else {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d.toISOString().slice(0, 10);
}

export function computeRenewalStatus(renewalDate: string): string {
  const days = Math.ceil((new Date(renewalDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return "Overdue";
  if (days <= 30) return "Due Soon";
  return "Active";
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
  // 1. If deal already linked, reuse
  if (deal.client_id) {
    const { data } = await supabase.from("clients").select("*").eq("id", deal.client_id).maybeSingle();
    if (data) return { client: data, created: false };
  }

  // 2. Match by name + partner
  const name = (deal.company_name || "").trim();
  if (!name) throw new Error("Deal has no company name");

  let q = supabase.from("clients").select("*").ilike("commercial_name", name);
  if (deal.partner_id) q = q.eq("partner_id", deal.partner_id);
  else q = q.is("partner_id", null);
  const { data: matches } = await q.limit(1);
  if (matches && matches.length > 0) {
    const existing = matches[0];
    // link deal -> client
    await supabase.from("deals").update({ client_id: existing.id }).eq("id", deal.id);
    return { client: existing, created: false };
  }

  // 3. Generate client code
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

  // Auto-create primary contact if we have one
  if (deal.contact_person_name) {
    await supabase.from("client_contacts").insert({
      client_id: created.id,
      contact_name: deal.contact_person_name,
      email: deal.contact_email || null,
      phone: deal.contact_phone || null,
    });
  }

  // Link deal -> client
  await supabase.from("deals").update({ client_id: created.id }).eq("id", deal.id);

  // Log on deal
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
      contract_value: payload.contract_value ?? null,
      num_users: payload.num_users ?? null,
      notes: payload.notes ?? null,
      is_draft: !!payload.is_draft,
    } as any)
    .select()
    .single();
  if (licErr) throw licErr;

  let renewal: any = null;
  if (opts.createRenewal && renewalDate) {
    // get partner_id from client
    const { data: client } = await supabase
      .from("clients")
      .select("partner_id")
      .eq("id", payload.client_id)
      .maybeSingle();

    const renewalType =
      payload.license_model === "Perpetual / KeepIT" ? "Support" : "License";

    const { data: ren, error: renErr } = await supabase
      .from("renewals")
      .insert({
        client_id: payload.client_id,
        license_id: license.id,
        partner_id: (client as any)?.partner_id || null,
        renewal_type: renewalType,
        renewal_date: renewalDate,
        estimated_value: payload.contract_value ?? 0,
        billing_frequency: payload.billing_frequency,
        status: computeRenewalStatus(renewalDate),
        notes: payload.notes ?? null,
      } as any)
      .select()
      .single();
    if (renErr) throw renErr;
    renewal = ren;
  }

  if (opts.dealId) {
    await logSystemActivity(
      opts.dealId,
      "License created",
      `License "${payload.license_type}" (${payload.license_model}) created${renewal ? " with renewal scheduled for " + renewalDate : ""}.`
    );
  }

  return { license, renewal };
}
