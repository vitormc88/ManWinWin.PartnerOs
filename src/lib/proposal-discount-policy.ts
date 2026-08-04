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

export interface DiscountActor {
  /** True only for confirmed HQ users. */
  isHQ: boolean;
  /** partners.partnership_level for the actor's partner (may be missing). */
  partnershipLevel?: string | null;
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

export function isImplementerLevel(level: string | null | undefined): boolean {
  if (!level) return false;
  return /implement/i.test(String(level).trim());
}

export function getDiscountLimits(actor: DiscountActor | null | undefined): DiscountLimits {
  if (!actor) return { ...CONSERVATIVE_LIMITS };
  if (actor.isHQ) return { software: HQ_MAX_DISCOUNT_PCT, services: HQ_MAX_DISCOUNT_PCT };
  return {
    software: PARTNER_MAX_SOFTWARE_DISCOUNT_PCT,
    services: isImplementerLevel(actor.partnershipLevel)
      ? IMPLEMENTER_MAX_SERVICES_DISCOUNT_PCT
      : PARTNER_MAX_SERVICES_DISCOUNT_PCT,
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
