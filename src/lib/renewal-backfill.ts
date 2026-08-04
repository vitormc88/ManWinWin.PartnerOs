/**
 * Idempotent operational contract-renewal seeding.
 *
 * Mirrors the SQL in the accompanying migration so the rule is unit-testable.
 * Imported customers arrive with a contract but no forward renewal; we create
 * exactly ONE open contract renewal per client, and only when no equivalent
 * renewal already exists. Re-running must never duplicate.
 *
 * These renewals are operational only — they must NEVER produce a
 * `client_revenue_history` entry, otherwise future billing would be double
 * counted against lifetime revenue.
 */

export const IMPORTED_CONTRACT_RENEWAL_NOTE =
  "Generated from imported contract; no historical revenue entry created";

export const CONTRACT_RENEWAL_TARGET_TYPE = "contract";
export const DEFAULT_RENEWAL_STATUS = "Open";
export const DEFAULT_BILLING_FREQUENCY = "Annual";

export interface ExistingRenewalRef {
  client_id: string;
  target_type?: string | null;
  target_id?: string | null;
  contract_id?: string | null;
  renewal_date?: string | null;
  status?: string | null;
}

export interface ContractRenewalSeed {
  client_id: string;
  contract_id: string;
  /** contracts.contract_end_date */
  renewal_date: string;
  /** contracts.calculated_total, falling back to contracts.total_value */
  estimated_value: number;
  /** Canonical partner relation. */
  partner_uuid: string | null;
  /** Legacy text reference, preserved as-is for historical compatibility. */
  partner_id?: string | null;
}

export interface ContractRenewalInsert {
  client_id: string;
  contract_id: string;
  target_type: string;
  target_id: string;
  renewal_date: string;
  estimated_value: number;
  partner_uuid: string | null;
  partner_id: string | null;
  renewal_type: string;
  status: string;
  billing_frequency: string;
  notes: string;
}

/**
 * An existing renewal is "equivalent" when it is a contract renewal for the
 * same client that either points at the same contract, or already covers the
 * same renewal date (a manually created equivalent).
 */
export function hasEquivalentContractRenewal(
  existing: ExistingRenewalRef[] | null | undefined,
  seed: ContractRenewalSeed,
): boolean {
  return (existing || []).some((r) => {
    if (r.client_id !== seed.client_id) return false;
    if ((r.target_type || CONTRACT_RENEWAL_TARGET_TYPE) !== CONTRACT_RENEWAL_TARGET_TYPE) return false;
    const linked = r.contract_id || r.target_id || null;
    if (linked && linked === seed.contract_id) return true;
    return !!r.renewal_date && r.renewal_date === seed.renewal_date;
  });
}

export function buildContractRenewalInsert(seed: ContractRenewalSeed): ContractRenewalInsert {
  return {
    client_id: seed.client_id,
    contract_id: seed.contract_id,
    target_type: CONTRACT_RENEWAL_TARGET_TYPE,
    target_id: seed.contract_id,
    renewal_date: seed.renewal_date,
    estimated_value: seed.estimated_value,
    partner_uuid: seed.partner_uuid ?? null,
    partner_id: seed.partner_id ?? null,
    renewal_type: "Contract",
    status: DEFAULT_RENEWAL_STATUS,
    billing_frequency: DEFAULT_BILLING_FREQUENCY,
    notes: IMPORTED_CONTRACT_RENEWAL_NOTE,
  };
}

/** Returns only the inserts that are still missing. Safe to run repeatedly. */
export function planContractRenewals(
  seeds: ContractRenewalSeed[] | null | undefined,
  existing: ExistingRenewalRef[] | null | undefined,
): ContractRenewalInsert[] {
  const planned: ContractRenewalInsert[] = [];
  const seen: ExistingRenewalRef[] = [...(existing || [])];

  for (const seed of seeds || []) {
    if (!seed.client_id || !seed.contract_id || !seed.renewal_date) continue;
    if (hasEquivalentContractRenewal(seen, seed)) continue;
    planned.push(buildContractRenewalInsert(seed));
    // Guard against duplicate seeds inside the same batch.
    seen.push({
      client_id: seed.client_id,
      target_type: CONTRACT_RENEWAL_TARGET_TYPE,
      target_id: seed.contract_id,
      contract_id: seed.contract_id,
      renewal_date: seed.renewal_date,
    });
  }

  return planned;
}

/**
 * Active-client count rule, canonical `clients.partner_uuid` with a legacy
 * `clients.partner_id` fallback used ONLY when the canonical column is null.
 */
export interface ClientPartnerRef {
  status?: string | null;
  partner_uuid?: string | null;
  partner_id?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The partner a client counts towards, or null when unlinked / HQ direct. */
export function countingPartnerId(client: ClientPartnerRef): string | null {
  const canonical = (client.partner_uuid || "").trim();
  if (canonical) return canonical.toLowerCase();
  const legacy = (client.partner_id || "").trim();
  if (legacy && UUID_RE.test(legacy)) return legacy.toLowerCase();
  return null;
}

/** Active clients per partner id — the value `partners.number_of_clients` must hold. */
export function activeClientCounts(clients: ClientPartnerRef[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of clients || []) {
    if ((c.status || "").toLowerCase() !== "active") continue;
    const pid = countingPartnerId(c);
    if (!pid) continue;
    out[pid] = (out[pid] || 0) + 1;
  }
  return out;
}
