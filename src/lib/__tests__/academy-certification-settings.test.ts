import { describe, expect, it } from "vitest";
import {
  CERT_PASS_SCORE,
  CERT_QUESTION_COUNT,
  CERT_SCENARIO_PASS_SCORE,
  certDurationLabel,
  certSettings,
  certificationPasses,
  hasScenarioGate,
  isRawScoring,
  requiredCorrectAnswers,
} from "@/lib/academy-certification";

/** Module 5 keeps the legacy behaviour; Module 1 has no scenario gate. */
const M5 = {
  question_count: 20,
  pass_score: 80,
  scenario_pass_score: 60,
  scoring_mode: "weighted" as const,
  time_limit_minutes: 25,
  estimated_minutes_min: 20,
  estimated_minutes_max: 25,
};

const M1 = {
  question_count: 10,
  pass_score: 80,
  scenario_pass_score: null,
  scoring_mode: "raw_percentage" as const,
  time_limit_minutes: 15,
  estimated_minutes_min: 5,
  estimated_minutes_max: 7,
};

describe("certification settings", () => {
  it("falls back to the legacy Module 5 defaults", () => {
    const s = certSettings(undefined);
    expect(s.question_count).toBe(CERT_QUESTION_COUNT);
    expect(s.pass_score).toBe(CERT_PASS_SCORE);
    expect(s.scenario_pass_score).toBe(CERT_SCENARIO_PASS_SCORE);
    expect(hasScenarioGate(undefined)).toBe(true);
  });

  it("keeps the scenario gate for Module 5", () => {
    expect(hasScenarioGate(M5)).toBe(true);
    expect(certSettings(M5).question_count).toBe(20);
    expect(certDurationLabel(M5)).toBe("20–25 minutes");
  });

  it("drops the scenario gate for Module 1", () => {
    expect(hasScenarioGate(M1)).toBe(false);
    expect(certSettings(M1).scenario_pass_score).toBeNull();
    expect(certDurationLabel(M1)).toBe("5–7 minutes");
  });
});

describe("certificationPasses", () => {
  it("requires both thresholds when a scenario gate exists", () => {
    expect(certificationPasses(85, 65, 80, 60)).toBe(true);
    expect(certificationPasses(85, 50, 80, 60)).toBe(false);
    expect(certificationPasses(75, 90, 80, 60)).toBe(false);
  });

  it("ignores the scenario score when there is no gate", () => {
    expect(certificationPasses(80, null, 80, null)).toBe(true);
    expect(certificationPasses(70, null, 80, null)).toBe(false);
  });

  it("matches the 8-of-10 rule used by Module 1", () => {
    expect(certificationPasses((8 / 10) * 100, null, 80, null)).toBe(true);
    expect(certificationPasses((7 / 10) * 100, null, 80, null)).toBe(false);
  });
});

describe("scoring mode", () => {
  it("defaults to weighted scoring", () => {
    expect(isRawScoring(undefined)).toBe(false);
    expect(certSettings(undefined).scoring_mode).toBe("weighted");
    expect(isRawScoring(M5)).toBe(false);
  });

  it("uses raw correct-answer scoring for Module 1", () => {
    expect(isRawScoring(M1)).toBe(true);
    expect(certSettings(M1).scoring_mode).toBe("raw_percentage");
    expect(requiredCorrectAnswers(M1)).toBe(8);
  });

  it("ignores unknown scoring modes", () => {
    expect(
      certSettings({ ...M1, scoring_mode: "bogus" as unknown as "weighted" }).scoring_mode
    ).toBe("weighted");
  });

  it("derives the required correct answers for Module 5", () => {
    expect(requiredCorrectAnswers(M5)).toBe(16);
  });
});
