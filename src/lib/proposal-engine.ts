import type {
  PricingRule,
  ProposalItem,
  ProposalPlan,
  ImplementationType,
  ItemFrequency,
  ProposalLanguage,
  ProposalDiscountScope,
  ProposalLineDiscountType,
} from "@/types/proposal";
import { t } from "@/lib/proposal-i18n";

/**
 * Plan → human-readable list of included items. Used for the Plan description block.
 * Each entry is shown verbatim under "Includes:" in the proposal.
 */
export function planIncludesLabels(plan: ProposalPlan, lang: ProposalLanguage = "EN"): string[] {
  const s = t(lang);
  const base = [s.maintenanceModule];
  if (plan === 1) {
    return [...base, s.backofficeAccess, s.webAccess];
  }
  if (plan === 2) {
    return [...base, s.stockModule, s.purchaseOrdersModule, s.backofficeAccess, s.webAccess];
  }
  return [
    ...base,
    s.stockModule,
    s.purchaseOrdersModule,
    `${s.pluginsLabel}`,
    `  · ${s.pluginImportTool}`,
    `  · ${s.pluginWorkflow}`,
    `  · ${s.pluginAdvancedReports}`,
    `  · ${s.pluginSLA}`,
    s.apiManwinwin,
    s.backofficeAccess,
    s.webAccess,
  ];
}

/** Short module-name list used in Step "Software" badges. */
export const PLAN_INCLUDES: Record<ProposalPlan, string[]> = {
  1: ["Maintenance & Costs Module", "1 BackOffice access", "1 Web/Mobile access"],
  2: [
    "Maintenance & Costs Module",
    "Stock Management Module",
    "Purchase Orders Module",
    "1 BackOffice access",
    "1 Web/Mobile access",
  ],
  3: [
    "Maintenance & Costs Module",
    "Stock Management Module",
    "Purchase Orders Module",
    "Plugins (Import / Workflow / Adv. Reports / SLA)",
    "API ManWinWin",
    "1 BackOffice access",
    "1 Web/Mobile access",
  ],
};

export const PLAN_LICENSE_CODE: Record<ProposalPlan, string> = {
  1: "plan_1_annual",
  2: "plan_2_annual",
  3: "plan_3_annual",
};

export function findRule(rules: PricingRule[], code: string): PricingRule | undefined {
  return rules.find((r) => r.code === code && r.active);
}

/** Yearly equivalent for any frequency */
export function yearlyEquivalent(unitPrice: number, qty: number, freq: ItemFrequency): number {
  switch (freq) {
    case "monthly":
    case "per-user-month":
      return unitPrice * qty * 12;
    case "yearly":
    case "one-time":
    case "per-hour":
    default:
      return unitPrice * qty;
  }
}

interface BuildItemsArgs {
  rules: PricingRule[];
  plan: ProposalPlan;
  implementationType: ImplementationType;
  includeRequestsModule: boolean;
  webUsers: number;
  /** Number of onsite days (only used when implementationType === "Onsite"). */
  onsiteDays?: number;
  /** Per-diem rate. Defaults to the pricing_rules.onsite_per_diem unit_price. */
  perDiem?: number;
  /** Language drives item descriptions. */
  language?: ProposalLanguage;
}

/**
 * Build the default editable item list from current plan + service config.
 * Each item description is detailed enough to be shown verbatim in DOCX/PDF.
 */
export function buildDefaultItems({
  rules,
  plan,
  implementationType,
  includeRequestsModule,
  webUsers,
  onsiteDays = 0,
  perDiem,
  language = "EN",
}: BuildItemsArgs): ProposalItem[] {
  const s = t(language);
  const items: ProposalItem[] = [];
  let order = 0;

  // 1. Annual license (software)
  const license = findRule(rules, PLAN_LICENSE_CODE[plan]);
  if (license) {
    items.push({
      category: "software",
      item_code: license.code,
      item_name: `ManWinWin Professional — Plan ${plan} (annual license)`,
      description: planIncludesLabels(plan, language).join(" • "),
      qty: 1,
      unit_price: license.unit_price,
      frequency: "yearly",
      total: license.unit_price,
      is_override: false,
      is_recurring: true,
      sort_order: order++,
    });
  }

  // 2. Optional requests module
  if (includeRequestsModule) {
    const r = findRule(rules, "requests_module");
    if (r) {
      items.push({
        category: "addon",
        item_code: r.code,
        item_name: "Maintenance Requests Module",
        description: s.requestsModuleDesc,
        qty: 1,
        unit_price: r.unit_price,
        frequency: "yearly",
        total: r.unit_price,
        is_override: false,
        is_recurring: true,
        sort_order: order++,
      });
    }
  }

  // 3. Web users
  if (webUsers > 0) {
    const w = findRule(rules, "web_user");
    if (w) {
      items.push({
        category: "addon",
        item_code: w.code,
        item_name: `ManWinWin WEB / Mobility additional accesses (×${webUsers})`,
        description: `${webUsers} additional WEB / Mobility access(es) at ${w.unit_price} € / user / month`,
        qty: webUsers,
        unit_price: w.unit_price,
        frequency: "per-user-month",
        total: yearlyEquivalent(w.unit_price, webUsers, "per-user-month"),
        is_override: false,
        is_recurring: true,
        sort_order: order++,
      });
    }
  }

  // 4. Implementation service (one-time)
  let implCode: string | null = null;
  let implLabel = "";
  if (implementationType === "Online") {
    implCode = `impl_online_p${plan}`;
    implLabel = `Online Implementation — Plan ${plan}`;
  } else if (implementationType === "Light Implementation") {
    implCode = `impl_light_p${plan}`;
    implLabel = `Online Light Implementation — Plan ${plan}`;
  } else if (implementationType === "Onsite") {
    implCode = `impl_online_p${plan}`;
    implLabel = `Onsite Implementation — Plan ${plan}`;
  } else if (implementationType === "RCI Professional") {
    implCode = "rci_professional";
    implLabel = "RCI Professional";
  }

  if (implCode) {
    const sv = findRule(rules, implCode);
    if (sv) {
      items.push({
        category: "service",
        item_code: sv.code,
        item_name: implLabel,
        description: sv.notes,
        qty: 1,
        unit_price: sv.unit_price,
        frequency: "one-time",
        total: sv.unit_price,
        is_override: false,
        is_recurring: false,
        sort_order: order++,
      });
    }
  }

  // 5. Requests implementation (only if requests module active)
  if (includeRequestsModule) {
    const r = findRule(rules, "impl_requests");
    if (r) {
      items.push({
        category: "service",
        item_code: r.code,
        item_name: "Maintenance Requests Implementation",
        description: r.notes,
        qty: 1,
        unit_price: r.unit_price,
        frequency: "one-time",
        total: r.unit_price,
        is_override: false,
        is_recurring: false,
        sort_order: order++,
      });
    }
  }

  // 6. Onsite days × per-diem (Professional uses days; perDiem is the unit price)
  if (implementationType === "Onsite" && onsiteDays > 0) {
    const pdRule = findRule(rules, "onsite_per_diem");
    const unit = perDiem && perDiem > 0 ? perDiem : pdRule?.unit_price ?? 0;
    if (unit > 0) {
      items.push({
        category: "service",
        item_code: "onsite_per_diem",
        item_name: `Onsite days (×${onsiteDays})`,
        description: `Travel + accommodation per diem · ${unit} € × ${onsiteDays} day(s)`,
        qty: onsiteDays,
        unit_price: unit,
        frequency: "one-time",
        total: unit * onsiteDays,
        is_override: false,
        is_recurring: false,
        sort_order: order++,
      });
    }
  }

  return items;
}

export interface ProposalTotals {
  softwareSubtotal: number;
  servicesSubtotal: number;
  softwareGrossSubtotal: number;
  servicesGrossSubtotal: number;
  recurringYearly: number;
  oneTime: number;
  subtotal: number;
  softwareDiscountAmount: number;
  servicesDiscountAmount: number;
  lineDiscountAmount: number;
  recurringAfterDiscount: number;
  discountScope: ProposalDiscountScope;
  discountAmount: number;
  totalYear1: number;
  totalRecurring: number;
}

export function getItemBaseTotal(item: ProposalItem): number {
  return yearlyEquivalent(item.unit_price, item.qty, item.frequency);
}

export function getItemSectionDiscountPct(item: ProposalItem, softwareDiscountPct = 0, servicesDiscountPct = 0): number {
  const isSoftware = item.category === "software" || item.category === "addon";
  return isSoftware ? Number(softwareDiscountPct || 0) : Number(servicesDiscountPct || 0);
}

export function hasItemOwnDiscount(item: ProposalItem): boolean {
  return Boolean(item.discount_type && item.discount_type !== "none" && Number(item.discount_value || 0) > 0);
}

export function getItemDiscountAmount(item: ProposalItem, sectionDiscountPct = 0): number {
  const base = getItemBaseTotal(item);
  const type = (item.discount_type || "none") as ProposalLineDiscountType;
  const value = Number(item.discount_value || 0);

  if (type === "percent") return Math.min(base, (base * value) / 100);
  if (type === "fixed") return Math.min(base, value);
  if (sectionDiscountPct > 0) return Math.min(base, (base * sectionDiscountPct) / 100);
  return 0;
}

export function getItemNetTotal(item: ProposalItem, sectionDiscountPct = 0): number {
  return Math.max(0, getItemBaseTotal(item) - getItemDiscountAmount(item, sectionDiscountPct));
}

export function enrichProposalItem(item: ProposalItem, softwareDiscountPct = 0, servicesDiscountPct = 0): ProposalItem {
  const sectionPct = getItemSectionDiscountPct(item, softwareDiscountPct, servicesDiscountPct);
  const grossTotal = getItemBaseTotal(item);
  const discountAmount = getItemDiscountAmount(item, sectionPct);
  const netTotal = Math.max(0, grossTotal - discountAmount);
  return {
    ...item,
    total: grossTotal,
    gross_total: grossTotal,
    discount_amount: discountAmount,
    net_total: netTotal,
  };
}

export function computeTotals(
  items: ProposalItem[],
  softwareDiscountPct = 0,
  servicesDiscountPct = 0,
): ProposalTotals {
  let softwareSubtotal = 0;
  let servicesSubtotal = 0;
  let softwareGrossSubtotal = 0;
  let servicesGrossSubtotal = 0;
  let recurringYearly = 0;
  let oneTime = 0;

  let softwareDiscountAmount = 0;
  let servicesDiscountAmount = 0;
  let lineDiscountAmount = 0;

  for (const item of items) {
    const isSoftware = item.category === "software" || item.category === "addon";
    const enriched = enrichProposalItem(item, softwareDiscountPct, servicesDiscountPct);
    if (isSoftware) {
      softwareGrossSubtotal += enriched.gross_total || 0;
      softwareSubtotal += enriched.net_total || 0;
      softwareDiscountAmount += enriched.discount_amount || 0;
    } else {
      servicesGrossSubtotal += enriched.gross_total || 0;
      servicesSubtotal += enriched.net_total || 0;
      servicesDiscountAmount += enriched.discount_amount || 0;
    }
    if (hasItemOwnDiscount(enriched)) lineDiscountAmount += enriched.discount_amount || 0;
    if (enriched.is_recurring) recurringYearly += enriched.net_total || 0;
    else oneTime += enriched.net_total || 0;
  }

  const subtotal = softwareSubtotal + servicesSubtotal;
  const discountAmount = softwareDiscountAmount + servicesDiscountAmount;
  const totalYear1 = recurringYearly + oneTime;
  const recurringAfterDiscount = recurringYearly;
  const totalRecurring = recurringAfterDiscount;

  return {
    softwareSubtotal,
    servicesSubtotal,
    softwareGrossSubtotal,
    servicesGrossSubtotal,
    recurringYearly,
    oneTime,
    subtotal,
    softwareDiscountAmount,
    servicesDiscountAmount,
    lineDiscountAmount,
    recurringAfterDiscount,
    discountScope: "none",
    discountAmount,
    totalYear1,
    totalRecurring,
  };
}

export function recomputeItemTotal(item: ProposalItem): number {
  return getItemBaseTotal(item);
}

export const FREQUENCY_LABEL: Record<ItemFrequency, string> = {
  yearly: "/ year",
  monthly: "/ month",
  "one-time": "one-time",
  "per-user-month": "/ user / month",
  "per-hour": "/ hour",
};
