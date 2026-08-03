// Canonical display formatting for monetary values.
// Never changes the underlying numeric value — presentation only.

const LOCALE = "en-GB";

/** Placeholder used while a value is still loading (never render a false zero). */
export const LOADING_PLACEHOLDER = "—";

export interface MoneyOptions {
  /** ISO currency code. Falls back to EUR (existing behaviour) when absent. */
  currency?: string | null;
  /** Abbreviated headline form, e.g. €4.2k. Opt-in only. */
  compact?: boolean;
}

/**
 * Detailed/table currency: symbol + thousands separator + exactly 2 decimals.
 *   formatMoney(4221.6)  -> "€4,221.60"
 *   formatMoney(4221.6, { compact: true }) -> "€4.2k"
 */
export function formatMoney(value: number | string | null | undefined, options: MoneyOptions = {}): string {
  const n = typeof value === "string" ? Number(value) : value;
  const amount = Number.isFinite(n as number) ? (n as number) : 0;
  const currency = options.currency || "EUR";

  if (options.compact) {
    const symbol = currencySymbol(currency);
    const abs = Math.abs(amount);
    const sign = amount < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}${symbol}${trim(abs / 1_000_000)}M`;
    if (abs >= 1_000) return `${sign}${symbol}${trim(abs / 1_000)}k`;
    return `${sign}${symbol}${Math.round(abs)}`;
  }

  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function trim(n: number) {
  const s = n.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function currencySymbol(currency: string) {
  try {
    const parts = new Intl.NumberFormat(LOCALE, { style: "currency", currency }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? "";
  } catch {
    return "";
  }
}

/**
 * Renders a KPI value only when every source it depends on has resolved.
 * While loading (or on error) it returns the placeholder instead of a zero.
 */
export function kpiValue(isReady: boolean, render: () => string): string {
  return isReady ? render() : LOADING_PLACEHOLDER;
}
