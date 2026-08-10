import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { Packer } from "docx";
import {
  buildRenewalProposalDocument,
  renewalProductIdentity,
} from "@/lib/proposal-renewal-docx";
import {
  buildRenewalBaseline,
  buildBaselineProposalItems,
  baselineLicenseModel,
} from "@/lib/renewal-baseline";

const baseline = buildRenewalBaseline({
  renewal: {
    id: "33000000-0000-4000-a000-000000000002",
    client_id: "c1000000-0000-0000-0000-000000000005",
    contract_id: "22000000-0000-4000-a000-000000000004",
    renewal_date: "2026-04-20",
    estimated_value: 39600,
  },
  client: {
    commercial_name: "Petrobras Facilities Ltda",
    current_version: "8.2",
    cloud_onpremise: "Cloud",
    product_type: "ManWinWin Business",
  },
  contract: { contract_start_date: "2023-04-20", contract_end_date: "2026-04-20", currency: "EUR" },
  contractLines: [
    { id: "l1", line_type: "license", description: "Core license", amount: 28000, currency: "EUR" },
    { id: "l2", line_type: "hosting", description: "Hosting", amount: 4200, currency: "EUR" },
    { id: "l3", line_type: "mww_web", description: "ManWinWin Web", amount: 1800, currency: "EUR" },
    { id: "l4", line_type: "sat", description: "S&AT", amount: 5600, currency: "EUR" },
  ],
  license: {
    product: "ManWinWin Business",
    license_model: "UseIT",
    version: "8.2",
    backoffice_users: 25,
    web_accesses: 40,
    periodicity: "Annual",
    currency: "EUR",
  },
  licensedModules: [],
});

const proposal: any = {
  id: "03faf60d-34ea-48e1-8c09-0d36c7fe18bc",
  version: 1,
  language: "EN",
  client_name: "Petrobras Facilities Ltda",
  product_family: "Business",
  license_model: "useit",
  hosting: "SaaS",
  proposal_date: "2026-08-10",
  notes: null,
};

async function docText(): Promise<string> {
  const items = buildBaselineProposalItems(baseline);
  const doc = await buildRenewalProposalDocument({
    proposal,
    items,
    baseline,
    proposedRecurring: items.reduce((s, i) => s + (i.is_recurring ? i.total : 0), 0),
    proposedYear1: items.reduce((s, i) => s + i.total, 0),
  });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  return await zip.file("word/document.xml")!.async("string");
}

describe("renewal proposal document — Business identity preserved", () => {
  it("keeps the Business UseIT variant from the real contract", () => {
    expect(baseline.productFamily).toBe("Business");
    expect(baselineLicenseModel(baseline)).toBe("useit");
    expect(renewalProductIdentity(proposal, baseline)).toBe("Business UseIT · SaaS");
  });

  it("is unambiguously a renewal document, never a Professional proposal", async () => {
    const xml = await docText();
    expect(xml).toContain("Renewal Proposal");
    expect(xml).toContain("Current Contract Baseline");
    expect(xml).toContain("Business UseIT");
    expect(xml).not.toContain("Professional");
  });

  it("contains the four real recurring lines and the €39,600 totals", async () => {
    const xml = await docText();
    for (const label of ["Core license", "Hosting", "ManWinWin Web", "S&amp;AT"]) {
      expect(xml).toContain(label);
    }
    const flat = xml.replace(/\u00a0/g, " ");
    expect(flat).toContain("39 600,00"); // current + proposed recurring
    expect(xml).toContain("Proposed Year 1 total");
    expect(xml).toContain("Proposed Year 2+ recurring");
    expect(xml).toContain("One-time charges");
    // No implementation service was invented.
    expect(xml.toLowerCase()).not.toContain("implementation");
  });

  it("reports a straight renewal when nothing changed", async () => {
    const xml = await docText();
    expect(xml).toContain("Straight renewal");
  });
});
