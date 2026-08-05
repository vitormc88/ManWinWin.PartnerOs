import { describe, expect, it } from "vitest";
import {
  exportQuestions,
  generateQuestionTemplate,
  parseCsv,
  parseCorrectAnswer,
  parseImportContent,
  questionImportDescriptor,
  validateImport,
  type QuestionImportContext,
} from "@/lib/academy-import";

const ctx: QuestionImportContext = {
  moduleId: "mod-1",
  moduleTitle: "Module 5 — Qualification",
  missions: [{ id: "m2", title: "Mission 2", slug: "mission-2" }],
  existingCodes: ["QUA-KNW-999"],
};

const base = {
  code: "QUA-KNW-001",
  module: "Module 5 — Qualification",
  mission: "Mission 2",
  difficulty: "easy",
  category: "Knowledge",
  type: "Single Choice",
  weight: 1,
  scenario: "",
  question: "What does TIMD stand for?",
  options: ["Option A", "Option B", "Option C", "Option D"],
  correct: "B",
  status: "published",
  explanation: "Because.",
};

describe("academy question import", () => {
  it("validates a well-formed JSON row and maps the letter answer to option text", () => {
    const report = validateImport(questionImportDescriptor, [base], ctx);
    expect(report.ok).toBe(true);
    expect(report.rows[0].record?.correct_answer_json).toBe("Option B");
    expect(report.rows[0].record?.mission_id).toBe("m2");
  });

  it("reports missing codes, unknown missions and invalid enums", () => {
    const report = validateImport(
      questionImportDescriptor,
      [{ ...base, code: "", mission: "Mission 9", category: "Nope", difficulty: "trivial" }],
      ctx
    );
    const messages = report.rows[0].errors.map((e) => e.message).join(" | ");
    expect(report.ok).toBe(false);
    expect(messages).toContain("Missing question code.");
    expect(messages).toContain("Unknown mission");
    expect(messages).toContain("Invalid category");
    expect(messages).toContain("Invalid difficulty");
  });

  it("flags duplicate codes inside the file and existing codes in the module", () => {
    const report = validateImport(questionImportDescriptor, [base, base, { ...base, code: "QUA-KNW-999" }], ctx);
    expect(report.rows[1].errors[0].message).toContain("Duplicate code");
    expect(report.rows[2].isDuplicate).toBe(true);
  });

  it("rejects a missing or unknown correct answer", () => {
    expect(parseCorrectAnswer("", "single_choice", ["a", "b"]).error).toBe("Missing correct answer.");
    expect(parseCorrectAnswer("Z", "single_choice", ["a", "b"]).error).toContain("Unknown option");
  });

  it("parses multiple select, ordering and classification answers", () => {
    const opts = ["A1", "B1", "C1", "D1"];
    expect(parseCorrectAnswer("B,C", "multiple_select", opts).value).toEqual(["B1", "C1"]);
    expect(parseCorrectAnswer("C,A,B,D", "ordering", opts).value).toEqual(["C1", "A1", "B1", "D1"]);
    expect(parseCorrectAnswer("A,B", "ordering", opts).error).toContain("every option");
    expect(
      parseCorrectAnswer("A:Qualify;B:Nurture;C:Qualify;D:Nurture", "classification", opts).value
    ).toEqual({ A1: "Qualify", B1: "Nurture", C1: "Qualify", D1: "Nurture" });
  });

  it("parses CSV with quoted fields and comment lines", () => {
    const csv = generateQuestionTemplate("csv", { moduleTitle: ctx.moduleTitle, missionTitle: "Mission 2" });
    const parsed = parseImportContent("csv", csv, questionImportDescriptor.csvColumns);
    expect(parsed.error).toBeNull();
    expect(parsed.rows).toHaveLength(1);
    const report = validateImport(questionImportDescriptor, parsed.rows, ctx);
    expect(report.ok).toBe(true);
  });

  it("round-trips a JSON template through the parser", () => {
    const tpl = generateQuestionTemplate("json", { moduleTitle: ctx.moduleTitle, missionTitle: "Mission 2" });
    const parsed = parseImportContent("json", tpl, questionImportDescriptor.csvColumns);
    expect(parsed.error).toBeNull();
    expect(validateImport(questionImportDescriptor, parsed.rows, ctx).ok).toBe(true);
  });

  it("exports questions back into importable content", () => {
    const csv = exportQuestions(
      "csv",
      [
        {
          question_code: "QUA-KNW-001",
          question_text: "Q, with comma",
          scenario_text: null,
          category: "knowledge",
          question_type: "single_choice",
          difficulty: "easy",
          weight: 1,
          status: "published",
          explanation: null,
          options_json: ["Option A", "Option B"],
          correct_answer_json: "Option B",
          mission_id: "m2",
        },
      ],
      { moduleTitle: ctx.moduleTitle, missionTitleById: { m2: "Mission 2" } }
    );
    expect(csv).toContain('"Q, with comma"');
    const rows = parseCsv(csv);
    expect(rows[1][rows[0].indexOf("correct")]).toBe("B");
    const reimported = validateImport(
      questionImportDescriptor,
      parseImportContent("csv", csv, questionImportDescriptor.csvColumns).rows,
      { ...ctx, existingCodes: [] }
    );
    expect(reimported.ok).toBe(true);
  });

  it("imports a 60-question batch in one validation pass", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      ...base,
      code: `QUA-KNW-${String(i + 1).padStart(3, "0")}`,
    }));
    const report = validateImport(questionImportDescriptor, rows, ctx);
    expect(report.ok).toBe(true);
    expect(report.valid).toBe(60);
    expect(report.distributions.Category["Knowledge"]).toBe(60);
  });
});
