import { describe, expect, it, vi } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";
import { generateAdditionDocx } from "@/lib/commercial-addition-docx";
import { ADDITION_PRODUCTS, additionBaselineFromSnapshot, additionMonths, calculateAddition, canonicalAdditionProduct, initialAdditionSelection, type AdditionBaseline, type AdditionSelection } from "../commercial-additions";
import { buildAdditionPrintHtml, additionDocumentContent } from "../commercial-addition-documents";
import type { PricingRule } from "@/types/proposal";

export const additionTestBaseline: AdditionBaseline = {
  clientId: "11111111-1111-4111-8111-111111111111", clientName: "Synthetic customer", partnerId: null,
  licenseId: "22222222-2222-4222-8222-222222222222", contractId: "33333333-3333-4333-8333-333333333333",
  family: "Business", model: "useit", plan: null, deployment: "saas", backoffice: 10, web: 11, owned: [],
  renewalDate: "2028-04-14", priceTable: "2023", recordedAnnual: 14031, satActive: true,
};
const r = (code: string, amount: number, unit_type = "yearly", support_percentage: number | null = null): PricingRule => ({ id: code, code, label: code, unit_price: amount, unit_type, support_percentage, currency: "EUR", active: true, category: "business", notes: null });
export const additionTestRules = [
  r("BUS_KEEPIT_ADDITIONAL_BACKOFFICE", 950, "one-time"), r("BUS_USEIT_ADDITIONAL_BACKOFFICE", 352),
  r("BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE", 10, "per-user-month"), r("BUS_KEEPIT_SAT", 0, "yearly", 17),
  r("BUS_USEIT_FACTOR", 0, "percentage", 37), r("BUS_WEB_MOBILE_USER", 20, "per-user-month"), r("BUS_API", 600),
  r("web_user", 20, "per-user-month"), r("requests_module", 600),
  ...ADDITION_PRODUCTS.filter(p => p.id !== "api").flatMap(p => [r(`BUS_KEEPIT_${p.suffix}`, 1750, "one-time"), r(`BUS_USEIT_${p.suffix}`, 648)]),
];
export const additionTestSelection: AdditionSelection = {
  ...initialAdditionSelection(additionTestBaseline, "2026-10-29"), backoffice: 1,
  monthPolicy: "started", pricingBasis: "direct", priceReview: "Current catalogue explicitly approved for this synthetic case",
  offerBasis: "customer", implementationReview: "not_needed",
};
const calculate = (patch: Partial<AdditionSelection> = {}, baseline: Partial<AdditionBaseline> = {}, rules = additionTestRules) => calculateAddition({ ...additionTestBaseline, ...baseline }, { ...additionTestSelection, ...patch }, rules);

describe("Mid-cycle additions — incremental commercial calculations", () => {
  it("quotes Barcino-shaped UseIT additions without repricing the installed license", () => {
    const q = calculate();
    expect(q.blockers).toEqual([]);
    expect(q.months).toBe(18);
    expect(q.dueNow).toBe(708);
    expect(q.annualIncrease).toBe(472);
    expect(q.lines.map(l => l.kind)).toEqual(["license", "hosting"]);
    expect(q.afterBackoffice).toBe(11);
    expect(q.afterWeb).toBe(11);
    expect(q.renewalAnnual).toBeNull();
    expect(q.supportNote).toContain("included");
    expect(calculate({ baselineAnnualConfirmed: true }).renewalAnnual).toBe(14503);
  });
  it("requires explicit price basis and retains the actual €0.50 catalogue/derivation difference", () => {
    expect(calculate({ pricingBasis: "derived" }).annualIncrease).toBe(471.5);
    expect(calculate({ pricingBasis: "derived" }).dueNow).toBe(707.25);
    expect(calculate({ pricingBasis: "" }).blockers.join()).toContain("pricing decision");
    expect(calculate({ priceReview: "" }).blockers.join()).toContain("pricing decision");
  });
  it("KeepIT charges the full perpetual delta once and prorates incremental S&AT + hosting only", () => {
    const q = calculate({}, { model: "keepit" });
    expect(q.annualIncrease).toBe(281.5);
    expect(q.dueNow).toBe(1372.25);
    expect(q.lines.map(l => l.oneTime)).toEqual([950, 0, 0]);
    expect(q.lines.find(l => l.kind === "sat")?.annual).toBe(161.5);
    expect(calculate({}, { model: "keepit", deployment: "on_premise" }).annualIncrease).toBe(161.5);
  });
  it.each(ADDITION_PRODUCTS)("prices selected $id and its actual S&AT impact, not a note or full implementation", p => {
    const q = calculate({ backoffice: 0, products: [p.id] });
    expect(q.blockers).toEqual([]);
    expect(q.lines).toHaveLength(1);
    expect(q.annualIncrease).toBe(p.id === "api" ? 600 : 648);
    expect(q.lines.every(l => l.oneTime === 0)).toBe(true);
    const k = calculate({ backoffice: 0, products: [p.id] }, { model: "keepit" });
    expect(k.lines.some(l => l.kind === "sat")).toBe(p.id !== "api");
  });
  it("adds WEB quantities only and supports Professional without changing the installed plan", () => {
    const q = calculate({ backoffice: 0, web: 2 }, { family: "Professional", model: null, plan: 2 });
    expect(q.blockers).toEqual([]);
    expect(q.lines).toHaveLength(1);
    expect(q.dueNow).toBe(720);
    expect(q.annualIncrease).toBe(480);
    expect(q.afterWeb).toBe(13);
    expect(calculate({ backoffice: 0, products: ["requests"] }, { family: "Professional", model: null, plan: 1 }).annualIncrease).toBe(600);
  });
  it("blocks unsupported Professional BO, modules/plugins and already-owned API/modules", () => {
    expect(calculate({}, { family: "Professional", model: null, plan: 1 }).blockers.join()).toContain("license upgrade");
    expect(calculate({ backoffice: 0, products: ["stock", "api"] }, { family: "Professional", model: null, plan: 1 }).blockers.join()).toContain("license upgrade");
    expect(calculate({ backoffice: 0, products: ["api"] }, { owned: ["api"] }).blockers.join()).toContain("already licensed");
    expect(calculate({ backoffice: 0, products: ["stock", "stock"] }).blockers.join()).toContain("Duplicate");
  });
  it("does not infer a partner split and applies explicit splits to the correct component", () => {
    expect(calculate({ offerBasis: "partner" }).blockers.join()).toContain("shares");
    const q = calculate({ offerBasis: "partner", licenseShare: 60, hostingShare: 100 });
    expect(q.blockers).toEqual([]);
    expect(q.annualIncrease).toBe(331.2);
    expect(q.dueNow).toBe(496.8);
  });
  it.each([0, -20, NaN, Infinity])("fails closed on invalid catalogue price %s", amount => {
    const rules = additionTestRules.map(r => r.code === "BUS_USEIT_ADDITIONAL_BACKOFFICE" ? { ...r, unit_price: amount } : r);
    expect(calculate({}, {}, rules).blockers.join()).toContain("catalogue rule");
  });
  it("blocks missing currency/identity/dates, fractional users, unreviewed services and unconfirmed KeepIT support", () => {
    expect(calculate({ backoffice: 1.5 }).blockers.join()).toContain("whole");
    expect(calculate({ implementationReview: "" }).blockers.join()).toContain("implementation");
    expect(calculate({}, { model: null }).blockers.join()).toContain("identity");
    expect(calculate({}, { licenseId: null }).blockers.join()).toContain("linked");
    expect(calculate({}, { model: "keepit", satActive: null }).blockers.join()).toContain("S&AT arrangement");
    expect(calculate({ renewalDate: "2027-04-14" }).blockers.join()).toContain("match the source");
    expect(calculate({}, {}, additionTestRules.filter(r => r.code !== "BUS_USEIT_ADDITIONAL_BACKOFFICE")).blockers.join()).toContain("catalogue rule");
  });
});
describe("Explicit proration and source normalization", () => {
  it("reads the actual legacy LIC shape as Business UseIT SaaS, rather than generic Professional", () => {
    const b = additionBaselineFromSnapshot({ clientId: "qa", clientName: "Synthetic legacy customer", licenseFamily: "Professional", licenseVariant: null, deployment: "Cloud/SaaS", backofficeUsers: 10, webUsers: 11, license: { id: "l", product: "ManWinWin", edition: "Professional", license_model: "USE-IT", deployment_type: "Cloud/SaaS" }, contract: { id: "c" } });
    expect(b.family).toBe("Business"); expect(b.model).toBe("useit"); expect(b.deployment).toBe("saas"); expect(b.backoffice).toBe(10);
  });
  it("renders the actual Word with the same delta, annual increase, terms and notes as PDF", async () => {
    let bytes: Buffer | undefined;
    const spy = vi.spyOn(Packer, "toBlob").mockImplementation(async document => { bytes = await Packer.toBuffer(document); return new Blob(); });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    try {
      await generateAdditionDocx({ payment_terms: "Payment on activation", notes: "Special addition condition" }, { schema: "commercial_addition_v1", action: "add_users", baseline: additionTestBaseline, selection: additionTestSelection, rules: additionTestRules, quote: calculate() });
      const zip = await JSZip.loadAsync(bytes!);
      const xml = await zip.file("word/document.xml")!.async("string");
      const text = new DOMParser().parseFromString(xml, "application/xml").documentElement.textContent || "";
      expect(text).toContain("€708.00"); expect(text).toContain("€472.00");
      expect(text).toContain("Payment on activation"); expect(text).toContain("Special addition condition");
      expect(text).toContain("not confirmed"); expect(text).not.toContain("RCI Business");
    } finally { spy.mockRestore(); vi.unstubAllGlobals(); }
  });
  it.each([
    ["2026-10-29", "2028-04-14", "complete", 17], ["2026-10-29", "2028-04-14", "started", 18],
    ["2026-01-31", "2026-02-28", "complete", 1], ["2028-01-31", "2028-02-29", "complete", 1],
    ["2026-04-14", "2028-04-14", "started", 24],
  ] as const)("%s to %s with %s = %s months", (a, b, p, result) => expect(additionMonths(a, b, p, null)).toBe(result));
  it("never assumes a partial-month convention or accepts an invalid/expired date", () => {
    expect(additionMonths("2026-10-29", "2028-04-14", "", null)).toBeNull();
    expect(additionMonths("2026-02-30", "2028-04-14", "started", null)).toBeNull();
    expect(additionMonths("2026-10-29", "2026-10-29", "started", null)).toBeNull();
    expect(calculate({ monthPolicy: "agreed", agreedMonths: 17.5, monthReview: "" }).blockers.join()).toContain("Explain");
  });
  it("normalizes the source identity and aliases; API is not sold twice", () => {
    const baseline = additionBaselineFromSnapshot({ clientId: "c", licenseFamily: "Business", licenseVariant: "USE-IT", deployment: "SaaS", backofficeUsers: 10, webUsers: 11, apiAccess: true,
      license: { id: "l" }, contract: { id: "k", price_table_reference: "2023" }, modules: [{ module_name: "Maintenance Requests Module" }], plugins: [{ plugin_name: "Workflow Email Notifications" }] });
    expect(baseline.model).toBe("useit");
    expect(baseline.owned).toEqual(expect.arrayContaining(["requests", "workflow", "api"]));
    expect(canonicalAdditionProduct("Stock Management Module")).toBe("stock");
    expect(canonicalAdditionProduct("BUS_KEEPIT_PLUGIN_SLA")).toBe("sla");
    expect(additionBaselineFromSnapshot({ licenseFamily: "Professional", licenseVariant: "III" }).plan).toBe(3);
    expect(additionBaselineFromSnapshot({ licenseFamily: "Professional", licenseVariant: "II" }).owned).toContain("stock");
    expect(calculate({}, { currency: "USD" }).blockers.join()).toContain("EUR contracts");
    expect(calculate({}, {}, additionTestRules.map(r => r.code === "BUS_USEIT_ADDITIONAL_BACKOFFICE" ? { ...r, unit_type: "one-time" } : r)).blockers.join()).toContain("catalogue rule");
  });
  it("carries exact incremental content into print without claiming an unreviewed renewal total", () => {
    const quote = calculate();
    const draft = { schema: "commercial_addition_v1" as const, action: "add_users" as const, baseline: additionTestBaseline, selection: additionTestSelection, rules: additionTestRules, quote };
    const content = additionDocumentContent({ client_name: "<Customer>", payment_terms: "30 days" }, draft);
    expect(content.summary.join()).toContain("€708.00");
    expect(content.summary.join()).toContain("€472.00");
    expect(content.summary.join()).toContain("not confirmed");
    const html = buildAdditionPrintHtml({ client_name: "<Customer>", payment_terms: "30 days" }, draft);
    expect(html).toContain("&lt;Customer&gt;");
    expect(html).not.toContain("RCI Business");
    expect(() => buildAdditionPrintHtml({}, { ...draft, quote: { ...quote, blockers: ["Unreviewed"] } })).toThrow("blockers");
  });
});
