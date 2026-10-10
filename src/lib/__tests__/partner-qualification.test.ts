import { describe, expect, it } from "vitest";
import {
  buildDiscoveryQuestions, EMPTY_QUALIFICATION, getQualificationSummary, getRecommendedModel,
  type QualificationDraft,
} from "@/hooks/usePartnerQualification";

const q = (p: Partial<QualificationDraft>): QualificationDraft => ({ ...EMPTY_QUALIFICATION, ...p });
describe("Partner Growth Qualification Copilot", () => {
  it("does not recommend accreditation from unknown answers", () => {
    expect(getRecommendedModel(q({}))).toBeNull();
    const result = getQualificationSummary(q({}));
    expect(result.gaps).toBe(5);
    expect(result.model).toBeNull();
    expect(result.assessment).toBe("Further qualification needed");
  });
  it("supports connector role even without software demo or implementation capability", () => {
    const x = q({ can_introduce: "yes", can_sell: "no", can_implement: "no" });
    expect(getRecommendedModel(x)).toBe("CMSC");
    expect(getQualificationSummary(x).readiness).toContain("demo accreditation not required");
  });
  it("distinguishes reseller and implementer pathways", () => {
    expect(getRecommendedModel(q({ can_sell: "yes" }))).toBe("CMAR");
    expect(getRecommendedModel(q({ can_sell: "yes", can_implement: "yes" }))).toBe("CMAI");
    expect(getRecommendedModel(q({ can_introduce: "no", can_implement: "yes", can_sell: "no" }))).toBeNull();
  });
  it("does not turn unknown or risky inputs into a green assessment", () => {
    expect(getQualificationSummary(q({ market_fit: "no", business_viability: "no" })).assessment).toBe("Reassess partnership fit");
    expect(getQualificationSummary(q({ market_fit: "yes", commercial_reach: "yes",
      complementary_value: "yes", commitment: "yes", business_viability: "yes" })).assessment).toBe("Ready for HQ assessment");
  });
  it("changes discovery questions for commercial capability vs referrals", () => {
    const connector = buildDiscoveryQuestions(q({ can_introduce: "unknown", can_sell: "no", can_implement: "no" }), "Company");
    expect(connector.some((s) => s.includes("introducing qualified customers"))).toBe(true);
    const reseller = buildDiscoveryQuestions(q({ can_sell: "yes" }), "Company");
    expect(reseller.some((s) => s.includes("demonstrations"))).toBe(true);
  });
});
