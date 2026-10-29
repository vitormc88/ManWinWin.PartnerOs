import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Packer } from "docx";
import { inflateRawSync } from "node:zlib";
import { BusinessPreviewStep } from "@/components/proposals/BusinessSteps";
import { buildBusinessProposalPrintHtml, printBusinessProposal } from "@/lib/proposal-business-print";
import { generateBusinessProposalDocx } from "@/lib/proposal-business-docx";
import { buildBusinessDocumentSnapshot, businessDocumentMatchesSaved } from "@/lib/proposal-business-snapshot";
import { tBusiness } from "@/lib/proposal-business-i18n";
import type { BusinessConfig } from "@/lib/proposal-business-engine";
import type { PricingRule, Proposal, ProposalMode } from "@/types/proposal";

const rule = (code: string, unit_price: number, extra: Partial<PricingRule> = {}): PricingRule => ({
  id: code, code, label: code, category: "business", unit_price, unit_type: "one-time",
  currency: "EUR", active: true, notes: null, ...extra,
});
const rules = [
  rule("BUS_KEEPIT_MAINTENANCE_MODULE", 15450),
  rule("BUS_WEB_MOBILE_USER", 20, { unit_type: "per-user-month" }),
  rule("BUS_KEEPIT_SAT", 0, { support_percentage: 17, unit_type: "yearly" }),
  rule("BUS_USEIT_SAT", 0, { unit_type: "yearly" }),
];
const cfg: BusinessConfig = {
  includeRequests: false, includeStock: false, includePurchase: false,
  pluginImport: false, pluginWorkflow: false, pluginAdvancedReports: false, pluginSLA: false,
  api: false, additionalBackoffice: 0, additionalWebUsers: 0, deployment: "on_premise",
  implementation: { type: "Custom", liveSessions: 0, customServices: [] },
  discounts: { softwarePct: 0, webUsersPct: 0, webUsersRenews: false, apiPct: 0, servicesPct: 0 },
};
const saved = {
  id: "diagnostic-only", client_name: "Synthetic diagnostic customer", product_family: "Business",
  proposal_mode: "compare_keepit_useit", language: "EN", deployment: "on_premise",
  proposal_date: "2026-10-29", payment_terms: "30 days", notes: null,
  version: 1, status: "Ready", validity_days: 60,
} as Proposal;
const labels = tBusiness("EN");
const headings = (html: string) => Array.from(
  new DOMParser().parseFromString(html, "text/html").querySelectorAll("h3"),
  (element) => element.textContent,
);

const state = (mode: ProposalMode) => ({
  language: "EN" as const, client_name: saved.client_name, project_name: null, country: null,
  proposal_date: saved.proposal_date, validity_days: 60, payment_terms: "30 days", notes: null,
  proposal_mode: mode, business_config: cfg,
});

describe("Business proposal current document snapshot", () => {
  it.each([
    ["compare_keepit_useit", true, true],
    ["keepit_only", true, false],
    ["useit_only", false, true],
  ] as const)("print renderer respects persisted mode %s", (mode, keepit, useit) => {
    const html = buildBusinessProposalPrintHtml({ proposal: { ...saved, proposal_mode: mode }, cfg, rules });
    expect(headings(html).includes(labels.optionAKeepIT)).toBe(keepit);
    expect(headings(html).includes(labels.optionBUseIT)).toBe(useit);
  });

  it("keeps the PDF aligned with UseIT-only preview even when saved mode is Compare", () => {
    const selectedMode: ProposalMode = "useit_only";
    const preview = renderToStaticMarkup(<BusinessPreviewStep rules={rules} config={cfg} language="EN" proposalMode={selectedMode} onChange={() => {}} />);
    expect(preview).toContain("Mode: UseIT only");
    expect(preview).toContain("UseIT (annual license)");
    expect(preview).not.toContain("KeepIT (lifetime license)");
    const input = buildBusinessDocumentSnapshot(saved, state(selectedMode), rules);
    expect(input.proposal_mode).toBe("useit_only");
    expect(input.license_model).toBe("useit");
    const html = buildBusinessProposalPrintHtml({ proposal: input, cfg, rules });
    expect(headings(html)).not.toContain(labels.optionAKeepIT);
    expect(headings(html)).toContain(labels.optionBUseIT);
    expect(saved.proposal_mode).toBe("compare_keepit_useit");
    expect(saved.status).toBe("Ready");
    expect(businessDocumentMatchesSaved(saved, input)).toBe(false);
  });

  const modes: ProposalMode[] = ["compare_keepit_useit", "keepit_only", "useit_only"];
  it.each(modes.flatMap(from => modes.map(to => ({ from, to }))))("regenerates $from -> $to using only the current selection", ({ from, to }) => {
    const before = buildBusinessDocumentSnapshot(saved, state(from), rules);
    const next = buildBusinessDocumentSnapshot(before, state(to), rules);
    const html = buildBusinessProposalPrintHtml({ proposal: next, cfg, rules });
    expect(headings(html).includes(labels.optionAKeepIT)).toBe(to !== "useit_only");
    expect(headings(html).includes(labels.optionBUseIT)).toBe(to !== "keepit_only");
    expect(next.license_model).toBe(to === "compare_keepit_useit" ? null : to === "keepit_only" ? "keepit" : "useit");
    expect(businessDocumentMatchesSaved(before, next)).toBe(from === to);
    expect(before.proposal_mode).toBe(from);
    expect(before.status).toBe("Ready");
  });

  it("snapshots changed metadata, configuration and totals without modifying the saved proposal", () => {
    const before = buildBusinessDocumentSnapshot(saved, state("keepit_only"), rules);
    const changed = { ...state("useit_only"), language: "PT" as const, client_name: "Current name", payment_terms: "60 days", notes: "Current note", business_config: { ...cfg, additionalWebUsers: 3 } };
    const next = buildBusinessDocumentSnapshot(before, changed, rules);
    expect(next).toMatchObject({ client_name: "Current name", language: "PT", payment_terms: "60 days", notes: "Current note", web_users: 3 });
    expect(next.total_recurring).not.toBe(before.total_recurring);
    expect(businessDocumentMatchesSaved(before, next)).toBe(false);
    expect(before.client_name).toBe(saved.client_name);
    expect(before.business_config.additionalWebUsers).toBe(0);
  });

  it.each(modes)("renders the actual Word document for current mode %s", async (mode) => {
    let zip: Buffer | undefined;
    const spy = vi.spyOn(Packer, "toBlob").mockImplementation(async document => {
      zip = await Packer.toBuffer(document);
      return new Blob();
    });
    try {
      const proposal = buildBusinessDocumentSnapshot(saved, state(mode), rules);
      await generateBusinessProposalDocx({ proposal, cfg, rules });
      let xml = "";
      for (let offset = 0; zip && offset < zip.length - 46; offset++) {
        if (zip.readUInt32LE(offset) !== 0x02014b50) continue;
        const nameLength = zip.readUInt16LE(offset + 28);
        if (zip.toString("utf8", offset + 46, offset + 46 + nameLength) !== "word/document.xml") continue;
        const local = zip.readUInt32LE(offset + 42);
        const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
        const bytes = zip.subarray(start, start + zip.readUInt32LE(offset + 20));
        xml = (zip.readUInt16LE(offset + 10) === 8 ? inflateRawSync(bytes) : bytes).toString("utf8");
        break;
      }
      const text = new DOMParser().parseFromString(xml, "application/xml").documentElement.textContent || "";
      expect(text.includes(labels.optionAKeepIT)).toBe(mode !== "useit_only");
      expect(text.includes(labels.optionBUseIT)).toBe(mode !== "keepit_only");
    } finally { spy.mockRestore(); }
  });

  it("uses a synchronously reserved print window instead of opening another popup", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const target = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() } };
    try {
      printBusinessProposal({ proposal: saved, cfg, rules }, target as unknown as Window);
      expect(open).not.toHaveBeenCalled();
      expect(target.document.write).toHaveBeenCalledWith(expect.stringContaining("Commercial Licensing Options"));
      expect(() => printBusinessProposal({ proposal: saved, cfg, rules })).toThrow("Allow pop-ups");
    } finally { open.mockRestore(); }
  });
});
