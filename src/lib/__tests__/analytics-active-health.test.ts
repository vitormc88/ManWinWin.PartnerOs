import { describe, expect, it } from "vitest";
import { summarizeActivePartnerHealth } from "../analytics-corrections";

describe("Analytics active partner health", () => {
  it("excludes inactive and archived partners from both numerator and denominator", () => {
    expect(summarizeActivePartnerHealth([
      { partner: { is_active: true, status: "Active" }, health: 20 },
      { partner: { is_active: true, status: "Active" }, health: 61 },
      { partner: { is_active: false, status: "Active" }, health: 100 },
      { partner: { is_active: true, status: "Archived" }, health: 100 },
      { partner: undefined, health: 100 },
    ])).toEqual({ activeCount: 2, scoredCount: 2, average: 41 });
  });

  it("retains a real zero but excludes missing and non-finite scores", () => {
    const partner = { is_active: true, status: "Active" };
    expect(summarizeActivePartnerHealth([
      { partner, health: 0 }, { partner, health: 80 },
      { partner, health: null }, { partner, health: undefined },
      { partner, health: NaN }, { partner, health: Infinity },
    ])).toEqual({ activeCount: 6, scoredCount: 2, average: 40 });
  });

  it("does not invent a zero when there are no active partners", () => {
    expect(summarizeActivePartnerHealth([])).toEqual({ activeCount: 0, scoredCount: 0, average: null });
    expect(summarizeActivePartnerHealth([
      { partner: { is_active: false }, health: 50 },
      { partner: { status: "Archived" }, health: 80 },
    ])).toEqual({ activeCount: 0, scoredCount: 0, average: null });
  });

  it("reports an unavailable mean when all active scores are missing", () => {
    expect(summarizeActivePartnerHealth([
      { partner: { is_active: true }, health: null },
    ])).toEqual({ activeCount: 1, scoredCount: 0, average: null });
  });

  it("uses the established active-partner rule for legacy records", () => {
    expect(summarizeActivePartnerHealth([
      { partner: { is_active: null, status: "Active" }, health: 45 },
    ])).toEqual({ activeCount: 1, scoredCount: 1, average: 45 });
  });
});
