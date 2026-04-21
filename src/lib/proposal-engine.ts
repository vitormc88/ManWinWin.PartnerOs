import type {
  PricingRule,
  ProposalItem,
  ProposalPlan,
  ImplementationType,
  ItemFrequency,
} from "@/types/proposal";

/** Plan → which Maintenance modules are included */
export const PLAN_INCLUDES: Record<ProposalPlan, string[]> = {
  1: ["Maintenance & Costs Module"],
  2: ["Maintenance & Costs Module", "Stock Management Module", "Purchase Orders Module"],
  3: [
    "Maintenance & Costs Module",
    "Stock Management Module",
    "Purchase Orders Module",
    "Plugin: Workflow",
    "Plugin: Advanced Reports",
    "Plugin: Import Tool",
    "Plugin: SLA",
    "API ManWinWin",
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
      return unitPrice * qty * 12;
    case "per-user-month":
      return unitPrice * qty * 12;
    case "yearly":
      return unitPrice * qty;
    case "one-time":
      return unitPrice * qty;
    case "per-hour":
      return unitPrice * qty;
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
  perDiem: number;
}

/** Build the default editable item list from current plan + service config. */
export function buildDefaultItems({
  rules,
  plan,
  implementationType,
  includeRequestsModule,
  webUsers,
  perDiem,
}: BuildItemsArgs): ProposalItem[] {
  const items: ProposalItem[] = [];
  let order = 0;

  // 1. Annual license (software)
  const license = findRule(rules, PLAN_LICENSE_CODE[plan]);
  if (license) {
    items.push({
      category: "software",
      item_code: license.code,
      item_name: license.label,
      description: PLAN_INCLUDES[plan].join(", "),
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
        item_name: r.label,
        description: r.notes,
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
        item_name: `${w.label} (x${webUsers})`,
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
    implLabel = `Online Implementation - Plan ${plan}`;
  } else if (implementationType === "Light Implementation") {
    implCode = `impl_light_p${plan}`;
    implLabel = `Online Light Implementation - Plan ${plan}`;
  } else if (implementationType === "RCI Professional") {
    implCode = "rci_professional";
    implLabel = "RCI Professional";
  } else if (implementationType === "Onsite") {
    implCode = `impl_online_p${plan}`;
    implLabel = `Onsite Implementation - Plan ${plan}`;
  }

  if (implCode) {
    const s = findRule(rules, implCode);
    if (s) {
      items.push({
        category: "service",
        item_code: s.code,
        item_name: implLabel,
        description: s.notes,
        qty: 1,
        unit_price: s.unit_price,
        frequency: "one-time",
        total: s.unit_price,
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
        item_name: r.label,
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

  // 6. Per diem (onsite scenarios)
  if (implementationType === "Onsite" && perDiem > 0) {
    items.push({
      category: "service",
      item_code: "onsite_per_diem",
      item_name: "Onsite per diem",
      description: "Travel + accommodation per diem",
      qty: 1,
      unit_price: perDiem,
      frequency: "one-time",
      total: perDiem,
      is_override: false,
      is_recurring: false,
      sort_order: order++,
    });
  }

  return items;
}

export interface ProposalTotals {
  softwareSubtotal: number;
  servicesSubtotal: number;
  recurringYearly: number;
  oneTime: number;
  subtotal: number;
  discountAmount: number;
  totalYear1: number;
  totalRecurring: number;
}

export function computeTotals(items: ProposalItem[], discountPct: number): ProposalTotals {
  let softwareSubtotal = 0;
  let servicesSubtotal = 0;
  let recurringYearly = 0;
  let oneTime = 0;

  for (const item of items) {
    const t = item.total ?? yearlyEquivalent(item.unit_price, item.qty, item.frequency);
    if (item.category === "software" || item.category === "addon") {
      softwareSubtotal += t;
    } else {
      servicesSubtotal += t;
    }
    if (item.is_recurring) recurringYearly += t;
    else oneTime += t;
  }

  const subtotal = softwareSubtotal + servicesSubtotal;
  const discountAmount = subtotal * (discountPct / 100);
  const totalYear1 = subtotal - discountAmount;
  // Recurring after year 1: only the recurring lines (no one-time, no discount typically)
  const totalRecurring = recurringYearly;

  return {
    softwareSubtotal,
    servicesSubtotal,
    recurringYearly,
    oneTime,
    subtotal,
    discountAmount,
    totalYear1,
    totalRecurring,
  };
}

export function recomputeItemTotal(item: ProposalItem): number {
  return yearlyEquivalent(item.unit_price, item.qty, item.frequency);
}

export const FREQUENCY_LABEL: Record<ItemFrequency, string> = {
  yearly: "/ year",
  monthly: "/ month",
  "one-time": "one-time",
  "per-user-month": "/ user / month",
  "per-hour": "/ hour",
};
