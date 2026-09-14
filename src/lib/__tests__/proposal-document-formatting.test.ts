import { describe, expect, it } from "vitest";
import { buildProposalPrintHtml } from "@/lib/proposal-print";
import { proposalDocumentTitle, proposalFileName, proposalTermLines } from "@/lib/proposal-document-control";
import type { Proposal, ProposalItem } from "@/types/proposal";

const proposal = {
  id: "p1",
  lead_id: "l1",
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
    expect(html).toContain("McGills Chemical Corporation · v2");
    expect(html).toContain("<li>50% on award</li><li>50% after installation</li>");
  });
});
describe("proposal print pagination guards", () => {
  it("keeps the footer in flow and reserves a print-safe bottom margin", () => {
    const html = buildProposalPrintHtml(proposal, items);
    expect(html).toContain("margin: 17mm 16mm 18mm");
    expect(html).not.toMatch(/\.footer \{[^}]*position:\s*fixed/);
    expect(html).toContain("print-color-adjust: exact");
    expect((html.match(/page-break-after:always/g) || []).length).toBe(1);
  });
});
