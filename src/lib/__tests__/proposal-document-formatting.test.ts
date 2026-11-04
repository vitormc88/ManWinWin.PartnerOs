import { beforeEach, afterEach } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { buildProposalPrintHtml } from "@/lib/proposal-print";
import { generateProposalDocx } from "@/lib/proposal-docx";
import JSZip from "jszip";
import { proposalDocumentTitle, proposalFileName, proposalTermLines } from "@/lib/proposal-document-control";
import type { Proposal, ProposalItem } from "@/types/proposal";
import { formatEuro } from "@/lib/proposal-i18n";

const proposal = {
  id: "p1",
  lead_id: "l1",
  source_type: "deal",
  deal_id: "l1",
  renewal_id: null,
  client_id: null,
  partner_uuid: null,
  parent_proposal_id: null,
  version: 2,
  language: "EN",
  plan: 1,
  status: "Draft",
  hosting: "SaaS",
  client_name: "McGills Chemical Corporation",
  project_name: "Maintenance Software Implementation Across Operations",
  country: "Canada",
  proposal_date: "2026-09-14",
  validity_days: 30,
  payment_terms: "50% on award • 50% after installation",
  notes: null,
  implementation_type: "Online",
  service_days: null,
  service_hours: 12,
  backoffice_work_hours: 2,
  per_diem: 0,
  discount_pct: 0,
  discount_scope: "none",
  include_requests_module: false,
  web_users: 1,
  software_subtotal: 1000,
  services_subtotal: 500,
  discount_amount: 0,
  total_year_1: 1500,
  total_recurring: 1000,
  docx_url: null,
  pdf_url: null,
  generated_at: null,
  created_by: null,
  created_at: "2026-09-14",
  updated_at: "2026-09-14",
} satisfies Proposal;

const items: ProposalItem[] = [
  { category: "software", item_code: "P1", item_name: "Plan 1", description: null, qty: 1, unit_price: 1000, frequency: "yearly", total: 1000, is_override: false, is_recurring: true, sort_order: 1 },
  { category: "service", item_code: "I1", item_name: "Implementation", description: null, qty: 1, unit_price: 500, frequency: "one-time", total: 500, is_override: false, is_recurring: false, sort_order: 2 },
];

describe("proposal document control", () => {
  it("identifies a new Portuguese proposal export as an unsaved preview", () => {
    const html = buildProposalPrintHtml({ ...proposal, id: "", version: 0, language: "PT", notes: "Condições em edição" }, items);
    const dom = new DOMParser().parseFromString(html, "text/html");
    for (const selector of ["title", ".cover", ".brand-header", ".brand-footer"]) {
      expect(dom.querySelector(selector)?.textContent).toContain("Pré-visualização não guardada");
    }
    expect(dom.querySelector("main")?.textContent).toContain("Condições em edição");
  });
  it("uses the same commercial reference in title, filename, cover and footer",()=>{
    const p={...proposal,commercial_reference:"MWW-2026-0123",commercial_revision:2,commercial_root_id:"root",version:19};
    expect(proposalDocumentTitle(p)).toContain("MWW-2026-0123 · Rev. 02");
    expect(proposalFileName(p)).toBe("MWW-2026-0123_Proposal_McGills_Chemical_Corporation_Rev_02.docx");
    const dom=new DOMParser().parseFromString(buildProposalPrintHtml(p,items),"text/html");
    expect(dom.querySelector(".brand-header")?.textContent).toContain("MWW-2026-0123 · Rev. 02");
    expect(dom.querySelector(".brand-footer")?.textContent).toContain("MWW-2026-0123 · Rev. 02");
    expect(dom.querySelector(".cover")?.textContent).toContain("Rev. 02");
    expect(dom.body.textContent).not.toContain("v19");
  });
  it("retains cents and places the licensed scope before prices",()=>{
    expect(formatEuro(24437.25,"EN")).toBe("24,437.25 €");
    expect(formatEuro(3523.65,"PT")).toContain("3523,65");
    const html=buildProposalPrintHtml(proposal,[...items,{...items[1],description:"15 standard hours",unit_price:1890,total:1890}]);
    const main=new DOMParser().parseFromString(html,"text/html").querySelector("main")!;
    expect(main.innerHTML.indexOf('class="includes"')).toBeLessThan(main.innerHTML.indexOf('class="year-bar"'));
    expect(main.textContent).toContain("15 hours of implementation");
  });
  it("keeps filename, title, client and version aligned", () => {
    expect(proposalFileName(proposal)).toBe("Proposal_McGills_Chemical_Corporation_v2.docx");
    expect(proposalDocumentTitle(proposal)).toBe("Investment Proposal — McGills Chemical Corporation — v2");
  });

  it("preserves terms while structuring bullet-separated text", () => {
    expect(proposalTermLines(proposal.payment_terms)).toEqual(["50% on award", "50% after installation"]);
  });

  it("includes repeat headers, row guards, long-name wrapping and institutional footer", () => {
    const html = buildProposalPrintHtml(proposal, items);
    expect(html).toContain("display: table-header-group");
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain("support@manwinwin.com");
    expect(html).toContain("www.manwinwin.com");
    expect(html).toContain("MWW-P1 · r1 · v2");
    expect(html).toContain('<p class="terms-label">ManWinWin standard terms and conditions:</p>');
    expect(html).toContain("<li>50% on award</li><li>50% after installation</li>");
  });

  it("uses the unified branded cover and keeps the logo in the inner header", () => {
    const html = buildProposalPrintHtml(proposal, items);
    expect(html).toContain('class="cover-rule"');
    expect(html).toContain('class="brand-header"');
    expect(html).toContain("ManWinWin Professional · 1 · SaaS");
  });

  it("keeps the Word renewal block in a non-splitting container", async () => {
    const blob = await generateProposalDocx(proposal, items);
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("<w:cantSplit/>");
    expect(xml).not.toContain("<w:pageBreakBefore/>");
  });
});
describe("proposal print pagination guards", () => {
  it("keeps the footer in flow and reserves a print-safe bottom margin", () => {
    const html = buildProposalPrintHtml(proposal, items);
    expect(html).toContain("margin:31mm 14mm 27mm");
    expect(html).toContain(".brand-footer{position:fixed");
    expect(html).toContain("print-color-adjust:exact");
    expect((html.match(/page-break-after:always/g) || []).length).toBe(1);
  });

  it("keeps the Year 2 heading, table and total in one printable block", () => {
    const html = buildProposalPrintHtml(proposal, items);
    expect(html).toContain('class="renewal-section"');
    expect(html).toContain(".renewal-section{break-inside:auto");
  });
});

// Document branding is a required asset, isolated from network in regression fixtures.
beforeEach(()=>vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})));
afterEach(()=>vi.unstubAllGlobals());
