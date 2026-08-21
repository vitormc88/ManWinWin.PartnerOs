/**
 * Partner Academy — Module Certification, pure domain helpers.
 *
 * Every authoritative decision (eligibility, generation, scoring, retake
 * windows, issuing) happens in server functions. This module only formats and
 * interprets what the server returns.
 */

import {
  FALLBACK_CLASSIFICATION_BUCKETS,
  classificationBucketsFor,
} from "@/lib/academy-answers";



export const CERT_PASS_SCORE = 80;
export const CERT_SCENARIO_PASS_SCORE = 60;
export const CERT_QUESTION_COUNT = 20;
export const CERT_TIME_LIMIT_MINUTES = 25;

export type CertificationState = "locked" | "ready" | "resume" | "waiting" | "passed";

export type CertQuestionType =
  | "single_choice"
  | "multiple_select"
  | "ordering"
  | "classification"
  | "scenario_single_choice"
  | "scenario_multiple_select"
  | "record_review";

export type CertCategory =
  | "knowledge"
  | "understanding"
  | "application"
  | "scenario_analysis"
  | "advanced"
  | "record_review";

export const CERT_CATEGORY_LABELS: Record<CertCategory, string> = {
  knowledge: "Knowledge",
  understanding: "Understanding",
  application: "Application",
  scenario_analysis: "Scenario Analysis",
  advanced: "Advanced",
  record_review: "Record Review",
};

export const CERT_TYPE_LABELS: Record<CertQuestionType, string> = {
  single_choice: "Single choice",
  multiple_select: "Multiple select",
  ordering: "Ordering",
  classification: "Classification",
  scenario_single_choice: "Scenario — single choice",
  scenario_multiple_select: "Scenario — multiple select",
  record_review: "Record review",
};

export const CERT_DIFFICULTIES = ["easy", "medium", "hard", "expert"] as const;
export const CERT_CATEGORIES = Object.keys(CERT_CATEGORY_LABELS) as CertCategory[];
export const CERT_TYPES = Object.keys(CERT_TYPE_LABELS) as CertQuestionType[];

/**
 * Per-module certification configuration, resolved server-side from
 * `academy_modules.certification_settings`. A null `scenario_pass_score`
 * means the module has no separate Scenario Analysis gate at all.
 * `scoring_mode` decides how the effective score is computed:
 * `weighted` (question weights) or `raw_percentage` (number correct).
 */
export type CertScoringMode = "weighted" | "raw_percentage";

export interface CertSettings {
  question_count: number;
  pass_score: number;
  scenario_pass_score: number | null;
  scoring_mode: CertScoringMode;
  time_limit_minutes: number;
  estimated_minutes_min?: number | null;
  estimated_minutes_max?: number | null;
}

export const CERT_DEFAULT_SETTINGS: CertSettings = {
  question_count: CERT_QUESTION_COUNT,
  pass_score: CERT_PASS_SCORE,
  scenario_pass_score: CERT_SCENARIO_PASS_SCORE,
  scoring_mode: "weighted",
  time_limit_minutes: CERT_TIME_LIMIT_MINUTES,
  estimated_minutes_min: 20,
  estimated_minutes_max: 25,
};

/** Settings as returned by the server, falling back to the legacy defaults. */
export function certSettings(
  s: Partial<CertSettings> | null | undefined
): CertSettings {
  return {
    ...CERT_DEFAULT_SETTINGS,
    ...(s ?? {}),
    scoring_mode:
      s?.scoring_mode === "raw_percentage" ? "raw_percentage" : "weighted",
    scenario_pass_score:
      s && "scenario_pass_score" in s
        ? (s.scenario_pass_score ?? null)
        : CERT_DEFAULT_SETTINGS.scenario_pass_score,
  };
}

/** True when the module gates on Scenario Analysis as well as the overall score. */
export function hasScenarioGate(s: Partial<CertSettings> | null | undefined): boolean {
  return typeof certSettings(s).scenario_pass_score === "number";
}

/** True when the module is scored purely on the number of correct answers. */
export function isRawScoring(s: Partial<CertSettings> | null | undefined): boolean {
  return certSettings(s).scoring_mode === "raw_percentage";
}

/** Number of correct answers needed to pass, e.g. 8 of 10. */
export function requiredCorrectAnswers(
  s: Partial<CertSettings> | null | undefined
): number {
  const c = certSettings(s);
  return Math.ceil((c.pass_score / 100) * c.question_count);
}


/** Estimated duration copy, e.g. "5–7 minutes" or "25 minutes". */
export function certDurationLabel(s: Partial<CertSettings> | null | undefined): string {
  const c = certSettings(s);
  const min = c.estimated_minutes_min ?? null;
  const max = c.estimated_minutes_max ?? null;
  if (min && max && min !== max) return `${min}–${max} minutes`;
  return `${min ?? max ?? c.time_limit_minutes} minutes`;
}

export interface CertEligibility {
  state: CertificationState;
  required_total: number;
  required_done: number;
  missing_items: Array<{ id: string; title: string; slug: string }>;
  active_attempt_id: string | null;
  next_attempt_at: string | null;
  last_attempt_id: string | null;
  attempts_used: number;
  settings?: CertSettings | null;
  certification: {
    id: string;
    score: number;
    scenario_score: number | null;
    issued_at: string;
    certificate_reference: string;
    attempt_id: string | null;
  } | null;
}


export interface CertExamQuestion {
  position: number;
  question_id: string;
  question_type: CertQuestionType;
  category: CertCategory;
  question_text: string;
  scenario_text: string | null;
  options: string[];
  /** Classification questions only: labels derived from the stored answer map. */
  classification_labels?: string[] | null;
  answered: boolean;
  selected_answer: unknown;
}




export interface CertAttemptState {
  attempt_id: string;
  module_id: string;
  attempt_number: number;
  status: "in_progress" | "submitted" | "expired";
  started_at: string;
  expires_at: string;
  server_now: string;
  seconds_remaining: number;
  total_questions: number;
  answered_count: number;
  questions: CertExamQuestion[];
}

export interface CertCategoryScore {
  earned: number;
  total: number;
  pct: number;
}

export interface CertResult {
  attempt_id: string;
  module_id: string;
  attempt_number: number;
  status: string;
  passed: boolean;
  raw_score: number;
  weighted_score: number;
  scenario_score: number | null;
  category_scores: Record<string, CertCategoryScore>;
  submitted_at: string | null;
  next_attempt_at: string | null;
  total_questions: number;
  /** Thresholds actually applied to this attempt, from the module settings. */
  pass_score?: number;
  scenario_pass_score?: number | null;
  weak_areas: Array<{ mission_id: string; title: string; slug: string; missed: number }>;
  /** False for the historical attempts taken before immutable snapshots existed. */
  has_snapshot?: boolean;
  certification: {
    id: string;
    certificate_reference: string;
    issued_at: string;
    score: number;
    scenario_score: number | null;
  } | null;
}

/**
 * Mirrors the server rule: the overall threshold always applies; the scenario
 * threshold only when the module defines one.
 */
export function certificationPasses(
  weighted: number,
  scenario: number | null,
  passScore: number = CERT_PASS_SCORE,
  scenarioPassScore: number | null = CERT_SCENARIO_PASS_SCORE
): boolean {
  if (weighted < passScore) return false;
  if (scenarioPassScore === null) return true;
  return (scenario ?? 0) >= scenarioPassScore;
}


/** Retake waiting period after the Nth consecutive failed attempt, in hours. */
export function retakeWaitHours(failedAttempts: number): number {
  if (failedAttempts <= 0) return 0;
  if (failedAttempts === 1) return 24;
  if (failedAttempts === 2) return 72;
  return 24 * 7;
}

export function formatAttemptDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** mm:ss countdown, never negative. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function certButtonLabel(e: CertEligibility | undefined): string {
  switch (e?.state) {
    case "passed":
      return "Certification Passed";
    case "resume":
      return "Resume Certification";
    case "ready":
      return e.attempts_used > 0 ? "Retake Certification" : "Start Certification";
    case "waiting":
      return `Retake Available On ${formatAttemptDateTime(e.next_attempt_at)}`;
    default:
      return "Locked — Complete required learning items";
  }
}

export function certButtonEnabled(e: CertEligibility | undefined): boolean {
  return e?.state === "ready" || e?.state === "resume" || e?.state === "passed";
}

/** Categories below the pass bar, strongest signal first. */
export function weakCategories(
  scores: Record<string, CertCategoryScore> | undefined
): Array<{ category: string; pct: number }> {
  return Object.entries(scores ?? {})
    .filter(([, v]) => (v?.pct ?? 0) < CERT_PASS_SCORE)
    .map(([category, v]) => ({ category, pct: v?.pct ?? 0 }))
    .sort((a, b) => a.pct - b.pct);
}

export function categoryLabel(key: string): string {
  return CERT_CATEGORY_LABELS[key as CertCategory] ?? key;
}

/** Answer shape sent to the server, per question type. */
export function isAnswerComplete(q: CertExamQuestion, answer: unknown): boolean {
  switch (q.question_type) {
    case "multiple_select":
    case "scenario_multiple_select":
    case "record_review":
      return Array.isArray(answer) && answer.length > 0;
    case "ordering":
      return Array.isArray(answer) && answer.length === q.options.length;
    case "classification": {
      const buckets = certClassificationBuckets(q).labels;
      if (buckets.length === 0) return false;
      return (
        typeof answer === "object" &&
        answer !== null &&
        q.options.every((o) => buckets.includes(String((answer as Record<string, string>)[o] ?? "")))
      );
    }
    default:
      return typeof answer === "string" && answer.length > 0;
  }
}

/**
 * Classification buckets for an exam question: always the labels the server
 * derived from that question's own answer map, never a global vocabulary.
 */
export function certClassificationBuckets(q: CertExamQuestion): { labels: string[]; derived: boolean } {
  return classificationBucketsFor(q.classification_labels ?? null);
}

/** Legacy fallback vocabulary, used only when a question is misconfigured. */
export const CLASSIFICATION_BUCKETS = FALLBACK_CLASSIFICATION_BUCKETS;

