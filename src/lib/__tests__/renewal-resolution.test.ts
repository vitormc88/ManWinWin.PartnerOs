import { describe, expect, it } from "vitest";
import {
  assessRenewalRisk,
  resolveRenewal,
  shouldCreateRenewalWorkflowRow,
} from "@/lib/renewal-resolution";

const today = new Date("2026-07-30T00:00:00Z");

/** Watsons contract: 2026-07-19 → 2027-07-19, no renewal workflow row. */
const watsonsContract = { contract_end_date: "2027-07-19", status: "Active" };

describe("resolveRenewal precedence", () => {
  it("falls back to the future contract end when no renewals row exists", () => {
    const r = resolveRenewal({ renewals: [], contract: watsonsContract, today });
    expect(r.date).toBe("2027-07-19");
    expect(r.source).toBe("contract_end");
    expect(r.hasWorkflowRecord).toBe(false);
    expect(r.daysTo).toBe(354);
  });

  it("prefers an open operational renewal record", () => {
    const r = resolveRenewal({
      renewals: [{ id: "r1", renewal_date: "2027-01-15", status: "Open", assigned_user_id: "u1" }],
      contract: watsonsContract,
      today,
    });
    expect(r.source).toBe("renewal_record");
    expect(r.date).toBe("2027-01-15");
    expect(r.hasWorkflowRecord).toBe(true);
    expect(r.isAssigned).toBe(true);
  });

  it("ignores closed renewal rows", () => {
    const r = resolveRenewal({
      renewals: [{ id: "r1", renewal_date: "2026-07-19", status: "Completed" }],
      contract: watsonsContract,
      today,
    });
    expect(r.source).toBe("contract_end");
  });

  it("falls back to the license end date when no contract end exists", () => {
    const r = resolveRenewal({ contract: null, license: { license_end_date: "2027-03-01" }, today });
    expect(r.source).toBe("license_end");
    expect(r.date).toBe("2027-03-01");
  });

  it("returns unknown when nothing is on record", () => {
    const r = resolveRenewal({ today });
    expect(r.source).toBe("unknown");
    expect(r.date).toBeNull();
    expect(r.daysTo).toBeNull();
  });
});

describe("assessRenewalRisk", () => {
  it("does not mark Watsons as High risk just because no renewal row exists", () => {
    const r = resolveRenewal({ renewals: [], contract: watsonsContract, today });
    const risk = assessRenewalRisk(r);
    expect(risk.level).toBe("low");
    expect(risk.code).toBe("renewal_future");
    expect(risk.reasons.join(" ")).toContain("contract end date");
  });

  it("marks an expired contract as High risk", () => {
    const r = resolveRenewal({ contract: { contract_end_date: "2026-01-10" }, today });
    const risk = assessRenewalRisk(r);
    expect(risk.level).toBe("high");
    expect(risk.code).toBe("renewal_overdue");
  });

  it("marks an imminent renewal without workflow as High risk", () => {
    const r = resolveRenewal({ contract: { contract_end_date: "2026-08-10" }, today });
    expect(assessRenewalRisk(r).code).toBe("renewal_imminent_no_workflow");
  });

  it("softens an imminent renewal that is prepared and assigned", () => {
    const r = resolveRenewal({
      renewals: [{ id: "r1", renewal_date: "2026-08-10", status: "In Progress", assigned_user_id: "u1" }],
      today,
    });
    expect(assessRenewalRisk(r).level).toBe("medium");
  });

  it("uses medium risk inside the attention window", () => {
    const r = resolveRenewal({ contract: { contract_end_date: "2026-09-30" }, today });
    expect(assessRenewalRisk(r).code).toBe("renewal_approaching");
  });

  it("returns unknown with a deterministic code when no date exists", () => {
    expect(assessRenewalRisk(resolveRenewal({ today })).code).toBe("renewal_date_unknown");
  });
});

describe("shouldCreateRenewalWorkflowRow", () => {
  const target = {
    client_id: "01fbe90e-d3ea-4635-96aa-8e04060b8182",
    target_type: "contract",
    target_id: "c1",
    renewal_date: "2027-07-19",
  };

  it("creates the row when nothing equivalent exists", () => {
    expect(shouldCreateRenewalWorkflowRow([], target)).toBe(true);
  });

  it("does not duplicate on repeated saves", () => {
    const existing = [
      { id: "r1", client_id: target.client_id, target_type: "contract", target_id: "c1", renewal_date: "2027-07-19", status: "Open" },
    ];
    expect(shouldCreateRenewalWorkflowRow(existing, target)).toBe(false);
    expect(shouldCreateRenewalWorkflowRow([...existing, ...existing], target)).toBe(false);
  });

  it("still creates a row when the only match is closed", () => {
    const existing = [
      { id: "r1", client_id: target.client_id, target_type: "contract", target_id: "c1", renewal_date: "2027-07-19", status: "Completed" },
    ];
    expect(shouldCreateRenewalWorkflowRow(existing, target)).toBe(true);
  });
});
