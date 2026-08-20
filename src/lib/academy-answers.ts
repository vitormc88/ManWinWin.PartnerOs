/**
 * Partner Academy — canonical answer handling for certification questions.
 *
 * Single source of truth for:
 *  - resolving a submitted / stored answer against the presented options;
 *  - comparing a submitted answer with the stored correct answer;
 *  - validating a question configuration (import preview, admin save, publish).
 *
 * Pure functions only — no IO. The server remains authoritative for scoring;
 * this module keeps the client, the import wizard and the admin editor honest
 * about what is a *valid* configuration and what a *canonical* answer is.
 */

export type AnswerQuestionType =
  | "single_choice"
  | "multiple_select"
  | "ordering"
  | "classification"
  | "scenario_single_choice"
  | "scenario_multiple_select"
  | "true_false"
  | "record_review";

export const SUPPORTED_ANSWER_TYPES: AnswerQuestionType[] = [
  "single_choice",
  "multiple_select",
  "ordering",
  "classification",
  "scenario_single_choice",
  "scenario_multiple_select",
  "true_false",
  "record_review",
];

/** Offered only when a classification question has no derivable labels. */
export const FALLBACK_CLASSIFICATION_BUCKETS = ["Qualify", "Nurture", "Disqualify"] as const;

export const TRUE_FALSE_OPTIONS = ["True", "False"] as const;

const collapse = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const fold = (v: unknown) => collapse(v).toLowerCase();

/** "B." / "B)" / "B. Some text" → { letter, rest } */
function splitLetterPrefix(value: string): { letter: string | null; rest: string } {
  const m = /^([A-Za-z])\s*[.)-]?\s*(.*)$/.exec(collapse(value));
  if (!m) return { letter: null, rest: collapse(value) };
  const [, letter, rest] = m;
  // A bare letter, or a letter followed by a separator, is a key reference.
  if (rest === "" || /^[A-Za-z]\s*[.)-]/.test(collapse(value))) return { letter, rest };
  return { letter: null, rest: collapse(value) };
}

function stripKey(option: string): string {
  const { letter, rest } = splitLetterPrefix(option);
  return letter && rest ? rest : collapse(option);
}

/**
 * Resolves a raw value to one of the presented options.
 *
 * Accepts the canonical full option text as well as legacy keys such as
 * "B.", "B" or "B. full text" when they point unambiguously at one option.
 */
export function resolveOption(value: unknown, options: string[]): string | null {
  if (typeof value !== "string") return null;
  const raw = collapse(value);
  if (!raw) return null;

  const exact = options.find((o) => o === value || collapse(o) === raw);
  if (exact !== undefined) return exact;

  const ci = options.find((o) => fold(o) === fold(raw));
  if (ci !== undefined) return ci;

  const byStripped = options.find((o) => fold(stripKey(o)) === fold(stripKey(raw)));
  if (byStripped !== undefined) return byStripped;

  const { letter, rest } = splitLetterPrefix(raw);
  if (letter) {
    // "B. full text" — prefer a textual match, otherwise fall back to position.
    if (rest) {
      const byText = options.find((o) => fold(stripKey(o)) === fold(rest));
      if (byText !== undefined) return byText;
    }
    const idx = letter.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) return options[idx];
  }
  return null;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Classification labels are the distinct values of the stored answer map, in
 * deterministic first-seen key order. Never a global vocabulary.
 */
export function classificationLabels(correctAnswer: unknown): string[] {
  if (!isPlainObject(correctAnswer)) return [];
  const out: string[] = [];
  for (const value of Object.values(correctAnswer)) {
    if (typeof value !== "string") continue;
    const label = collapse(value);
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/** Labels to render, with a clearly-flagged fallback for malformed legacy data. */
export function classificationBucketsFor(
  correctAnswerOrLabels: unknown
): { labels: string[]; derived: boolean } {
  const labels = Array.isArray(correctAnswerOrLabels)
    ? (correctAnswerOrLabels as unknown[]).filter((l): l is string => typeof l === "string" && collapse(l) !== "")
    : classificationLabels(correctAnswerOrLabels);
  if (labels.length >= 1) return { labels: labels.map(collapse), derived: true };
  return { labels: [...FALLBACK_CLASSIFICATION_BUCKETS], derived: false };
}

const isMultiType = (type: AnswerQuestionType, value?: unknown) =>
  type === "multiple_select" ||
  type === "scenario_multiple_select" ||
  (type === "record_review" && Array.isArray(value));

/**
 * Canonicalizes an answer (stored or submitted) into the comparable shape:
 * string | string[] | Record<string,string>. Returns an error instead of a
 * lenient guess when the answer cannot reference the presented options.
 */
export function canonicalizeAnswer(
  type: AnswerQuestionType,
  value: unknown,
  options: string[]
): { value: string | string[] | Record<string, string> | null; error: string | null } {
  const opts = type === "true_false" && options.length === 0 ? [...TRUE_FALSE_OPTIONS] : options;

  if (type === "classification") {
    if (!isPlainObject(value)) return { value: null, error: "Classification answers must be an object." };
    const entries = Object.entries(value);
    if (entries.length === 0) return { value: null, error: "Classification answers must classify every item." };
    const map: Record<string, string> = {};
    for (const [item, label] of entries) {
      const option = resolveOption(item, opts);
      if (!option) return { value: null, error: `Unknown item "${item}" in the classification answer.` };
      if (typeof label !== "string" || !collapse(label))
        return { value: null, error: `Missing label for "${item}".` };
      if (map[option]) return { value: null, error: `Item "${option}" is classified more than once.` };
      map[option] = collapse(label);
    }
    if (Object.keys(map).length !== opts.length)
      return { value: null, error: "Classification answers must classify every presented item exactly once." };
    return { value: map, error: null };
  }

  if (type === "ordering") {
    if (!Array.isArray(value)) return { value: null, error: "Ordering answers must be an array." };
    const resolved: string[] = [];
    for (const v of value) {
      const option = resolveOption(v, opts);
      if (!option) return { value: null, error: `Unknown option "${String(v)}" in the ordering answer.` };
      if (resolved.includes(option)) return { value: null, error: "Ordering answers must not repeat an option." };
      resolved.push(option);
    }
    if (resolved.length !== opts.length)
      return { value: null, error: "Ordering answers must be an exact permutation of the options." };
    return { value: resolved, error: null };
  }

  if (isMultiType(type, value) || (type === "record_review" && Array.isArray(value))) {
    if (!Array.isArray(value)) return { value: null, error: "This answer must be an array of options." };
    if (value.length === 0) return { value: null, error: "Select at least one option." };
    const resolved: string[] = [];
    for (const v of value) {
      const option = resolveOption(v, opts);
      if (!option) return { value: null, error: `Unknown option "${String(v)}".` };
      if (resolved.includes(option)) return { value: null, error: "An option was selected more than once." };
      resolved.push(option);
    }
    return { value: resolved, error: null };
  }

  if (Array.isArray(value)) {
    if (value.length !== 1) return { value: null, error: "This answer must reference exactly one option." };
    value = value[0];
  }
  const option = resolveOption(value, opts);
  if (!option) return { value: null, error: `Unknown option "${String(value ?? "")}".` };
  return { value: option, error: null };
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/** Order-independent for multi-select, order-sensitive for ordering. */
export function answersMatch(
  type: AnswerQuestionType,
  correctAnswer: unknown,
  givenAnswer: unknown,
  options: string[]
): boolean {
  const correct = canonicalizeAnswer(type, correctAnswer, options);
  const given = canonicalizeAnswer(type, givenAnswer, options);
  if (correct.error || given.error || correct.value == null || given.value == null) return false;

  if (type === "classification") {
    const a = correct.value as Record<string, string>;
    const b = given.value as Record<string, string>;
    const ak = Object.keys(a);
    if (ak.length !== Object.keys(b).length) return false;
    return ak.every((k) => fold(a[k]) === fold(b[k]));
  }
  if (Array.isArray(correct.value) || Array.isArray(given.value)) {
    if (!Array.isArray(correct.value) || !Array.isArray(given.value)) return false;
    return type === "ordering"
      ? correct.value.length === given.value.length && correct.value.every((v, i) => v === given.value[i])
      : sameSet(correct.value, given.value as string[]);
  }
  return correct.value === given.value;
}

/* ───────────────────────────── Configuration ───────────────────────────── */

export interface QuestionConfigInput {
  question_code?: string | null;
  question_text?: string | null;
  question_type?: string | null;
  options: unknown;
  correct_answer: unknown;
  weight?: number | null;
  status?: string | null;
}

export interface QuestionConfigIssue {
  field: string;
  message: string;
}

/**
 * Validates everything scoring depends on. Used by the import preview, the
 * admin editor and as the publish gate — an invalid question can never be
 * published, because it could never be answered correctly.
 */
export function validateQuestionConfig(input: QuestionConfigInput): QuestionConfigIssue[] {
  const issues: QuestionConfigIssue[] = [];
  const type = collapse(input.question_type) as AnswerQuestionType;

  if (!collapse(input.question_text)) issues.push({ field: "question_text", message: "Missing question text." });
  if (input.question_code !== undefined && !collapse(input.question_code))
    issues.push({ field: "question_code", message: "Missing question code." });

  if (!SUPPORTED_ANSWER_TYPES.includes(type)) {
    issues.push({ field: "question_type", message: `Unsupported question type "${collapse(input.question_type)}".` });
    return issues;
  }

  const weight = Number(input.weight ?? 1);
  if (!Number.isFinite(weight) || weight <= 0)
    issues.push({ field: "weight", message: "Weight must be a positive number." });

  let options = Array.isArray(input.options)
    ? (input.options as unknown[]).map((o) => collapse(o)).filter(Boolean)
    : [];
  if (type === "true_false" && options.length === 0) options = [...TRUE_FALSE_OPTIONS];

  if (options.length < 2) issues.push({ field: "options", message: "At least two options are required." });
  if (new Set(options.map(fold)).size !== options.length)
    issues.push({ field: "options", message: "Options must be unique." });
  if (options.length < 2) return issues;

  const canonical = canonicalizeAnswer(type, input.correct_answer, options);
  if (canonical.error) {
    issues.push({ field: "correct_answer", message: canonical.error });
    return issues;
  }

  if (type === "classification") {
    const map = canonical.value as Record<string, string>;
    const keys = Object.keys(map);
    if (!sameSet(keys, options))
      issues.push({
        field: "correct_answer",
        message: "Classification keys must exactly match the presented items.",
      });
    if (classificationLabels(map).length === 0)
      issues.push({ field: "correct_answer", message: "Classification labels must be non-empty strings." });
  }

  return issues;
}

/** Publish gate: a question may only be published when its config is valid. */
export function canPublishQuestion(input: QuestionConfigInput): boolean {
  return validateQuestionConfig(input).length === 0;
}
