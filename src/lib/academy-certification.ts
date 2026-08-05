/**
 * Partner Academy — Module Certification, pure domain helpers.
 *
 * Every authoritative decision (eligibility, generation, scoring, retake
 * windows, issuing) happens in server functions. This module only formats and
 * interprets what the server returns.
 */

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

export interface CertEligibility {
  state: CertificationState;
  required_total: number;
  required_done: number;
  missing_items: Array<{ id: string; title: string; slug: string }>;
  active_attempt_id: string | null;
  next_attempt_at: string | null;
  last_attempt_id: string | null;
  attempts_used: number;
  certification: {
    id: string;
    score: number;
    scenario_score: number;
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
  scenario_score: number;
  category_scores: Record<string, CertCategoryScore>;
  submitted_at: string | null;
  next_attempt_at: string | null;
  total_questions: number;
  weak_areas: Array<{ mission_id: string; title: string; slug: string; missed: number }>;
  certification: {
    id: string;
    certificate_reference: string;
    issued_at: string;
    score: number;
    scenario_score: number;
  } | null;
}

/** Mirrors the server rule: both thresholds are mandatory. */
export function certificationPasses(weighted: number, scenario: number): boolean {
  return weighted >= CERT_PASS_SCORE && scenario >= CERT_SCENARIO_PASS_SCORE;
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
    case "classification":
      return (
        typeof answer === "object" &&
        answer !== null &&
        q.options.every((o) => Boolean((answer as Record<string, string>)[o]))
      );
    default:
      return typeof answer === "string" && answer.length > 0;
  }
}

/** Buckets offered for classification questions (Module 5 decision vocabulary). */
export const CLASSIFICATION_BUCKETS = ["Qualify", "Nurture", "Disqualify"] as const;
