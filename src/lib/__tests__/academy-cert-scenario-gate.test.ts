import { describe, expect, it } from "vitest";
import { effectiveScenarioPassScore } from "@/lib/academy-certification";

/**
 * Mirrors the SQL cases covered by `public.academy_cert_effective_settings`
 * (migration 20260825 — Module 7 scenario-gate fix).
 */
describe("effective scenario pass score", () => {
  it("inherits the global default when the module uses defaults", () => {
    expect(effectiveScenarioPassScore(null)).toBe(60);
    expect(effectiveScenarioPassScore({})).toBe(60);
  });

  it("keeps an explicit numeric threshold (Module 5)", () => {
    expect(
      effectiveScenarioPassScore({
        scenario_pass_score: 60,
        allowed_categories: ["scenario_analysis", "advanced"],
        blueprint: [{ categories: ["scenario_analysis"], count: 6 }],
      })
    ).toBe(60);
  });

  it("keeps an explicit null threshold (Module 1)", () => {
    expect(
      effectiveScenarioPassScore({
        scenario_pass_score: null,
        allowed_categories: ["knowledge", "understanding", "application"],
        blueprint: [{ categories: ["knowledge"], count: 10 }],
      })
    ).toBeNull();
  });

  it("returns null when the threshold is omitted and no scenario category exists (Module 7)", () => {
    expect(
      effectiveScenarioPassScore({
        question_count: 10,
        pass_score: 80,
        allowed_categories: ["application", "advanced"],
        blueprint: [
          { categories: ["application"], count: 4 },
          { categories: ["advanced"], count: 6 },
        ],
      })
    ).toBeNull();
  });

  it("still inherits the default when the threshold is omitted but scenario questions exist", () => {
    expect(
      effectiveScenarioPassScore({
        allowed_categories: ["application", "scenario_analysis"],
        blueprint: [{ categories: ["scenario_analysis"], count: 10 }],
      })
    ).toBe(60);
    // allowed_categories omitted → inherits the global list, which includes scenario_analysis.
    expect(
      effectiveScenarioPassScore({ blueprint: [{ categories: ["application"], count: 10 }] })
    ).toBe(60);
  });
});
