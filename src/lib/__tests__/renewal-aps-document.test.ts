/**
 * Release gate 1 — APS-equivalent renewal document acceptance.
 *
 * Renders the real renewal DOCX payload from the computed plan change and
 * asserts the visible commercial lines and totals:
 *   P3 €1,800 · Web 4 total / 1 included / 3 billable · 3 × €240 = €720
 *   incremental implementation gross €1,650 · 50% discount €825 · net €825
 *   Year 1 €3,345 · Year 2+ €2,520
 * and proves the included access is never billed twice.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { Packer } from "docx";
import { computePlanChange } from "@/lib/renewal-plan-change";
import type { PlanTransitionRule } from "@/lib/renewal-implementation";
import { buildRenewalProposalDocument, renewalProductIdentity } from "@/lib/proposal-renewal-docx";
import type { RenewalBaseline } from "@/lib/renewal-baseline";
import type { PricingRule } from "@/types/proposal";

function r(
  code: string,
  label: string,
  category: string,
  unit_price: number,
  unit_type: string,
  product_family: string,
): PricingRule {
  return {
    id: `id-${code}`,
    code,
    label,
    category,
    unit_price,
    unit_type,
    currency: "EUR",
    active: true,
    notes: null,
    product_family,
  } as PricingRule;
}

const rules: PricingRule[] = [
  r("plan_1_annual", "ManWinWin Professional - Plan 1 (annual license)", "software", 936, "yearly", "Professional"),
  r("plan_3_annual", "ManWinWin Professional - Plan 3 (annual license)", "software", 1800, "yearly", "Professional"),
  r("web_user", "ManWinWin WEB / Mobility additional access", "addon", 20, "per-user-month", "Professional"),
];

const transitionRules: PlanTransitionRule[] = [
  {
    id: "tr-p1-p3",
    code: "TR_P1_P3_STD",
    label: "Professional 1 → 3 incremental implementation",
    source_family: "Professional",
    target_family: "Professional",
    source_plan: 1,
    target_plan: 3,
    implementation_kind: "standard",
    pricing_mode: "fixed",
    incremental_gross: 1650,
    active: true,
  },
];

/** Isolated APS-equivalent fixture — never real data. */
const baseline: RenewalBaseline = {
  hasRealData: true,
  renewalId: "ren-aps-doc",
  clientId: "cli-aps-doc",
  contractId: "con-aps-doc",
  licenseId: "lic-aps-doc",
  productFamily: "Professional",
  product: "Professional 1",
  variantLabel: "Professional 1",
  variantNeedsReview: false,
  plan: 1,
  hosting: "SaaS",
  version: "7.5",
  backofficeUsers: 1,
  webUsers: 4,
  mobileUsers: 0,
  modules: [],
  plugins: [],
  currency: "EUR",
  currentRecurring: 1656,
  recurringLines: [
    { key: "l1", label: "ManWinWin Professional 1 — annual license", lineType: "license", amount: 696, needsReview: false },
    { key: "l2", label: "ManWinWin WEB — 4 accesses", lineType: "mww_web", amount: 960, needsReview: false },
  ],
  historicalOneTime: 0,
  contractStartDate: "2025-01-01",
  contractEndDate: "2025-12-31",
  renewalDate: "2026-01-01",
  billingFrequency: "Annual",
  unmappedFields: [],
};

const computation = computePlanChange({
  baseline,
  rules,
  mode: "upgrade",
  targetPlan: 3,
  implementationKind: "standard",
  transitionRules,
  implementationDiscount: { type: "percent", value: 50 },
});

const proposal: any = {
  id: "prop-aps-doc",
  version: 1,
  language: "EN",
  client_name: "APS Acceptance Fixture",
  product_family: "Professional",
  plan: 3,
  hosting: "SaaS",
  proposal_date: "2026-01-01",
  notes: null,
};

async function documentXml(): Promise<string> {
  const doc = await buildRenewalProposalDocument({
    proposal,
    items: computation.items,
    baseline,
    proposedRecurring: computation.year2Plus!,
    proposedYear1: computation.year1!,
  });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const xml = await zip.file("word/document.xml")!.async("string");
  // Normalise NBSP so currency assertions are stable.
  return xml.replace(/\u00a0/g, " ");
}

describe("Gate 1 — APS renewal document payload", () => {
  it("computes the acceptance totals before rendering", () => {
    expect(computation.blockers).toEqual([]);
    expect(computation.targetPlanPrice).toBe(1800);
    expect(computation.billableAccessTotal).toBe(720);
    expect(computation.implementationGross).toBe(1650);
    expect(computation.implementationDiscountAmount).toBe(825);
    expect(computation.implementationNet).toBe(825);
    expect(computation.year2Plus).toBe(2520);
    expect(computation.year1).toBe(3345);
  });

  it("carries the entitlement split on the rendered lines", () => {
    const web: any = computation.items.find((i: any) => i.access_type === "web");
    expect(web).toBeTruthy();
    expect(web.total_licensed_qty).toBe(4);
    expect(web.included_qty).toBe(1);
    expect(web.billable_qty).toBe(3);
    expect(web.qty).toBe(3);
    expect(web.unit_price).toBe(240);
    expect(web.net_total).toBe(720);

    // The included access is not billed anywhere else: the license line bills
    // no access quantity, and no other recurring access line exists.
    const license: any = computation.items.find((i: any) => i.line_type === "license");
    expect(license.billable_qty).toBe(0);
    expect(license.net_total).toBe(1800);
    const accessLines = computation.items.filter((i: any) => i.change_kind === "access_addition");
    expect(accessLines).toHaveLength(1);

    // Recurring total equals 1800 + 3×240 exactly — never 4×240.
    const recurring = computation.items
      .filter((i) => i.is_recurring)
      .reduce((s, i) => s + Number(i.net_total ?? i.total), 0);
    expect(recurring).toBe(2520);
    expect(recurring).not.toBe(1800 + 4 * 240);
  });

  it("renders the product identity as a Professional 3 renewal", () => {
    expect(renewalProductIdentity(proposal, baseline)).toContain("SaaS");
    expect(computation.targetPlanLabel).toBe("Professional 3");
  });

  it("prints the visible commercial lines and totals in the document", async () => {
    const xml = await documentXml();

    expect(xml).toContain("Renewal Proposal");
    expect(xml).toContain("Current Contract Baseline");

    // Commercial line labels.
    expect(xml).toContain("Professional 3");
    expect(xml).toContain("Additional Web accesses");
    expect(xml).toContain("Incremental implementation");

    // Amounts.
    expect(xml).toContain("1,800 €"); // target plan license
    expect(xml).toContain("240 €"); // billable web unit price
    expect(xml).toContain("720 €"); // 3 × 240
    expect(xml).toContain("1,650 €"); // implementation gross
    expect(xml).toContain("825 €"); // discount / net
    expect(xml).toContain("3,345 €"); // Year 1
    expect(xml).toContain("2,520 €"); // Year 2+

    // Entitlement table columns.
    expect(xml).toContain("Total licensed");
    expect(xml).toContain("Included");
    expect(xml).toContain("Additional billable");
    expect(xml).toContain("Total licensed capacity is preserved");

    // Financial summary separates one-time from recurring.
    expect(xml).toContain("One-time charges");
    expect(xml).toContain("Proposed Year 1 total");
    expect(xml).toContain("Proposed Year 2+ recurring");
    expect(xml).toContain("one-time, not part of the recurring value");

    // Implementation provenance is printed, never invented.
    expect(xml).toContain("TR_P1_P3_STD");
  });

  it("never prints a 4-access charge (included access not double billed)", async () => {
    const xml = await documentXml();
    expect(xml).not.toContain("960 €"); // 4 × 240 would be the double-billed figure
    expect(xml).not.toContain("3,240 €"); // 1800 + 4×240 recurring
    expect(xml).not.toContain("4,065 €"); // that recurring + implementation net
  });
});
