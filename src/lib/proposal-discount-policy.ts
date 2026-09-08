/**
 * Proposal discount authorization policy (pure, shared).
 *
 * Mirrors the production database guard:
 *  - HQ users: up to 100% on software and services.
 *  - Any partner user: software max 10%, regardless of partnership level.
 *  - Implementer partners: services up to 100%.
 *  - Reseller / Strategic Connector / Technologic / unknown or missing level:
 *    services max 10%.
 *  - Fixed EUR discounts are limited by their effective percentage of the
 *    line gross value, so they cannot bypass the percentage limit.
 *
 * This module is presentation/validation only — it never changes prices,
 * totals, renewal behaviour or hosting/S&AT rules.
 */

export const HQ_MAX_DISCOUNT_PCT = 100;
export const PARTNER_MAX_SOFTWARE_DISCOUNT_PCT = 10;
export const PARTNER_MAX_SERVICES_DISCOUNT_PCT = 10;
export const IMPLEMENTER_MAX_SERVICES_DISCOUNT_PCT = 100;

/** Tolerance for floating point comparisons on percentages. */
const EPSILON = 0.000001;

export type DiscountKind = "software" | "services";

export interface DiscountOverrides {
  /** Max software discount % for this partner, or null to use the default. */
  software?: number | null;
  /** Max services discount % for this partner, or null to use the default. */
  services?: number | null;
}

export interface DiscountActor {
  /** True only for confirmed HQ users. */
  isHQ: boolean;
  /** partners.partnership_level for the actor's partner (may be missing). */
  partnershipLevel?: string | null;
  /**
   * Per-partner configured limits (HQ-managed). Only applied to partner users:
   * HQ always stays at 100/100. `null`/absent means "use default";
   * an explicit 0 means zero, never a fallback.
   */
  overrides?: DiscountOverrides | null;
}

export interface DiscountLimits {
  software: number;
  services: number;
}

/** Conservative default used while partner/profile data is still loading. */
export const CONSERVATIVE_LIMITS: DiscountLimits = {
  software: PARTNER_MAX_SOFTWARE_DISCOUNT_PCT,
  services: PARTNER_MAX_SERVICES_DISCOUNT_PCT,
};

/**
 * Exactly mirrors the production resolver, which tests
 * `lower(coalesce(partnership_level,'')) = 'implementer'`.
 */
export function isImplementerLevel(level: string | null | undefined): boolean {
  if (!level) return false;
  return String(level).trim().toLowerCase() === "implementer";
}

/**
 * Normalize a configured override: only finite numbers within [0, 100] are
 * accepted. Anything else (null, undefined, NaN, out of range) means
 * "use default".
 */
export function normalizeDiscountOverride(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

/** Default limits, ignoring any per-partner override. */
export function getDefaultDiscountLimits(
  actor: Pick<DiscountActor, "isHQ" | "partnershipLevel"> | null | undefined,
): DiscountLimits {
  if (!actor) return { ...CONSERVATIVE_LIMITS };
  if (actor.isHQ) return { software: HQ_MAX_DISCOUNT_PCT, services: HQ_MAX_DISCOUNT_PCT };
  return {
    software: PARTNER_MAX_SOFTWARE_DISCOUNT_PCT,
    services: isImplementerLevel(actor.partnershipLevel)
      ? IMPLEMENTER_MAX_SERVICES_DISCOUNT_PCT
      : PARTNER_MAX_SERVICES_DISCOUNT_PCT,
  };
}

export function getDiscountLimits(actor: DiscountActor | null | undefined): DiscountLimits {
  const defaults = getDefaultDiscountLimits(actor);
  // HQ users are never constrained by a partner override.
  if (!actor || actor.isHQ) return defaults;
  const software = normalizeDiscountOverride(actor.overrides?.software);
  const services = normalizeDiscountOverride(actor.overrides?.services);
  return {
    software: software === null ? defaults.software : software,
    services: services === null ? defaults.services : services,
  };
}


/** Clamp a percentage input into [0, max]. */
export function clampDiscountPct(value: unknown, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, Math.max(0, max));
}

/**
 * Effective percentage of a discount against the line gross value.
 * Returns null when it cannot be determined (fixed amount on a zero gross).
 */
export function effectiveDiscountPct(
  discountType: string | null | undefined,
  discountValue: unknown,
  grossTotal: unknown,
): number | null {
  const value = Number(discountValue) || 0;
  if (!discountType || discountType === "none" || value <= 0) return 0;
  if (discountType === "percent") return value;
  const gross = Number(grossTotal) || 0;
  if (gross <= 0) return null;
  return (value / gross) * 100;
}

export interface DiscountLineInput {
  item_name?: string | null;
  category?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  gross_total?: number | null;
}

export function lineDiscountKind(category: string | null | undefined): DiscountKind {
  return category === "service" ? "services" : "software";
}

export interface DiscountValidationResult {
  ok: boolean;
  message?: string;
}

const OK: DiscountValidationResult = { ok: true };

function fail(message: string): DiscountValidationResult {
  return { ok: false, message };
}

/** Validate a single Professional proposal line (percent or fixed). */
export function validateProfessionalLineDiscount(
  line: DiscountLineInput,
  limits: DiscountLimits,
): DiscountValidationResult {
  const kind = lineDiscountKind(line.category);
  const max = kind === "services" ? limits.services : limits.software;
  const label = line.item_name || (kind === "services" ? "Service line" : "Software line");
  const pct = effectiveDiscountPct(line.discount_type, line.discount_value, line.gross_total);
  if (pct === null) {
    return fail(
      `${label}: a fixed discount cannot be validated on a line with no gross value. Remove the discount or set a line value.`,
    );
  }
  if (pct > max + EPSILON) {
    return fail(
      `${label}: discount of ${pct.toFixed(2)}% exceeds your maximum ${kind} discount of ${max}%.`,
    );
  }
  return OK;
}

/** Validate every Professional line; returns the first violation. */
export function validateProfessionalItems(
  lines: DiscountLineInput[],
  limits: DiscountLimits,
): DiscountValidationResult {
  for (const line of lines || []) {
    const res = validateProfessionalLineDiscount(line, limits);
    if (!res.ok) return res;
  }
  return OK;
}

export const BUSINESS_SOFTWARE_CHANNELS = ["softwarePct", "webUsersPct", "apiPct"] as const;
export const BUSINESS_SERVICE_CHANNELS = ["servicesPct"] as const;

const CHANNEL_LABELS: Record<string, string> = {
  softwarePct: "Software discount",
  webUsersPct: "Web/Mobile users discount",
  apiPct: "API discount",
  servicesPct: "Services discount",
};

/** Validate Business proposal per-channel discount percentages. */
export function validateBusinessDiscounts(
  discounts: Record<string, unknown> | null | undefined,
  limits: DiscountLimits,
): DiscountValidationResult {
  if (!discounts) return OK;
  const checks: Array<[string, number]> = [
    ...BUSINESS_SOFTWARE_CHANNELS.map((c) => [c, limits.software] as [string, number]),
    ...BUSINESS_SERVICE_CHANNELS.map((c) => [c, limits.services] as [string, number]),
  ];
  for (const [channel, max] of checks) {
    const value = Number(discounts[channel]) || 0;
    if (value > max + EPSILON) {
      return fail(
        `${CHANNEL_LABELS[channel] || channel}: ${value}% exceeds your maximum of ${max}%.`,
      );
    }
  }
  return OK;
}
