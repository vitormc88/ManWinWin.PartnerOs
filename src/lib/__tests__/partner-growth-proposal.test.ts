import { describe, expect, it } from "vitest";
import { buildStrategicProposalSnapshot, getProposalReadiness } from "@/lib/partner-growth-proposal";
import type { PartnerProspect } from "@/hooks/usePartnerGrowth";
import type { ResearchSource } from "@/hooks/usePartnerQualification";
const partner = {
  id: "demo",company_name:"Atlas Maintenance Solutions",country:"MY",recruitment_stage:"Engaged",
  proposed_partner_type:"CMSC",description:"Joint prospecting for maintenance teams",
  fit_summary:"Access to relevant asset-intensive companies",interest_evidence:"Discovery meeting requested",
} as PartnerProspect;
const verified = [{
  id:"source",title:"Partner website",source_url:"https://example.org/about",
  source_kind:"website",finding:"Company provides industrial equipment support",
  evidence_state:"verified_by_hq",verified_at:"2026-10-10T12:00:00Z",
} as ResearchSource];

describe("Strategic partnership proposal generator", () => {
  it("adapts the document to the verified partner data", () => {
    const snapshot=buildStrategicProposalSnapshot({
      prospect:partner,qualification:null,contactNames:["Demo Contact"],
      verifiedSources:verified,model:"CMSC",
    });
    expect(snapshot.title).toContain("Atlas Maintenance Solutions");
    expect(snapshot.subtitle).toContain("CMSC");
    expect(snapshot.sections.length).toBeGreaterThanOrEqual(6);
    expect(snapshot.sections.find(x=>x.heading.includes("Evidence"))?.bullets).toContain(verified[0].finding);
    expect(snapshot.missing_inputs).toHaveLength(0);
    expect(snapshot.proposal_notice).toContain("NOT A CONTRACT");
  });
  it("does not fabricate financial rates or renewal entitlements", () => {
    const snapshot=buildStrategicProposalSnapshot({
      prospect:partner,qualification:null,contactNames:["Demo Contact"],
      verifiedSources:verified,model:"CMSC",
    });
    expect(snapshot.commercial_terms).toContain("No commission or renewal entitlement");
    expect(snapshot.commercial_terms).not.toContain("20%");
    expect(snapshot.commercial_terms).not.toContain("40%");
  });
  it("requires real evidence, commercial fit, interest and contact for HQ approval", () => {
    const input={
      prospect:{...partner,fit_summary:null,interest_evidence:null},
      qualification:null,contactNames:[],verifiedSources:[],model:null,
      objective:"",
    };
    const check=getProposalReadiness(input);
    expect(check.readyForHQApproval).toBe(false);
    expect(check.missing.length).toBeGreaterThanOrEqual(4);
  });
  it("does not promote unverified research notes to verified source findings", () => {
    const snapshot=buildStrategicProposalSnapshot({
      prospect:partner,qualification: { research_summary:"Unverified company market share claim" } as any,
      contactNames:["Demo Contact"],verifiedSources:[],model:"CMSC",
    });
    expect(snapshot.evidence).toHaveLength(0);
    expect(snapshot.missing_inputs.some(t=>t.includes("Verify"))).toBe(true);
    expect(snapshot.research_limitations).toContain("internal context");
  });
  it("preserves the distinct CMAR and CMAI competence gates", () => {
    for (const model of ["CMAR","CMAI"] as const) {
      const snapshot=buildStrategicProposalSnapshot({
        prospect:partner,qualification:null,contactNames:["Demo Contact"],
        verifiedSources:verified,model,
      });
      expect(snapshot.sections[2].paragraphs[0]).toContain("HQ");
    }
  });
});
