import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  buildLeadNotes,
  canCreateLead,
  canTransition,
  matchDuplicates,
  missingResearchItems,
  normaliseCompanyName,
  normaliseDomain,
  priorityBand,
  priorityTotal,
  readinessWarnings,
  researchCompleteness,
} from "@/lib/prospecting";

describe("priority scoring", () => {
  it("sums the four dimensions out of 12", () => {
    expect(priorityTotal({ fit_score: 3, complexity_score: 2, signal_score: 3, access_score: 1 })).toBe(9);
  });

  it("clamps out-of-range and missing values", () => {
    expect(priorityTotal({ fit_score: 9, complexity_score: -4, signal_score: null })).toBe(3);
    expect(priorityTotal({})).toBe(0);
  });

  it("maps totals to bands", () => {
    expect(priorityBand(12)).toBe("High");
    expect(priorityBand(9)).toBe("High");
    expect(priorityBand(8)).toBe("Medium");
    expect(priorityBand(6)).toBe("Medium");
    expect(priorityBand(5)).toBe("Low");
    expect(priorityBand(0)).toBe("Low");
  });
});

describe("research completeness", () => {
  const full = {
    country: "Portugal",
    industry: "Manufacturing",
    fit_indicators: ["asset_intensive"],
    fit_score: 2,
    maintenance_hypothesis: "Likely reactive maintenance across three sites",
    key_research_gap: "Who owns maintenance budget",
    evidenceCount: 2,
    signalCount: 1,
    peopleWithRoleCount: 1,
  };

  it("is 100% when all eight checks pass", () => {
    expect(researchCompleteness(full)).toBe(100);
    expect(missingResearchItems(full)).toEqual([]);
  });

  it("is 0% for an empty account", () => {
    expect(researchCompleteness({})).toBe(0);
    expect(missingResearchItems({})).toHaveLength(8);
  });

  it("drops proportionally per missing check", () => {
    expect(researchCompleteness({ ...full, evidenceCount: 0, signalCount: 0 })).toBe(75);
  });

  it("warns but never blocks readiness", () => {
    expect(readinessWarnings(full)).toEqual([]);
    expect(readinessWarnings({ ...full, evidenceCount: 0 })).toContain("No evidence recorded");
  });
});

describe("lifecycle transitions", () => {
  it("allows the approved paths only", () => {
    expect(canTransition("Researching", "Ready for Outreach")).toBe(true);
    expect(canTransition("Researching", "Deprioritised")).toBe(true);
    expect(canTransition("Ready for Outreach", "Converted")).toBe(true);
    expect(canTransition("Deprioritised", "Researching")).toBe(true);
  });

  it("never converts directly from Researching", () => {
    expect(canTransition("Researching", "Converted")).toBe(false);
  });

  it("treats Converted as terminal", () => {
    expect(allowedTransitions("Converted")).toEqual([]);
  });
});

describe("lead conversion gate", () => {
  const contact = { full_name: "Ana Silva", email: "ana@example.com", phone: null };

  it("requires Ready for Outreach", () => {
    expect(canCreateLead({ status: "Researching", primaryContact: contact }).ok).toBe(false);
  });

  it("requires a primary contact with a channel", () => {
    expect(canCreateLead({ status: "Ready for Outreach", primaryContact: null }).ok).toBe(false);
    expect(
      canCreateLead({
        status: "Ready for Outreach",
        primaryContact: { full_name: "Ana", email: null, phone: null },
      }).ok
    ).toBe(false);
  });

  it("passes with a reachable primary contact", () => {
    expect(canCreateLead({ status: "Ready for Outreach", primaryContact: contact }).ok).toBe(true);
  });

  it("keeps hypothesis and evidence distinguishable in the lead notes", () => {
    const notes = buildLeadNotes({
      maintenance_hypothesis: "Probably reactive maintenance",
      key_research_gap: "Team size",
      evidence: [{ fact: "Opened a second plant", source: "Press release" }],
      signals: [{ signal_type: "expansion_new_site", description: "New plant" }],
    });
    expect(notes).toContain("Maintenance hypothesis: Probably reactive maintenance");
    expect(notes).toContain("Evidence:");
    expect(notes).toContain("Opened a second plant");
    expect(notes).toContain("Expansion / new site");
  });
});

describe("company identity", () => {
  it("normalises websites into comparable domains", () => {
    expect(normaliseDomain("https://www.Example.com/about?x=1")).toBe("example.com");
    expect(normaliseDomain("example.pt")).toBe("example.pt");
    expect(normaliseDomain("not a url")).toBe("");
    expect(normaliseDomain(null)).toBe("");
  });

  it("strips legal suffixes for name matching only", () => {
    expect(normaliseCompanyName("ManWinWin Software, Lda.")).toBe("manwinwin software");
    expect(normaliseCompanyName("Açores Metal Group")).toBe("acores metal");

  });

  it("matches duplicates on domain first, then name", () => {
    const matches = matchDuplicates(
      { company_name: "Example Ltd", website_domain: "example.com" },
      [
        { entity: "Client", id: "1", name: "Totally Different", route: "/clients/1", domain: "https://example.com" },
        { entity: "Lead", id: "2", name: "example", route: "/incoming-leads/2", domain: null },
        { entity: "Opportunity", id: "3", name: "Unrelated", route: "/deals/3", domain: "other.com" },
      ]
    );
    expect(matches).toHaveLength(2);
    expect(matches[0].matchedOn).toBe("domain");
    expect(matches[1].matchedOn).toBe("name");
  });
});
