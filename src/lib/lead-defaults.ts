// Pure helpers for New Lead defaults (partner users).
// No network access — callers pass already-scoped profile / partner data.

import { COUNTRY_NAME_BY_CODE } from "@/data/iso-countries";

/**
 * Normalizes a country reference (ISO2 code or free text) into the canonical
 * display name used by the country combobox (e.g. "PH" -> "Philippines").
 * Unknown values are returned trimmed and unchanged so legacy data survives.
 */
export function normalizeCountryName(input: string | null | undefined): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper.length === 2 && COUNTRY_NAME_BY_CODE[upper]) return COUNTRY_NAME_BY_CODE[upper];
  const byName = Object.values(COUNTRY_NAME_BY_CODE).find(
    (n) => n.toLowerCase() === raw.toLowerCase()
  );
  return byName || raw;
}

export interface PartnerLeadDefaultsInput {
  /** Authenticated profile id (becomes the lead owner). */
  profileId?: string | null;
  /** Partner record already scoped/visible to the user. */
  partnerCountry?: string | null;
  /** Fallback when the partner record is not readable. */
  profileCountry?: string | null;
}

export interface PartnerLeadDefaults {
  assignedUserId: string;
  country: string;
}

/** Visible defaults for a partner user creating a lead. */
export function resolvePartnerLeadDefaults(input: PartnerLeadDefaultsInput): PartnerLeadDefaults {
  return {
    assignedUserId: input.profileId || "",
    country: normalizeCountryName(input.partnerCountry || input.profileCountry || ""),
  };
}
