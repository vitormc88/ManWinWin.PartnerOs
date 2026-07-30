/**
 * Canonical contract-line vocabulary and financial calculation helpers.
 *
 * Phase 2 — single source of truth for:
 * - the canonical `line_type` vocabulary (labels, recurring semantics, order);
 * - conservative, read-only classification of legacy / generic line types;
 * - pure ARR / Year 1 / one-time calculations used by every UI surface.
 *
 * Design rules:
 * - Nothing is ever hidden: unknown legacy lines stay visible and are flagged.
 * - Description inference is applied ONLY when the stored type is unknown or
 *   generic (e.g. the imported `recurring` value). A valid canonical type is
 *   never overridden.
 * - New writes must always use a canonical type (`isCanonicalLineType`).
 * - Contract lines are the structured calculation source when present; legacy
 *   header fields (contract_value, sat_value, ...) are informational only and
 *   are never summed together with lines.
 */

export type ContractLineType =
  | "license"
  | "mww_web"
  | "hosting"
  | "sat"
  | "module"
  | "plugin"
  | "implementation"
  | "training"
  | "discount"
  | "other";

export interface ContractLineTypeDef {
  value: ContractLineType;
  label: string;
  /** Default commercial nature when billing_frequency does not say otherwise. */
  nature: "recurring" | "one_time" | "adjustment";
  /** Display order in breakdowns. */
  order: number;
  hint?: string;
}

export const CONTRACT_LINE_TYPES: ContractLineTypeDef[] = [
  { value: "license", label: "License", nature: "recurring", order: 1, hint: "Core software license" },
  { value: "mww_web", label: "MWW Web", nature: "recurring", order: 2, hint: "ManWinWin Web accesses" },
  { value: "hosting", label: "Hosting", nature: "recurring", order: 3, hint: "SaaS / cloud hosting" },
  { value: "sat", label: "S&AT", nature: "recurring", order: 4, hint: "Support & assistance" },
  { value: "module", label: "Module", nature: "recurring", order: 5 },
  { value: "plugin", label: "Plugin", nature: "recurring", order: 6 },
  { value: "implementation", label: "Implementation", nature: "one_time", order: 7 },
  { value: "training", label: "Training", nature: "one_time", order: 8 },
  { value: "discount", label: "Discount", nature: "adjustment", order: 9 },
  { value: "other", label: "Other", nature: "one_time", order: 10 },
];

export const CANONICAL_LINE_TYPES: ContractLineType[] = CONTRACT_LINE_TYPES.map((t) => t.value);

/** Types that contribute to recurring ARR when not explicitly one-time. */
export const RECURRING_LINE_TYPES: ContractLineType[] = CONTRACT_LINE_TYPES
  .filter((t) => t.nature === "recurring")
  .map((t) => t.value);

/** Types that contribute to one-time revenue. */
export const ONE_TIME_LINE_TYPES: ContractLineType[] = CONTRACT_LINE_TYPES
  .filter((t) => t.nature === "one_time")
  .map((t) => t.value);

export function isCanonicalLineType(value: string | null | undefined): value is ContractLineType {
  return !!value && (CANONICAL_LINE_TYPES as string[]).includes(value.trim());
}

export function lineTypeLabel(value: string | null | undefined): string {
  const def = CONTRACT_LINE_TYPES.find((t) => t.value === (value || "").trim());
  return def?.label || "Other / Needs review";
}

export function lineTypeOrder(value: string | null | undefined): number {
  const def = CONTRACT_LINE_TYPES.find((t) => t.value === (value || "").trim());
  return def?.order ?? 99;
}

const norm = (v: string | null | undefined) =>
  (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * Stored values that carry no reliable type information. `recurring` is a
 * legacy import artefact and is NEVER treated as a canonical persisted type.
 */
const GENERIC_LINE_TYPES = new Set([
  "",
  "recurring",
  "one_time",
  "one-time",
  "once",
  "service",
  "unclassified",
  "unknown",
  "generic",
  "item",
  "line",
]);

/** Conservative description → canonical type inference (read/display only). */
const DESCRIPTION_RULES: { type: ContractLineType; test: (d: string) => boolean }[] = [
  { type: "sat", test: (d) => /\bs&at\b|\bsat\b|support\s*(&|and)\s*assist/.test(d) },
  { type: "hosting", test: (d) => /hosting|saas/.test(d) },
  { type: "mww_web", test: (d) => /manwinwin\s*web|mww\s*web|web\s*access/.test(d) },
];

export interface ClassifiableLine {
  line_type?: string | null;
  description?: string | null;
  amount?: number | null;
  currency?: string | null;
  billing_frequency?: string | null;
  [key: string]: any;
}

export interface ClassifiedLine<T extends ClassifiableLine = ClassifiableLine> {
  line: T;
  /** Raw stored value, unchanged. */
  rawType: string;
  /** Canonical type when known / safely inferred, otherwise "". */
  type: ContractLineType | "";
  label: string;
  /** True when the type came from description inference, not from storage. */
  isInferred: boolean;
  /** True when no canonical type could be established. */
  isUnclassified: boolean;
}

/**
 * Classifies one line. Canonical stored types win; generic/unknown stored types
 * fall back to conservative description mapping; everything else is flagged.
 */
export function classifyContractLine<T extends ClassifiableLine>(line: T): ClassifiedLine<T> {
  const rawType = (line.line_type || "").trim();
  const k = norm(rawType);

  if (isCanonicalLineType(rawType)) {
    return {
      line,
      rawType,
      type: rawType as ContractLineType,
      label: lineTypeLabel(rawType),
      isInferred: false,
      isUnclassified: false,
    };
  }

  if (GENERIC_LINE_TYPES.has(k)) {
    const d = norm(line.description);
    const rule = DESCRIPTION_RULES.find((r) => r.test(d));
    if (rule) {
      return {
        line,
        rawType,
        type: rule.type,
        label: lineTypeLabel(rule.type),
        isInferred: true,
        isUnclassified: false,
      };
    }
  }

  return {
    line,
    rawType,
    type: "",
    label: "Other / Needs review",
    isInferred: false,
    isUnclassified: true,
  };
}

export function classifyContractLines<T extends ClassifiableLine>(lines: T[]): ClassifiedLine<T>[] {
  return (lines || []).map(classifyContractLine);
}

/* ───────────────────────── Billing frequency ───────────────────────── */

export type BillingFrequency = "annual" | "monthly" | "quarterly" | "semiannual" | "one_time" | "unknown";

const FREQUENCY_ALIASES: Record<string, BillingFrequency> = {
  annual: "annual",
  annually: "annual",
  yearly: "annual",
  year: "annual",
  anual: "annual",
  monthly: "monthly",
  month: "monthly",
  mensal: "monthly",
  quarterly: "quarterly",
  quarter: "quarterly",
  trimestral: "quarterly",
  semiannual: "semiannual",
  semiannually: "semiannual",
  "semi-annual": "semiannual",
  biannual: "semiannual",
  semestral: "semiannual",
  onetime: "one_time",
  "one-time": "one_time",
  one_time: "one_time",
  once: "one_time",
  single: "one_time",
};

export function normalizeBillingFrequency(value: string | null | undefined): BillingFrequency {
  const k = norm(value).replace(/\s+/g, "");
  if (!k) return "unknown";
  return FREQUENCY_ALIASES[k] || FREQUENCY_ALIASES[norm(value)] || "unknown";
}

const ANNUALIZATION: Record<BillingFrequency, number> = {
  annual: 1,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  one_time: 0,
  unknown: 1, // conservative: unknown frequency is treated as an annual amount
};

/**
 * Annualizes an amount. Only explicit monthly / quarterly / semiannual
 * frequencies are multiplied; annual and unknown stay unchanged.
 */
export function annualizeAmount(amount: number | null | undefined, frequency: string | null | undefined): number {
  const freq = normalizeBillingFrequency(frequency);
  return Number(amount || 0) * ANNUALIZATION[freq];
}

/** True when the line contributes to recurring ARR. */
export function isRecurringClassifiedLine(c: ClassifiedLine): boolean {
  const freq = normalizeBillingFrequency(c.line.billing_frequency);
  if (freq === "one_time") return false;
  if (!c.type) return false;
  if (c.type === "discount") return true; // recurring discount unless flagged one-time
  return (RECURRING_LINE_TYPES as string[]).includes(c.type);
}

/** True when the line contributes to one-time revenue. */
export function isOneTimeClassifiedLine(c: ClassifiedLine): boolean {
  if (!c.type) return false;
  const freq = normalizeBillingFrequency(c.line.billing_frequency);
  if (freq === "one_time") return true;
  if (c.type === "discount") return false;
  return (ONE_TIME_LINE_TYPES as string[]).includes(c.type);
}

/* ───────────────────────── Financials ───────────────────────── */

export interface ContractFinancials {
  /** Annualized recurring value (discounts already applied, exactly once). */
  recurringArr: number;
  /** One-time revenue applicable in Year 1 (discounts already applied). */
  oneTimeValue: number;
  /** recurringArr + oneTimeValue. */
  year1Value: number;
  /** Net discount total (kept signed, informational). */
  discountTotal: number;
  currency: string;
  mixedCurrency: boolean;
  /** True when at least one line is classified and carries an amount. */
  hasReliableLines: boolean;
  /** Lines with no canonical type — visible, but excluded from totals. */
  unclassifiedCount: number;
  unclassifiedTotal: number;
  /** Lines whose amount is null/undefined (counted as 0). */
  missingAmountCount: number;
  inferredCount: number;
}

export function computeContractFinancials(lines: ClassifiableLine[]): ContractFinancials {
  const classified = classifyContractLines(lines || []);
  const currencies = new Set(
    classified.map((c) => (c.line.currency || "").trim().toUpperCase()).filter(Boolean)
  );

  let recurringArr = 0;
  let oneTimeValue = 0;
  let discountTotal = 0;
  let unclassifiedCount = 0;
  let unclassifiedTotal = 0;
  let missingAmountCount = 0;
  let inferredCount = 0;
  let classifiedWithAmount = 0;

  for (const c of classified) {
    const amount = c.line.amount;
    if (amount === null || amount === undefined) missingAmountCount += 1;
    if (c.isInferred) inferredCount += 1;

    if (c.isUnclassified) {
      unclassifiedCount += 1;
      unclassifiedTotal += Number(amount || 0);
      continue;
    }

    if (amount !== null && amount !== undefined) classifiedWithAmount += 1;
    if (c.type === "discount") discountTotal += Number(amount || 0);

    // A discount / value is counted in exactly one bucket.
    if (isRecurringClassifiedLine(c)) {
      recurringArr += annualizeAmount(amount, c.line.billing_frequency);
    } else if (isOneTimeClassifiedLine(c)) {
      oneTimeValue += Number(amount || 0);
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    recurringArr: round2(recurringArr),
    oneTimeValue: round2(oneTimeValue),
    year1Value: round2(recurringArr + oneTimeValue),
    discountTotal: round2(discountTotal),
    currency: currencies.size ? Array.from(currencies)[0] : "EUR",
    mixedCurrency: currencies.size > 1,
    hasReliableLines: classifiedWithAmount > 0,
    unclassifiedCount,
    unclassifiedTotal: round2(unclassifiedTotal),
    missingAmountCount,
    inferredCount,
  };
}

export interface LineGroup<T extends ClassifiableLine = ClassifiableLine> {
  key: string;
  label: string;
  order: number;
  isUnclassified: boolean;
  lines: ClassifiedLine<T>[];
  subtotal: number;
}

/** Groups lines for the Contract Breakdown, keeping unknown lines at the end. */
export function groupContractLines<T extends ClassifiableLine>(lines: T[]): LineGroup<T>[] {
  const groups = new Map<string, LineGroup<T>>();
  for (const c of classifyContractLines(lines || [])) {
    const key = c.type || "__unclassified";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: c.type ? lineTypeLabel(c.type) : "Other / Needs review",
        order: c.type ? lineTypeOrder(c.type) : 99,
        isUnclassified: !c.type,
        lines: [],
        subtotal: 0,
      });
    }
    const g = groups.get(key)!;
    g.lines.push(c);
    g.subtotal += Number(c.line.amount || 0);
  }
  return Array.from(groups.values()).sort((a, b) => a.order - b.order);
}

/**
 * Decides which financial source a UI should present.
 * Structured lines always win over legacy header values when reliable.
 */
export interface FinancialSourceDecision {
  source: "contract_lines" | "legacy_header" | "insufficient";
  /** True when the value shown is not an exact line-based calculation. */
  isEstimate: boolean;
  recurringArr: number | null;
  year1Value: number | null;
  oneTimeValue: number | null;
  reason: string;
}

export function decideFinancialSource(
  lines: ClassifiableLine[],
  legacy: { total_value?: number | null; contract_value?: number | null } = {}
): FinancialSourceDecision {
  const fin = computeContractFinancials(lines || []);
  if (fin.hasReliableLines) {
    return {
      source: "contract_lines",
      isEstimate: false,
      recurringArr: fin.recurringArr,
      year1Value: fin.year1Value,
      oneTimeValue: fin.oneTimeValue,
      reason: "Calculated from structured contract lines",
    };
  }
  const legacyValue = Number(legacy.total_value ?? legacy.contract_value ?? 0);
  if (legacyValue > 0) {
    return {
      source: "legacy_header",
      isEstimate: true,
      recurringArr: null,
      year1Value: legacyValue,
      oneTimeValue: null,
      reason: "Estimated from legacy contract header — no structured lines",
    };
  }
  return {
    source: "insufficient",
    isEstimate: true,
    recurringArr: null,
    year1Value: null,
    oneTimeValue: null,
    reason: "Insufficient detail to calculate contract value",
  };
}
