/**
 * PHASE 3 — "Customer Since" business semantics.
 *
 * Customer Since = the first REAL known date of the commercial relationship.
 * Technical timestamps (`created_at`, `updated_at`, import/sync timestamps) are
 * NEVER treated as a factual Customer Since. When no business date exists the
 * result is `unknown`; an optional inferred value may be returned, but always
 * flagged `isEstimated` with its source so the UI cannot present it as fact.
 */

export type CustomerSinceSource =
  | "first_installation_date"
  | "explicit_customer_since"
  | "oldest_contract_start"
  | "oldest_license_start"
  | "unknown";

export interface CustomerSinceResult {
  /** ISO date string, or null when unknown. */
  value: string | null;
  source: CustomerSinceSource;
  isEstimated: boolean;
  confidence: "high" | "medium" | "low" | "none";
  /** Label the UI should render when there is no value. */
  unknownLabel: string;
}

export const CUSTOMER_SINCE_UNKNOWN_LABEL = "Unknown / Not recorded";

const SOURCE_LABELS: Record<CustomerSinceSource, string> = {
  explicit_customer_since: "Recorded customer-since date",
  first_installation_date: "First installation date",
  oldest_contract_start: "Oldest contract start date",
  oldest_license_start: "Oldest license start date",
  unknown: "Not recorded",
};

export function customerSinceSourceLabel(source: CustomerSinceSource): string {
  return SOURCE_LABELS[source];
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const t = Date.parse(trimmed);
  if (Number.isNaN(t)) return null;
  return trimmed;
}

function oldest(values: Array<unknown>): string | null {
  const parsed = values
    .map(validDate)
    .filter((v): v is string => !!v)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return parsed[0] ?? null;
}

export interface CustomerSinceInput {
  client?: {
    /** Optional explicit historical field (may not exist yet in schema). */
    customer_since?: string | null;
    first_installation_date?: string | null;
    /** Technical timestamps — accepted but never used as a factual source. */
    created_at?: string | null;
    updated_at?: string | null;
    imported_at?: string | null;
  } | null;
  contracts?: Array<{ contract_start_date?: string | null }> | null;
  licenses?: Array<{ license_start_date?: string | null }> | null;
  /**
   * When false (default), no inference is performed and unknown stays unknown.
   * When true, an oldest-contract/license date may be returned as ESTIMATED.
   */
  allowEstimate?: boolean;
}

export function resolveCustomerSince({
  client,
  contracts,
  licenses,
  allowEstimate = false,
}: CustomerSinceInput): CustomerSinceResult {
  const explicit = validDate(client?.customer_since);
  if (explicit) {
    return {
      value: explicit,
      source: "explicit_customer_since",
      isEstimated: false,
      confidence: "high",
      unknownLabel: CUSTOMER_SINCE_UNKNOWN_LABEL,
    };
  }

  const firstInstall = validDate(client?.first_installation_date);
  if (firstInstall) {
    return {
      value: firstInstall,
      source: "first_installation_date",
      isEstimated: false,
      confidence: "high",
      unknownLabel: CUSTOMER_SINCE_UNKNOWN_LABEL,
    };
  }

  if (allowEstimate) {
    const contractDate = oldest((contracts ?? []).map((c) => c?.contract_start_date));
    if (contractDate) {
      return {
        value: contractDate,
        source: "oldest_contract_start",
        isEstimated: true,
        confidence: "medium",
        unknownLabel: CUSTOMER_SINCE_UNKNOWN_LABEL,
      };
    }
    const licenseDate = oldest((licenses ?? []).map((l) => l?.license_start_date));
    if (licenseDate) {
      return {
        value: licenseDate,
        source: "oldest_license_start",
        isEstimated: true,
        confidence: "low",
        unknownLabel: CUSTOMER_SINCE_UNKNOWN_LABEL,
      };
    }
  }

  return {
    value: null,
    source: "unknown",
    isEstimated: false,
    confidence: "none",
    unknownLabel: CUSTOMER_SINCE_UNKNOWN_LABEL,
  };
}
