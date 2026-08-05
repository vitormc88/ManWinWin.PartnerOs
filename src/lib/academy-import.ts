/**
 * Partner Academy — generic bulk import/export foundation.
 *
 * The parsing, validation and reporting layers are entity-agnostic: an
 * `ImportEntityDescriptor` describes how raw rows become database rows, so
 * future Academy objects (modules, missions, resources, badges) can reuse the
 * wizard without touching this file's core.
 *
 * Pure functions only — no IO, no Supabase.
 */

import {
  CERT_CATEGORIES,
  CERT_CATEGORY_LABELS,
  CERT_DIFFICULTIES,
  CERT_TYPE_LABELS,
  CERT_TYPES,
  type CertCategory,
  type CertQuestionType,
} from "@/lib/academy-certification";

export type ImportFormat = "json" | "csv";
export type DuplicateMode = "skip" | "update" | "cancel";

export interface ImportIssue {
  field?: string;
  message: string;
}

export interface ValidatedImportRow<T> {
  index: number;
  label: string;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  isDuplicate: boolean;
  record: T | null;
  raw: Record<string, unknown>;
}

export interface ImportReport<T> {
  rows: ValidatedImportRow<T>[];
  valid: number;
  invalid: number;
  duplicates: number;
  ok: boolean;
  distributions: Record<string, Record<string, number>>;
}

export interface ImportEntityDescriptor<T, Ctx> {
  entity: string;
  /** Column order used for CSV parsing, export and templates. */
  csvColumns: string[];
  /** Human label for a row in reports. */
  labelOf: (raw: Record<string, unknown>, index: number) => string;
  /** Raw row (JSON object or CSV record) → validated database record. */
  validateRow: (
    raw: Record<string, unknown>,
    ctx: Ctx
  ) => { record: T | null; errors: ImportIssue[]; warnings: ImportIssue[]; code: string | null };
  /** Detects a record already present in the database. */
  isDuplicate: (code: string | null, ctx: Ctx) => boolean;
  /** Distribution buckets shown in the validation summary. */
  distribute: (record: T) => Record<string, string>;
}

/* ────────────────────────────── CSV utilities ───────────────────────────── */

/** RFC4180-ish parser: quoted fields, escaped quotes, CRLF tolerant. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], records: Array<Record<string, unknown>>): string {
  const head = columns.join(",");
  const body = records.map((r) => columns.map((c) => csvEscape(r[c])).join(","));
  return [head, ...body].join("\n");
}

/** Parses pasted or uploaded content into raw rows for the descriptor. */
export function parseImportContent(
  format: ImportFormat,
  text: string,
  columns: string[]
): { rows: Record<string, unknown>[]; error: string | null } {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { rows: [], error: "Nothing to import — the content is empty." };

  if (format === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonComments(trimmed));
    } catch (e) {
      return { rows: [], error: `Invalid JSON: ${(e as Error).message}` };
    }
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { questions?: unknown })?.questions)
        ? (parsed as { questions: unknown[] }).questions
        : null;
    if (!arr) return { rows: [], error: "JSON must be an array of records." };
    const bad = arr.findIndex((r) => typeof r !== "object" || r === null || Array.isArray(r));
    if (bad >= 0) return { rows: [], error: `Record ${bad + 1} is not a JSON object.` };
    return { rows: arr as Record<string, unknown>[], error: null };
  }

  const table = parseCsv(
    trimmed
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join("\n")
  );
  if (table.length < 2) return { rows: [], error: "CSV must contain a header row and at least one record." };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = columns.filter((c) => c !== "scenario_group" && c !== "tags" && !header.includes(c));
  if (missing.length) return { rows: [], error: `CSV is missing columns: ${missing.join(", ")}` };
  const rows = table.slice(1).map((cells) => {
    const rec: Record<string, unknown> = {};
    header.forEach((h, i) => {
      rec[h] = cells[i] ?? "";
    });
    return rec;
  });
  return { rows, error: null };
}

/** Allows `//` documentation lines inside JSON templates. */
export function stripJsonComments(text: string): string {
  return text
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

/* ─────────────────────────── Generic validation ─────────────────────────── */

export function validateImport<T, Ctx>(
  descriptor: ImportEntityDescriptor<T, Ctx>,
  rows: Record<string, unknown>[],
  ctx: Ctx
): ImportReport<T> {
  const seen = new Map<string, number>();
  const out: ValidatedImportRow<T>[] = rows.map((raw, index) => {
    const { record, errors, warnings, code } = descriptor.validateRow(raw, ctx);
    const key = code?.toLowerCase() ?? "";
    if (key) {
      if (seen.has(key)) {
        errors.push({ field: "code", message: `Duplicate code in this file (row ${seen.get(key)! + 1}).` });
      } else seen.set(key, index);
    }
    const isDuplicate = descriptor.isDuplicate(code, ctx);
    if (isDuplicate) {
      warnings.push({ field: "code", message: "This code already exists in the module." });
    }
    return { index, label: descriptor.labelOf(raw, index), errors, warnings, isDuplicate, record, raw };
  });

  const distributions: Record<string, Record<string, number>> = {};
  for (const r of out) {
    if (!r.record || r.errors.length) continue;
    for (const [dim, value] of Object.entries(descriptor.distribute(r.record))) {
      distributions[dim] = distributions[dim] ?? {};
      distributions[dim][value] = (distributions[dim][value] ?? 0) + 1;
    }
  }

  const invalid = out.filter((r) => r.errors.length).length;
  return {
    rows: out,
    valid: out.length - invalid,
    invalid,
    duplicates: out.filter((r) => r.isDuplicate).length,
    ok: out.length > 0 && invalid === 0,
    distributions,
  };
}

/* ──────────────────────────── Questions entity ──────────────────────────── */

export interface QuestionImportContext {
  moduleId: string;
  moduleTitle: string;
  missions: Array<{ id: string; title: string; slug: string }>;
  existingCodes: string[];
}

export interface QuestionImportRecord {
  question_code: string;
  question_text: string;
  scenario_text: string | null;
  scenario_group: string | null;
  category: CertCategory;
  question_type: CertQuestionType;
  difficulty: string;
  weight: number;
  status: string;
  is_mandatory: boolean;
  explanation: string | null;
  options_json: string[];
  correct_answer_json: unknown;
  tags_json: string[];
  mission_id: string | null;
  mission_label: string | null;
}

const norm = (v: unknown) => String(v ?? "").trim();
const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const CATEGORY_BY_LABEL = new Map<string, CertCategory>(
  CERT_CATEGORIES.flatMap((c) => [
    [slugify(CERT_CATEGORY_LABELS[c]), c] as const,
    [slugify(c), c] as const,
  ])
);
const TYPE_BY_LABEL = new Map<string, CertQuestionType>(
  CERT_TYPES.flatMap((t) => [
    [slugify(CERT_TYPE_LABELS[t].replace(/—/g, " ")), t] as const,
    [slugify(t), t] as const,
  ])
);
/** Human-friendly type aliases accepted in files. */
const TYPE_ALIASES: Record<string, CertQuestionType> = {
  "single choice": "single_choice",
  "multiple select": "multiple_select",
  "multiple choice": "multiple_select",
  ordering: "ordering",
  classification: "classification",
  "scenario single choice": "scenario_single_choice",
  "scenario multiple select": "scenario_multiple_select",
  "record review": "record_review",
};

export const STATUS_VALUES = ["draft", "published", "retired"];

export function resolveCategory(input: string): CertCategory | null {
  return CATEGORY_BY_LABEL.get(slugify(input)) ?? null;
}
export function resolveType(input: string): CertQuestionType | null {
  const key = slugify(input);
  return TYPE_BY_LABEL.get(key) ?? TYPE_ALIASES[key] ?? null;
}

/** "A" | "b" → index; also accepts "1".."26" and exact option text. */
function optionIndex(token: string, options: string[]): number {
  const t = token.trim();
  if (!t) return -1;
  const exact = options.findIndex((o) => o.trim().toLowerCase() === t.toLowerCase());
  if (exact >= 0) return exact;
  if (/^[a-zA-Z]$/.test(t)) return t.toUpperCase().charCodeAt(0) - 65;
  if (/^\d+$/.test(t)) return Number(t) - 1;
  return -1;
}

/**
 * Converts the human "correct" column into the stored answer JSON, which is
 * always expressed in option text so scoring stays stable if letters move.
 */
export function parseCorrectAnswer(
  raw: string,
  type: CertQuestionType,
  options: string[]
): { value: unknown; error: string | null } {
  const input = norm(raw);
  if (!input) return { value: null, error: "Missing correct answer." };

  const multi = type === "multiple_select" || type === "scenario_multiple_select" || type === "record_review";

  if (type === "classification") {
    const map: Record<string, string> = {};
    for (const pair of input.split(/[;|]/).map((s) => s.trim()).filter(Boolean)) {
      const [left, right] = pair.split(":").map((s) => (s ?? "").trim());
      const idx = optionIndex(left ?? "", options);
      if (idx < 0 || !options[idx]) return { value: null, error: `Unknown option "${left}" in correct answer.` };
      if (!right) return { value: null, error: `Missing bucket for option "${left}".` };
      map[options[idx]] = right;
    }
    if (Object.keys(map).length !== options.length)
      return { value: null, error: "Classification answers must map every option to a bucket." };
    return { value: map, error: null };
  }

  const tokens = input.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  const resolved: string[] = [];
  for (const t of tokens) {
    const idx = optionIndex(t, options);
    if (idx < 0 || !options[idx]) return { value: null, error: `Unknown option "${t}" in correct answer.` };
    resolved.push(options[idx]);
  }

  if (type === "ordering") {
    if (resolved.length !== options.length)
      return { value: null, error: "Ordering answers must list every option exactly once." };
    if (new Set(resolved).size !== resolved.length)
      return { value: null, error: "Ordering answers must not repeat an option." };
    return { value: resolved, error: null };
  }

  if (multi) {
    if (resolved.length < 1) return { value: null, error: "Missing correct answer." };
    if (new Set(resolved).size !== resolved.length)
      return { value: null, error: "Correct answers must not repeat an option." };
    return { value: resolved, error: null };
  }

  if (resolved.length !== 1) return { value: null, error: "Single choice answers must reference exactly one option." };
  return { value: resolved[0], error: null };
}

function collectOptions(raw: Record<string, unknown>): { options: string[]; errors: ImportIssue[] } {
  const errors: ImportIssue[] = [];
  let options: string[] = [];
  if (Array.isArray(raw.options)) {
    options = (raw.options as unknown[]).map((o) => norm(o));
  } else {
    for (const key of Object.keys(raw)
      .filter((k) => /^option_[a-z]$/i.test(k))
      .sort()) {
      options.push(norm(raw[key]));
    }
  }
  if (options.some((o) => o === "") && options.filter((o) => o !== "").length !== options.length) {
    // trailing blanks are fine, interior blanks are not
    const lastFilled = options.map((o) => o !== "").lastIndexOf(true);
    if (options.slice(0, lastFilled).some((o) => o === ""))
      errors.push({ field: "options", message: "An option is empty." });
  }
  options = options.filter((o) => o !== "");
  if (options.length < 2) errors.push({ field: "options", message: "At least two options are required." });
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length)
    errors.push({ field: "options", message: "Options must be unique." });
  return { options, errors };
}

export const questionImportDescriptor: ImportEntityDescriptor<QuestionImportRecord, QuestionImportContext> = {
  entity: "questions",
  csvColumns: [
    "code",
    "module",
    "mission",
    "difficulty",
    "category",
    "type",
    "weight",
    "scenario",
    "question",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "correct",
    "status",
    "explanation",
  ],
  labelOf: (raw, index) => norm(raw.code) || `Question ${index + 1}`,
  isDuplicate: (code, ctx) =>
    !!code && ctx.existingCodes.some((c) => c.toLowerCase() === code.toLowerCase()),
  distribute: (r) => ({
    Category: CERT_CATEGORY_LABELS[r.category],
    Type: CERT_TYPE_LABELS[r.question_type],
    Difficulty: r.difficulty,
    Weight: `weight ${r.weight}`,
    Status: r.status,
    Mission: r.mission_label ?? "No mission",
  }),
  validateRow: (raw, ctx) => {
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];
    const code = norm(raw.code) || null;
    if (!code) errors.push({ field: "code", message: "Missing question code." });

    const moduleName = norm(raw.module);
    if (moduleName && slugify(moduleName) !== slugify(ctx.moduleTitle)) {
      errors.push({
        field: "module",
        message: `Unknown module "${moduleName}" — expected "${ctx.moduleTitle}".`,
      });
    }

    const missionName = norm(raw.mission);
    let mission: { id: string; title: string } | null = null;
    if (missionName) {
      const found = ctx.missions.find(
        (m) => slugify(m.title) === slugify(missionName) || slugify(m.slug) === slugify(missionName)
      );
      if (!found) errors.push({ field: "mission", message: `Unknown mission "${missionName}".` });
      else mission = found;
    } else {
      warnings.push({ field: "mission", message: "No mission linked." });
    }

    const questionText = norm(raw.question ?? raw.question_text);
    if (!questionText) errors.push({ field: "question", message: "Missing question text." });

    const category = resolveCategory(norm(raw.category));
    if (!category) errors.push({ field: "category", message: `Invalid category "${norm(raw.category)}".` });

    const type = resolveType(norm(raw.type ?? raw.question_type));
    if (!type) errors.push({ field: "type", message: `Invalid type "${norm(raw.type ?? raw.question_type)}".` });

    const difficulty = norm(raw.difficulty).toLowerCase();
    if (!(CERT_DIFFICULTIES as readonly string[]).includes(difficulty))
      errors.push({ field: "difficulty", message: `Invalid difficulty "${norm(raw.difficulty)}".` });

    const weightRaw = norm(raw.weight) || "1";
    const weight = Number(weightRaw);
    if (!Number.isInteger(weight) || weight < 1 || weight > 10)
      errors.push({ field: "weight", message: `Invalid weight "${weightRaw}" (1-10).` });

    const status = (norm(raw.status) || "draft").toLowerCase();
    if (!STATUS_VALUES.includes(status))
      errors.push({ field: "status", message: `Invalid status "${norm(raw.status)}".` });

    const { options, errors: optionErrors } = collectOptions(raw);
    errors.push(...optionErrors);

    let correct: unknown = null;
    if (type && options.length >= 2) {
      const parsed = parseCorrectAnswer(norm(raw.correct ?? raw.correct_answer), type, options);
      if (parsed.error) errors.push({ field: "correct", message: parsed.error });
      else correct = parsed.value;
    } else if (!norm(raw.correct ?? raw.correct_answer)) {
      errors.push({ field: "correct", message: "Missing correct answer." });
    }

    const tags = Array.isArray(raw.tags)
      ? (raw.tags as unknown[]).map((t) => norm(t)).filter(Boolean)
      : norm(raw.tags)
        ? norm(raw.tags).split(/[,;|]/).map((t) => t.trim()).filter(Boolean)
        : [];

    if (errors.length || !category || !type) return { record: null, errors, warnings, code };

    return {
      code,
      errors,
      warnings,
      record: {
        question_code: code!,
        question_text: questionText,
        scenario_text: norm(raw.scenario ?? raw.scenario_text) || null,
        scenario_group: norm(raw.scenario_group) || null,
        category,
        question_type: type,
        difficulty,
        weight,
        status,
        is_mandatory: norm(raw.is_mandatory).toLowerCase() === "true",
        explanation: norm(raw.explanation) || null,
        options_json: options,
        correct_answer_json: correct,
        tags_json: tags,
        mission_id: mission?.id ?? null,
        mission_label: mission?.title ?? null,
      },
    };
  },
};

/* ─────────────────────────── Export & templates ─────────────────────────── */

export interface ExportableQuestion {
  question_code: string;
  question_text: string;
  scenario_text: string | null;
  category: string;
  question_type: string;
  difficulty: string;
  weight: number;
  status: string;
  explanation: string | null;
  options_json: unknown;
  correct_answer_json: unknown;
  mission_id: string | null;
}

const letterOf = (i: number) => String.fromCharCode(65 + i);

/** Renders a stored answer back into the human "correct" notation. */
export function serializeCorrectAnswer(answer: unknown, options: string[]): string {
  const letter = (text: string) => {
    const i = options.findIndex((o) => o === text);
    return i >= 0 ? letterOf(i) : text;
  };
  if (typeof answer === "string") return letter(answer);
  if (Array.isArray(answer)) return answer.map((a) => letter(String(a))).join(",");
  if (answer && typeof answer === "object")
    return Object.entries(answer as Record<string, string>)
      .map(([k, v]) => `${letter(k)}:${v}`)
      .join(";");
  return "";
}

export function questionsToExportRows(
  questions: ExportableQuestion[],
  ctx: { moduleTitle: string; missionTitleById: Record<string, string> }
): Array<Record<string, unknown>> {
  return questions.map((q) => {
    const options = Array.isArray(q.options_json) ? (q.options_json as string[]).map(String) : [];
    const row: Record<string, unknown> = {
      code: q.question_code,
      module: ctx.moduleTitle,
      mission: q.mission_id ? (ctx.missionTitleById[q.mission_id] ?? "") : "",
      difficulty: q.difficulty,
      category: CERT_CATEGORY_LABELS[q.category as CertCategory] ?? q.category,
      type: CERT_TYPE_LABELS[q.question_type as CertQuestionType] ?? q.question_type,
      weight: q.weight,
      scenario: q.scenario_text ?? "",
      question: q.question_text,
      correct: serializeCorrectAnswer(q.correct_answer_json, options),
      status: q.status,
      explanation: q.explanation ?? "",
    };
    options.forEach((o, i) => {
      row[`option_${letterOf(i).toLowerCase()}`] = o;
    });
    return row;
  });
}

export function exportQuestions(
  format: ImportFormat,
  questions: ExportableQuestion[],
  ctx: { moduleTitle: string; missionTitleById: Record<string, string> }
): string {
  const rows = questionsToExportRows(questions, ctx);
  if (format === "json") {
    return JSON.stringify(
      rows.map((r) => {
        const options = Object.keys(r)
          .filter((k) => k.startsWith("option_"))
          .sort()
          .map((k) => r[k]);
        const { code, module, mission, difficulty, category, type, weight, scenario, question, correct, status, explanation } = r;
        return { code, module, mission, difficulty, category, type, weight, scenario, question, options, correct, status, explanation };
      }),
      null,
      2
    );
  }
  const maxOptions = rows.reduce(
    (n, r) => Math.max(n, Object.keys(r).filter((k) => k.startsWith("option_")).length),
    4
  );
  const optionCols = Array.from({ length: maxOptions }, (_, i) => `option_${letterOf(i).toLowerCase()}`);
  const columns = [
    "code",
    "module",
    "mission",
    "difficulty",
    "category",
    "type",
    "weight",
    "scenario",
    "question",
    ...optionCols,
    "correct",
    "status",
    "explanation",
  ];
  return toCsv(columns, rows);
}

/** Always reflects the current import schema. */
export function generateQuestionTemplate(
  format: ImportFormat,
  ctx: { moduleTitle: string; missionTitle?: string | null }
): string {
  const example = {
    code: "QUA-KNW-001",
    module: ctx.moduleTitle,
    mission: ctx.missionTitle ?? "",
    difficulty: "easy",
    category: "Knowledge",
    type: "Single Choice",
    weight: 1,
    scenario: "",
    question: "What does TIMD stand for?",
    options: ["Option A", "Option B", "Option C", "Option D"],
    correct: "B",
    status: "draft",
    explanation: "Short rationale shown to admins.",
  };

  if (format === "json") {
    const doc = [
      "// Partner Academy — question import template",
      `// difficulty: ${CERT_DIFFICULTIES.join(" | ")}`,
      `// category:   ${CERT_CATEGORIES.map((c) => CERT_CATEGORY_LABELS[c]).join(" | ")}`,
      `// type:       ${CERT_TYPES.map((t) => CERT_TYPE_LABELS[t]).join(" | ")}`,
      `// status:     ${STATUS_VALUES.join(" | ")}`,
      "// correct: option letter(s). Single: \"B\". Multiple/Ordering: \"B,C\". Classification: \"A:Qualify;B:Nurture\".",
      JSON.stringify([example], null, 2),
    ].join("\n");
    return doc;
  }

  const header = questionImportDescriptor.csvColumns;
  const row: Record<string, unknown> = {
    ...example,
    option_a: "Option A",
    option_b: "Option B",
    option_c: "Option C",
    option_d: "Option D",
  };
  const docs = [
    `# difficulty: ${CERT_DIFFICULTIES.join(" | ")}`,
    `# category: ${CERT_CATEGORIES.map((c) => CERT_CATEGORY_LABELS[c]).join(" | ")}`,
    `# type: ${CERT_TYPES.map((t) => CERT_TYPE_LABELS[t]).join(" | ")}`,
    `# status: ${STATUS_VALUES.join(" | ")}`,
    `# correct: option letters, e.g. B  or  B,C  or  A:Qualify;B:Nurture`,
  ].join("\n");
  return `${docs}\n${toCsv(header, [row])}`;
}

/** Triggers a client-side download without touching the DOM outside the anchor. */
export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
