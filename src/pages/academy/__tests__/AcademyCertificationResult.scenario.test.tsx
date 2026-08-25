import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CertResult } from "@/lib/academy-certification";

const resultRef: { current: CertResult | null } = { current: null };

vi.mock("@/hooks/useAcademyCertification", () => ({
  useAttemptResult: () => ({
    data: resultRef.current,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useAcademy", () => ({
  useAcademyModules: () => ({ data: [] }),
}));

import AcademyCertificationResult from "../AcademyCertificationResult";

function baseResult(overrides: Partial<CertResult>): CertResult {
  return {
    attempt_id: "a1",
    module_id: "m1",
    attempt_number: 1,
    status: "submitted",
    passed: true,
    raw_score: 10,
    weighted_score: 100,
    scenario_score: null,
    category_scores: {},
    submitted_at: null,
    next_attempt_at: null,
    total_questions: 10,
    weak_areas: [],
    certification: null,
    ...overrides,
  } as CertResult;
}

function renderResult() {
  return render(
    <MemoryRouter>
      <AcademyCertificationResult />
    </MemoryRouter>
  );
}

describe("certification result — scenario gate visibility", () => {
  beforeEach(() => {
    resultRef.current = null;
  });

  it("hides Scenario Analysis for a module without a scenario gate (Module 7)", () => {
    resultRef.current = baseResult({ pass_score: 80, scenario_pass_score: null });
    renderResult();

    expect(screen.queryByText("Scenario Analysis")).toBeNull();
    expect(screen.getByText(/Passing requires a score ≥ 80%/)).toBeTruthy();
    expect(screen.queryByText(/Scenario Analysis ≥/)).toBeNull();
    expect(screen.getByText("Score")).toBeTruthy();
  });

  it("still renders both thresholds for Module 5", () => {
    resultRef.current = baseResult({
      pass_score: 80,
      scenario_pass_score: 60,
      scenario_score: 75,
      weighted_score: 85,
      total_questions: 20,
      raw_score: 17,
    });
    renderResult();

    expect(screen.getByText("Scenario Analysis")).toBeTruthy();
    expect(screen.getByText(/weighted ≥ 80% and Scenario Analysis ≥ 60%/)).toBeTruthy();
    expect(screen.getByText("Weighted score")).toBeTruthy();
  });
});
