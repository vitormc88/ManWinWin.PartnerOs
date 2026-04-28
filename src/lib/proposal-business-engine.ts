/**
 * Business Proposal Engine
 *
 * Computes KeepIT and UseIT option totals for a Business proposal config.
 * Independent from the Professional engine — must NOT alter Professional logic.
 */
import type { PricingRule, ProposalDeployment, ProposalLicenseModel } from "@/types/proposal";

export type OnsiteRegion = "Portugal" | "International" | "Western Europe";

/** Onsite day rates per region (MVP — embedded constants). */
export const ONSITE_RATES: Record<OnsiteRegion, { client: number; backoffice: number }> = {
  Portugal: { client: 695, backoffice: 530 },
  International: { client: 840, backoffice: 530 },
  "Western Europe": { client: 1080, backoffice: 790 },
};

export interface BusinessDiscounts {
  /** % discount applied to all license/module/plugin/additional BackOffice items. */
  softwarePct: number;
  /** % discount applied only to additional Web/Mobile users. */
  webUsersPct: number;
  /** Whether Web/Mobile users discount also applies to renewals (Year 2+). */
  webUsersRenews: boolean;
  /** % discount applied to API line. Optional separate channel. */
  apiPct: number;
  /** % discount applied to all service lines. */
  servicesPct: number;
}

export const DEFAULT_BUSINESS_DISCOUNTS: BusinessDiscounts = {
  softwarePct: 0,
  webUsersPct: 0,
  webUsersRenews: false,
  apiPct: 0,
  servicesPct: 0,
};

export interface BusinessConfig {
  /** Required maintenance module is always ON. */
  includeRequests: boolean;
  includeStock: boolean;
  includePurchase: boolean;
  pluginImport: boolean;
  pluginWorkflow: boolean;
  pluginAdvancedReports: boolean;
  pluginSLA: boolean;
  api: boolean;
  /** Additional BackOffice users beyond the 3 included. */
  additionalBackoffice: number;
  /** Additional Web/Mobile users beyond the 1 included. */
  additionalWebUsers: number;
  deployment: ProposalDeployment;
  /** Implementation services configuration. */
  implementation: BusinessImplementationConfig;
  /** Optional discounts (default 0). */
  discounts: BusinessDiscounts;
}

export interface BusinessImplementationConfig {
  type: "RCI Business" | "Onsite" | "Custom";
  liveSessions: number;
  /** Custom one-time services (label + price). */
  customServices: Array<{ label: string; price: number }>;
  /** Onsite-only fields. */
  onsiteClientDays?: number;
  onsiteBackofficeDays?: number;
  onsiteRegion?: OnsiteRegion;
}

export interface BusinessLineItem {
  code: string;
  label: string;
  category: "module" | "plugin" | "backoffice_user" | "web_user" | "api" | "hosting" | "support" | "service";
  /** Raw unit price from pricing rule. */
  unitPrice: number;
  qty: number;
  /** Gross yearly amount (for recurring) or gross one-time amount, before discount. */
  amount: number;
  /** Discount % applied to this line (0 if none). */
  discountPct: number;
  /** Discount monetary amount (gross × pct). */
  discountAmount: number;
  /** Net amount after discount. */
  netAmount: number;
  /** Whether this line recurs in Year 2+. */
  recurring: boolean;
  /** Whether the discount also applies to Year 2+ renewals (web users). */
  discountAppliesToRenewal: boolean;
  /** Frequency descriptor for display. */
  frequency: "one-time" | "yearly" | "per-user-month";
}

export interface BusinessSatBreakdown {
  /** KeepIT only: gross license base used for the 17% S&AT calculation
   * (modules + plugins + additional BackOffice — EXCLUDES web users, API, hosting, services). */
  satBase: number;
  /** KeepIT only: S&AT percentage (e.g. 17). */
  satPct: number;
  /** KeepIT only: 17% × satBase. */
  satPercentageAmount: number;
  /** Pre-contracted S&AT day (490 €) — KeepIT only, explicit. */
  baseSatDay: number;
  /** Default included Web/Mobile user (240 €) — KeepIT only, explicit. */
  baseDefaultWeb: number;
}

export interface BusinessOptionTotals {
  model: ProposalLicenseModel;
  software: BusinessLineItem[];
  api: BusinessLineItem | null;
  hosting: BusinessLineItem[];
  sat: BusinessLineItem | null;
  services: BusinessLineItem[];
  /** License gross subtotal used for KeepIT S&AT (modules + plugins + additional BackOffice).
   *  Excludes additional Web/Mobile users, API, hosting, services. */
  licenseSubtotal: number;
  /** Detailed S&AT breakdown for audit transparency. */
  satBreakdown: BusinessSatBreakdown;
  /** Year 1 = software net + api net + hosting + sat + services net */
  totalYear1: number;
  /** Year 2+ recurring net total. */
  totalYear2Plus: number;
  /** 5-year cumulative total: Y1 + 4 × Y2+. */
  totalFiveYears: number;
  /** Convenience flag: true if any line has a discount > 0. */
  hasDiscounts: boolean;
}

export interface BusinessEngineOutput {
  keepit: BusinessOptionTotals | null;
  useit: BusinessOptionTotals | null;
}

const findBusinessRule = (rules: PricingRule[], code: string) =>
  rules.find((r) => r.active && r.code === code);

const yearlyFromUnit = (rule: PricingRule, qty: number): number => {
  if (rule.unit_type === "per-user-month" || rule.billing_frequency === "per-user-month") {
    return rule.unit_price * qty * 12;
  }
  return rule.unit_price * qty;
};

const buildLine = (
  rule: PricingRule | undefined,
  qty: number,
  category: BusinessLineItem["category"],
  recurring: boolean,
  amountOverride?: number,
  discountPct = 0,
  discountAppliesToRenewal = false,
): BusinessLineItem | null => {
  if (!rule || qty <= 0) return null;
  const isPerUserMonth =
    rule.unit_type === "per-user-month" || rule.billing_frequency === "per-user-month";
  const isYearly = rule.unit_type === "yearly" || rule.billing_frequency === "yearly";
  const frequency: BusinessLineItem["frequency"] = isPerUserMonth
    ? "per-user-month"
    : isYearly
    ? "yearly"
    : "one-time";
  const amount = amountOverride !== undefined ? amountOverride : yearlyFromUnit(rule, qty);
  const pct = Math.max(0, Math.min(100, discountPct || 0));
  const discountAmount = +(amount * (pct / 100)).toFixed(2);
  const netAmount = +(amount - discountAmount).toFixed(2);
  return {
    code: rule.code,
    label: rule.label,
    category,
    unitPrice: rule.unit_price,
    qty,
    amount,
    discountPct: pct,
    discountAmount,
    netAmount,
    recurring,
    discountAppliesToRenewal: pct > 0 && discountAppliesToRenewal,
    frequency,
  };
};

/**
 * Compute one option (KeepIT or UseIT) for the given Business config.
 * Returns null if required pricing rules are missing.
 */
export function computeBusinessOption(
  rules: PricingRule[],
  cfg: BusinessConfig,
  model: ProposalLicenseModel,
): BusinessOptionTotals | null {
  const isKeepIt = model === "keepit";
  const prefix = isKeepIt ? "BUS_KEEPIT_" : "BUS_USEIT_";
  // For KeepIT, modules are one-time (not recurring).
  // For UseIT, modules are yearly (recurring).
  const modulesRecurring = !isKeepIt;
  const discounts = cfg.discounts || DEFAULT_BUSINESS_DISCOUNTS;
  const swPct = discounts.softwarePct || 0;

  const software: BusinessLineItem[] = [];

  // Maintenance module — always required
  const mainModule = findBusinessRule(rules, `${prefix}MAINTENANCE_MODULE`);
  if (!mainModule) return null;
  software.push(buildLine(mainModule, 1, "module", modulesRecurring, undefined, swPct)!);

  if (cfg.includeRequests) {
    const r = findBusinessRule(rules, `${prefix}REQUESTS_MODULE`);
    if (r) software.push(buildLine(r, 1, "module", modulesRecurring, undefined, swPct)!);
  }
  if (cfg.includeStock) {
    const r = findBusinessRule(rules, `${prefix}STOCK_MODULE`);
    if (r) software.push(buildLine(r, 1, "module", modulesRecurring, undefined, swPct)!);
  }
  if (cfg.includePurchase) {
    const r = findBusinessRule(rules, `${prefix}PURCHASE_MODULE`);
    if (r) software.push(buildLine(r, 1, "module", modulesRecurring, undefined, swPct)!);
  }
  if (cfg.pluginImport) {
    const r = findBusinessRule(rules, `${prefix}PLUGIN_IMPORT`);
    if (r) software.push(buildLine(r, 1, "plugin", modulesRecurring, undefined, swPct)!);
  }
  if (cfg.pluginWorkflow) {
    const r = findBusinessRule(rules, `${prefix}PLUGIN_WORKFLOW`);
    if (r) software.push(buildLine(r, 1, "plugin", modulesRecurring, undefined, swPct)!);
  }
  if (cfg.pluginAdvancedReports) {
    const r = findBusinessRule(rules, `${prefix}PLUGIN_ADVANCED_REPORTS`);
    if (r) software.push(buildLine(r, 1, "plugin", modulesRecurring, undefined, swPct)!);
  }
  if (cfg.pluginSLA) {
    const r = findBusinessRule(rules, `${prefix}PLUGIN_SLA`);
    if (r) software.push(buildLine(r, 1, "plugin", modulesRecurring, undefined, swPct)!);
  }

  if (cfg.additionalBackoffice > 0) {
    const r = findBusinessRule(rules, `${prefix}ADDITIONAL_BACKOFFICE`);
    if (r) software.push(buildLine(r, cfg.additionalBackoffice, "backoffice_user", modulesRecurring, undefined, swPct)!);
  }

  // Web/Mobile users — always recurring (per-user-month -> yearly *12)
  // Use webUsersPct discount (separate channel) and respect renewal toggle.
  if (cfg.additionalWebUsers > 0) {
    const w = findBusinessRule(rules, "BUS_WEB_MOBILE_USER");
    if (w)
      software.push(
        buildLine(
          w,
          cfg.additionalWebUsers,
          "web_user",
          true,
          undefined,
          discounts.webUsersPct || 0,
          discounts.webUsersRenews,
        )!,
      );
  }

  // API
  let api: BusinessLineItem | null = null;
  if (cfg.api) {
    const r = findBusinessRule(rules, "BUS_API");
    if (r) api = buildLine(r, 1, "api", true, undefined, discounts.apiPct || 0, true);
  }

  // SaaS hosting — never discounted
  const hosting: BusinessLineItem[] = [];
  if (cfg.deployment === "saas") {
    const base = findBusinessRule(rules, "BUS_SAAS_HOSTING_BASE");
    if (base) hosting.push(buildLine(base, 1, "hosting", true)!);
    if (cfg.additionalBackoffice > 0) {
      const ext = findBusinessRule(rules, "BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE");
      if (ext) hosting.push(buildLine(ext, cfg.additionalBackoffice, "hosting", true)!);
    }
  }

  // S&AT base (KeepIT only):
  // Sum of GROSS amounts for modules + plugins + additional BackOffice users.
  // EXCLUDES additional Web/Mobile users, API, hosting and services.
  const licenseSubtotal = software
    .filter((l) => l.category === "module" || l.category === "plugin" || l.category === "backoffice_user")
    .reduce((s, l) => s + l.amount, 0);

  // S&AT
  let sat: BusinessLineItem | null = null;
  let satBreakdown: BusinessSatBreakdown = {
    satBase: 0,
    satPct: 0,
    satPercentageAmount: 0,
    baseSatDay: 0,
    baseDefaultWeb: 0,
  };
  const satRule = findBusinessRule(rules, isKeepIt ? "BUS_KEEPIT_SAT" : "BUS_USEIT_SAT");
  if (satRule) {
    if (isKeepIt) {
      const pct = Number(satRule.support_percentage || 0);
      const baseSatDay = findBusinessRule(rules, "BUS_BASE_SAT_DAY")?.unit_price ?? 490;
      const baseDefaultWeb = findBusinessRule(rules, "BUS_BASE_DEFAULT_WEB")?.unit_price ?? 240;
      const satPercentageAmount = +(licenseSubtotal * (pct / 100)).toFixed(2);
      const amount = +(satPercentageAmount + baseSatDay + baseDefaultWeb).toFixed(2);
      sat = buildLine(satRule, 1, "support", true, amount);
      satBreakdown = {
        satBase: licenseSubtotal,
        satPct: pct,
        satPercentageAmount,
        baseSatDay,
        baseDefaultWeb,
      };
    } else {
      // included = 0 (UseIT annual license already includes base SAT day + default Web/Mobile user)
      sat = buildLine(satRule, 1, "support", true, 0);
    }
  }

  // Services
  const services: BusinessLineItem[] = [];
  const svcPct = discounts.servicesPct || 0;
  if (cfg.implementation.type === "RCI Business") {
    const baseRci = findBusinessRule(rules, "BUS_RCI_BASE");
    if (baseRci) services.push(buildLine(baseRci, 1, "service", false, undefined, svcPct)!);
    if (cfg.includeStock) {
      const r = findBusinessRule(rules, "BUS_RCI_STOCK");
      if (r) services.push(buildLine(r, 1, "service", false, undefined, svcPct)!);
    }
    if (cfg.includeRequests) {
      const r = findBusinessRule(rules, "BUS_RCI_REQUESTS");
      if (r) services.push(buildLine(r, 1, "service", false, undefined, svcPct)!);
    }
    if (cfg.includePurchase) {
      const r = findBusinessRule(rules, "BUS_RCI_PURCHASING");
      if (r) services.push(buildLine(r, 1, "service", false, undefined, svcPct)!);
    }
    if (cfg.additionalWebUsers > 0) {
      const r = findBusinessRule(rules, "BUS_RCI_WEB");
      if (r) services.push(buildLine(r, 1, "service", false, undefined, svcPct)!);
    }
    if (cfg.pluginWorkflow) {
      const r = findBusinessRule(rules, "BUS_RCI_PLUGIN_WORKFLOW");
      if (r) services.push(buildLine(r, 1, "service", false, undefined, svcPct)!);
    }
    if (cfg.pluginImport) {
      const r = findBusinessRule(rules, "BUS_RCI_PLUGIN_IMPORT");
      if (r) services.push(buildLine(r, 1, "service", false, undefined, svcPct)!);
    }
    if (cfg.pluginSLA) {
      const r = findBusinessRule(rules, "BUS_RCI_PLUGIN_SLA");
      if (r) services.push(buildLine(r, 1, "service", false, undefined, svcPct)!);
    }
    if (cfg.pluginAdvancedReports) {
      const r = findBusinessRule(rules, "BUS_RCI_PLUGIN_ADVANCED_REPORTS");
      if (r) services.push(buildLine(r, 1, "service", false, undefined, svcPct)!);
    }
    if (cfg.implementation.liveSessions > 0) {
      const r = findBusinessRule(rules, "BUS_RCI_LIVE_SESSION");
      if (r) services.push(buildLine(r, cfg.implementation.liveSessions, "service", false, undefined, svcPct)!);
    }
  } else if (cfg.implementation.type === "Onsite") {
    const region = (cfg.implementation.onsiteRegion || "Portugal") as OnsiteRegion;
    const rates = ONSITE_RATES[region] || ONSITE_RATES.Portugal;
    const cd = Math.max(0, cfg.implementation.onsiteClientDays || 0);
    const bd = Math.max(0, cfg.implementation.onsiteBackofficeDays || 0);
    if (cd > 0) {
      const gross = cd * rates.client;
      const discAmount = +(gross * (svcPct / 100)).toFixed(2);
      services.push({
        code: `onsite_client_${region}`,
        label: `Onsite — Client days (${region})`,
        category: "service",
        unitPrice: rates.client,
        qty: cd,
        amount: gross,
        discountPct: svcPct,
        discountAmount: discAmount,
        netAmount: +(gross - discAmount).toFixed(2),
        recurring: false,
        discountAppliesToRenewal: false,
        frequency: "one-time",
      });
    }
    if (bd > 0) {
      const gross = bd * rates.backoffice;
      const discAmount = +(gross * (svcPct / 100)).toFixed(2);
      services.push({
        code: `onsite_backoffice_${region}`,
        label: `Onsite — BackOffice days (${region})`,
        category: "service",
        unitPrice: rates.backoffice,
        qty: bd,
        amount: gross,
        discountPct: svcPct,
        discountAmount: discAmount,
        netAmount: +(gross - discAmount).toFixed(2),
        recurring: false,
        discountAppliesToRenewal: false,
        frequency: "one-time",
      });
    }
  }

  // Custom services lines (apply services discount %)
  for (const cs of cfg.implementation.customServices || []) {
    if (cs.price > 0) {
      const gross = cs.price;
      const discAmount = +(gross * (svcPct / 100)).toFixed(2);
      services.push({
        code: "custom",
        label: cs.label || "Custom service",
        category: "service",
        unitPrice: cs.price,
        qty: 1,
        amount: gross,
        discountPct: svcPct,
        discountAmount: discAmount,
        netAmount: +(gross - discAmount).toFixed(2),
        recurring: false,
        discountAppliesToRenewal: false,
        frequency: "one-time",
      });
    }
  }

  // ---- Totals (use NET amounts) ----
  const softwareNet = software.reduce((s, l) => s + l.netAmount, 0);
  const apiNet = api?.netAmount || 0;
  const hostingNet = hosting.reduce((s, l) => s + l.netAmount, 0);
  const satNet = sat?.netAmount || 0;
  const servicesNet = services.reduce((s, l) => s + l.netAmount, 0);

  const totalYear1 = +(softwareNet + apiNet + hostingNet + satNet + servicesNet).toFixed(2);

  // Year 2+ recurring software:
  // - Web users (per-user-month) recur with discount only if discountAppliesToRenewal.
  // - Other recurring software (UseIT modules/plugins) recur GROSS (no renewal discount in MVP).
  const recurringSoftware = software
    .filter((l) => l.recurring)
    .reduce((s, l) => s + (l.discountAppliesToRenewal ? l.netAmount : l.amount), 0);
  // API: if discount renews, use net; else gross. (We default API renewal = true above.)
  const apiRecurring = api ? (api.discountAppliesToRenewal ? api.netAmount : api.amount) : 0;
  const totalYear2Plus = +(recurringSoftware + apiRecurring + hostingNet + satNet).toFixed(2);

  const totalFiveYears = +(totalYear1 + totalYear2Plus * 4).toFixed(2);

  const hasDiscounts =
    software.some((l) => l.discountAmount > 0) ||
    (api?.discountAmount || 0) > 0 ||
    services.some((l) => l.discountAmount > 0);

  return {
    model,
    software,
    api,
    hosting,
    sat,
    services,
    licenseSubtotal,
    satBreakdown,
    totalYear1,
    totalYear2Plus,
    totalFiveYears,
    hasDiscounts,
  };
}

/** Compute both options (KeepIT and UseIT) for comparison mode. */
export function computeBusinessOptions(
  rules: PricingRule[],
  cfg: BusinessConfig,
  models: ProposalLicenseModel[] = ["keepit", "useit"],
): BusinessEngineOutput {
  return {
    keepit: models.includes("keepit") ? computeBusinessOption(rules, cfg, "keepit") : null,
    useit: models.includes("useit") ? computeBusinessOption(rules, cfg, "useit") : null,
  };
}

export const DEFAULT_BUSINESS_CONFIG: BusinessConfig = {
  includeRequests: false,
  includeStock: false,
  includePurchase: false,
  pluginImport: false,
  pluginWorkflow: false,
  pluginAdvancedReports: false,
  pluginSLA: false,
  api: false,
  additionalBackoffice: 0,
  additionalWebUsers: 0,
  deployment: "saas",
  implementation: {
    type: "RCI Business",
    liveSessions: 0,
    customServices: [],
    onsiteClientDays: 0,
    onsiteBackofficeDays: 0,
    onsiteRegion: "Portugal",
  },
  discounts: { ...DEFAULT_BUSINESS_DISCOUNTS },
};
