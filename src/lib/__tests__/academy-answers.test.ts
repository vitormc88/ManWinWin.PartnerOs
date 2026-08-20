import { describe, expect, it } from "vitest";
import {
  answersMatch,
  canPublishQuestion,
  canonicalizeAnswer,
  classificationBucketsFor,
  classificationLabels,
  resolveOption,
  validateQuestionConfig,
} from "@/lib/academy-answers";
import { questionImportDescriptor, validateImport, type QuestionImportContext } from "@/lib/academy-import";

const TIMD = "B. Timing, Interest, Money, Decision-making";
const KNW001_OPTIONS = [
  "A. Timing, Implementation, Maintenance, Decision",
  TIMD,
  "C. Targets, Interest, Management, Discovery",
  "D. Technical fit, Investment, Motivation, Demo",
];

describe("answer canonicalization — all supported types", () => {
  it("single_choice accepts the canonical full option", () => {
    expect(answersMatch("single_choice", TIMD, TIMD, KNW001_OPTIONS)).toBe(true);
    expect(answersMatch("single_choice", TIMD, KNW001_OPTIONS[0], KNW001_OPTIONS)).toBe(false);
  });

  it("multiple_select is order-independent", () => {
    const o = ["One", "Two", "Three"];
    expect(answersMatch("multiple_select", ["One", "Three"], ["Three", "One"], o)).toBe(true);
    expect(answersMatch("multiple_select", ["One", "Three"], ["One"], o)).toBe(false);
  });

  it("ordering is order-sensitive", () => {
    const o = ["A", "B", "C"];
    expect(answersMatch("ordering", ["A", "B", "C"], ["A", "B", "C"], o)).toBe(true);
    expect(answersMatch("ordering", ["A", "B", "C"], ["B", "A", "C"], o)).toBe(false);
  });

  it("classification compares mappings independent of key order", () => {
    const o = ["i1", "i2"];
    const correct = { i1: "Fact", i2: "Assumption" };
    expect(answersMatch("classification", correct, { i2: "Assumption", i1: "Fact" }, o)).toBe(true);
    expect(answersMatch("classification", correct, { i1: "Assumption", i2: "Fact" }, o)).toBe(false);
  });

  it("scenario variants behave like their base types", () => {
    const o = ["x", "y", "z"];
    expect(answersMatch("scenario_single_choice", "y", "y", o)).toBe(true);
    expect(answersMatch("scenario_multiple_select", ["x", "z"], ["z", "x"], o)).toBe(true);
  });

  it("true_false resolves against the implicit True/False options", () => {
    expect(answersMatch("true_false", "True", "true", [])).toBe(true);
    expect(answersMatch("true_false", "True", "False", [])).toBe(false);
  });
});

describe("regressions", () => {
  it("QUA-KNW-001: legacy stored key \"B.\" matches the full submitted option", () => {
    expect(resolveOption("B.", KNW001_OPTIONS)).toBe(TIMD);
    expect(resolveOption("B", KNW001_OPTIONS)).toBe(TIMD);
    expect(resolveOption(TIMD, KNW001_OPTIONS)).toBe(TIMD);
    expect(answersMatch("single_choice", "B.", TIMD, KNW001_OPTIONS)).toBe(true);
    expect(answersMatch("single_choice", "B.", KNW001_OPTIONS[2], KNW001_OPTIONS)).toBe(false);
  });

  it("QUA-ADV-002: labels come from its own answer map, not a global vocabulary", () => {
    const correct = {
      "Technicians receive work instructions through WhatsApp.": "Situation",
      "Some requests are lost before reaching Maintenance.": "Problem",
      "We want one controlled request process for all departments.": "Desired outcome",
      "The Plant Manager must approve the investment.": "Decision-making information",
    };
    expect(classificationLabels(correct)).toEqual([
      "Situation",
      "Problem",
      "Desired outcome",
      "Decision-making information",
    ]);
    expect(classificationLabels(correct)).not.toContain("Qualify");
  });

  it("QUA-APP-013: dynamic labels make the question valid and publishable", () => {
    const options = [
      "The customer stated that the Operations Director will approve the investment.",
      "The Operations Director will probably prefer SaaS.",
      "IT involvement has not yet been discussed.",
      "The company operates three warehouses.",
    ];
    const correct = {
      [options[0]]: "Confirmed fact",
      [options[1]]: "Assumption",
      [options[2]]: "Missing or unconfirmed information",
      [options[3]]: "Confirmed situation information",
    };
    expect(classificationBucketsFor(correct).derived).toBe(true);
    expect(classificationBucketsFor(correct).labels).toHaveLength(4);
    expect(
      canPublishQuestion({
        question_code: "QUA-APP-013",
        question_text: "Classify each statement.",
        question_type: "classification",
        options,
        correct_answer: correct,
        weight: 2,
        status: "published",
      })
    ).toBe(true);
  });

  it("rejects duplicated and extraneous multi-select submissions", () => {
    const o = ["One", "Two", "Three"];
    expect(canonicalizeAnswer("multiple_select", ["One", "One"], o).error).toBeTruthy();
    expect(canonicalizeAnswer("multiple_select", ["One", "Nope"], o).error).toBeTruthy();
    expect(canonicalizeAnswer("multiple_select", [], o).error).toBeTruthy();
  });

  it("falls back only for malformed classification data", () => {
    expect(classificationBucketsFor(null)).toEqual({
      labels: ["Qualify", "Nurture", "Disqualify"],
      derived: false,
    });
  });
});

describe("configuration validation", () => {
  it("rejects answers that do not reference the options", () => {
    const issues = validateQuestionConfig({
      question_code: "X-1",
      question_text: "Q",
      question_type: "single_choice",
      options: ["a", "b"],
      correct_answer: "zzz",
      weight: 1,
    });
    expect(issues.map((i) => i.field)).toContain("correct_answer");
  });

  it("rejects an ordering answer that is not a permutation, and a non-positive weight", () => {
    expect(
      validateQuestionConfig({
        question_text: "Q",
        question_type: "ordering",
        options: ["a", "b", "c"],
        correct_answer: ["a", "b"],
        weight: 1,
      })
    ).not.toHaveLength(0);
    expect(
      validateQuestionConfig({
        question_text: "Q",
        question_type: "single_choice",
        options: ["a", "b"],
        correct_answer: "a",
        weight: 0,
      }).map((i) => i.field)
    ).toContain("weight");
  });

  it("rejects an unsupported type and a partial classification map", () => {
    expect(
      validateQuestionConfig({
        question_text: "Q",
        question_type: "essay",
        options: ["a", "b"],
        correct_answer: "a",
      }).map((i) => i.field)
    ).toContain("question_type");
    expect(
      canPublishQuestion({
        question_text: "Q",
        question_type: "classification",
        options: ["a", "b"],
        correct_answer: { a: "Yes" },
      })
    ).toBe(false);
  });
});

describe("import preview rejects invalid configuration", () => {
  const ctx: QuestionImportContext = {
    moduleId: "mod-1",
    moduleTitle: "Module 5 — Qualification",
    missions: [{ id: "m2", title: "Mission 2", slug: "mission-2" }],
    existingCodes: [],
  };

  it("blocks an ordering row that does not list every option", () => {
    const report = validateImport(
      questionImportDescriptor,
      [
        {
          code: "QUA-ORD-001",
          module: ctx.moduleTitle,
          mission: "Mission 2",
          difficulty: "hard",
          category: "Scenario Analysis",
          type: "Ordering",
          weight: 2,
          question: "Order these",
          options: ["A1", "B1", "C1"],
          correct: "A,B",
          status: "published",
        },
      ],
      ctx
    );
    expect(report.ok).toBe(false);
  });
});
