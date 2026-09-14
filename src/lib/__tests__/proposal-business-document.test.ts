import { describe, expect, it } from "vitest";
import type { PricingRule, Proposal } from "@/types/proposal";
import {
  computeBusinessOptions,
  type BusinessConfig,
} from "@/lib/proposal-business-engine";
import { buildInvestmentSummaryRows } from "@/lib/proposal-business-summary";
import { buildBusinessProposalPrintHtml } from "@/lib/proposal-business-print";

const rule = (
  code: string,
  unitPrice: number,
  extra: Partial<PricingRule> = {},
): PricingRule => ({
  id: code,
  code,
  label: code,
  category: "business",
  unit_price: unitPrice,
  unit_type: "one-time",
  currency: "EUR",
  active: true,
  notes: null,
  ...extra,
});

const rules: PricingRule[] = [
  rule("BUS_KEEPIT_MAINTENANCE_MODULE", 15_450),
  rule("BUS_WEB_MOBILE_USER", 20, { unit_type: "per-user-month" }),
  rule("BUS_KEEPIT_SAT", 0, { support_percentage: 17, unit_type: "yearly" }),
  rule("BUS_USEIT_SAT", 0, { unit_type: "yearly" }),
];

const config: BusinessConfig = {
  includeRequests: false,
  includeStock: false,
  includePurchase: false,
  pluginImport: false,
  pluginWorkflow: false,
  pluginAdvancedReports: false,
  pluginSLA: false,
  api: false,
  additionalBackoffice: 0,
  additionalWebUsers: 15,
  deployment: "on_premise",
  implementation: {
    type: "Onsite",
    liveSessions: 0,
    onsiteRegion: "International",
    onsiteClientDays: 10,
    onsiteBackofficeDays: 2,
    customServices: [{ label: "Per Diem", price: 330 }],
  },
  discounts: {
    softwarePct: 5,
    webUsersPct: 5,
    webUsersRenews: false,
    apiPct: 0,
    servicesPct: 0,
  },
};

const proposal = {
  id: "business-document-fixture",
  lead_id: "lead",
  parent_proposal_id: null,
  version: 1,
  language: "EN",
  plan: null,
  status: "Draft",
  hosting: "On-Premise",
  product_family: "Business",
  proposal_mode: "compare_keepit_useit",
  deployment: "on_premise",
  client_name: "Quest Plus",
  project_name: "Maintenance Software Implementation",
  country: "Philippines",
  proposal_date: "2026-09-14",
  validity_days: 60,
  payment_terms: null,
  notes: null,
  implementation_type: null,
  service_days: null,
  service_hours: null,
  backoffice_work_hours: null,
  per_diem: 330,
  discount_pct: 0,
  discount_scope: "none",
  include_requests_module: false,
  web_users: 15,
  software_subtotal: 0,
  services_subtotal: 0,
  discount_amount: 0,
  total_year_1: 0,
  total_recurring: 0,
  docx_url: null,
  pdf_url: null,
  generated_at: null,
  created_by: null,
  created_at: "2026-09-14",
  updated_at: "2026-09-14",
} as Proposal;

describe("Business proposal document transparency", () => {
  it("shows gross values before separate discount rows while retaining net engine totals", () => {
    const output = computeBusinessOptions(rules, config, ["keepit", "useit"]);
    expect(output.keepit?.totalYear1).toBe(31_244);

    const { rows } = buildInvestmentSummaryRows({
      keepit: output.keepit,
      useit: output.useit,
      cfg: config,
      lang: "EN",
    });

    const software = rows.find((row) => row.label === "Software license");
    const softwareDiscount = rows.find((row) => row.label === "Software discount");
    const web = rows.find((row) => row.label === "ManWinWin WEB/Mobile additional accesses");
    const total = rows.find((row) => row.label === "TOTAL OF THE YEAR (Year 1)");

    expect(software?.keepitY1).toBe(15_450);
    expect(softwareDiscount?.keepitY1).toBe(-772.5);
    expect(web?.keepitY1).toBe(3_600);
    expect(total?.keepitY1).toBe(31_244);
  });

  it("lists Per Diem explicitly in the real Business print document", () => {
    const html = buildBusinessProposalPrintHtml({ proposal, cfg: config, rules });
    expect(html).toContain("Per Diem: <strong>330 €</strong>");
    expect(html).toContain("Total onsite services: 9,790 €");
    expect(html).toContain("TOTAL OF THE YEAR (Year 1)");
  });
});
