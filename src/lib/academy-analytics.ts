/**
 * Partner Academy — Learning Analytics (pure domain helpers).
 *
 * All aggregation happens server-side in SECURITY DEFINER RPCs; this module
 * only types, formats and exports what the server returns.
 */

export type AcademyAnalyticsPermission =
  | "academy_analytics_view"
  | "academy_attempt_detail_view"
  | "academy_correct_answers_view"
  | "academy_question_analytics_view";

export interface AcademyAnalyticsPerms {
  academy_analytics_view: boolean;
  academy_attempt_detail_view: boolean;
  academy_correct_answers_view: boolean;
  academy_question_analytics_view: boolean;
  is_academy_admin: boolean;
}

export interface AcademyAnalyticsFilters {
  partner_id?: string | null;
  user_id?: string | null;
  module_id?: string | null;
  certification_status?: "passed" | "not_passed" | null;
  country?: string | null;
  role?: string | null;
  date_from?: string | null;
  date_to?: string | null;
}

export function cleanFilters(f: AcademyAnalyticsFilters): Record<string, string> {
  const out: Record<string, string> = {};
  Object.entries(f).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "" && v !== "all") out[k] = String(v);
  });
  return out;
}

export interface OverviewPartnerRow {
  partner_id: string | null;
  partner_name: string;
  country: string | null;
  users: number;
  avg_progress: number;
  completed_modules: number;
  certifications_passed: number;
}

export interface OverviewModuleRow {
  module_id: string;
  title: string;
  slug: string;
  started: number;
  completed: number;
  avg_progress: number;
  certifications_passed: number;
  pass_rate: number;
}

export interface AcademyOverview {
  total_learners: number;
  total_active_learners: number;
  modules_started: number;
  modules_completed: number;
  certifications_passed: number;
  attempts_total: number;
  pass_rate: number;
  average_score: number;
  average_attempts_before_passing: number;
  inactive_7: number;
  inactive_14: number;
  inactive_30: number;
  by_partner: OverviewPartnerRow[];
  by_module: OverviewModuleRow[];
}

export interface PartnerAnalyticsRow {
  partner_id: string | null;
  partner_name: string;
  country: string | null;
  total_users: number;
  active_users: number;
  avg_progress: number;
  completed_modules: number;
  certifications_passed: number;
  pass_rate: number;
  last_activity: string | null;
  users_requiring_attention: number;
}

export interface LearnerRow {
  user_id: string;
  full_name: string;
  email: string | null;
  partner_id: string | null;
  partner_name: string;
  country: string | null;
  is_active: boolean;
  roles: string[];
  avg_progress: number;
  modules_completed: number;
  certifications_passed: number;
  attempts: number;
  last_activity: string | null;
}

export interface LearnerAttempt {
  attempt_id: string;
  module_id: string;
  module_title: string | null;
  attempt_number: number;
  status: string;
  passed: boolean | null;
  weighted_score: number | null;
  scenario_score: number | null;
  raw_score: number | null;
  category_scores: Record<string, { earned: number; total: number; pct: number }> | null;
  started_at: string | null;
  submitted_at: string | null;
  next_attempt_at: string | null;
  total_questions: number;
}

export interface LearnerProfile {
  user_id: string;
  full_name: string;
  email: string | null;
  partner_id: string | null;
  partner_name: string;
  country: string | null;
  roles: string[];
  last_activity: string | null;
  learning_minutes: number;
  modules: Array<{
    module_id: string;
    title: string;
    slug: string;
    status: string;
    progress_pct: number;
    started_at: string | null;
    completed_at: string | null;
    certified: boolean;
  }>;
  attempts: LearnerAttempt[];
  weak_missions: Array<{ mission_id: string; title: string; slug: string; missed: number }>;
  next_retake_at: string | null;
}

export interface AttemptQuestionDetail {
  position: number;
  question_id: string;
  question_code: string | null;
  question_text: string;
  scenario_text: string | null;
  category: string;
  question_type: string;
  difficulty: string;
  weight: number;
  mission_title: string | null;
  options: string[];
  selected_answer: unknown;
  is_correct: boolean;
  awarded_score: number;
  answered_at: string | null;
  response_seconds: number | null;
  correct_answer: unknown | null;
  explanation: string | null;
}

export interface AttemptDetail {
  attempt_id: string;
  user_id: string;
  learner_name: string | null;
  module_id: string;
  module_title: string | null;
  attempt_number: number;
  status: string;
  passed: boolean | null;
  raw_score: number | null;
  weighted_score: number | null;
  scenario_score: number | null;
  category_scores: Record<string, { earned: number; total: number; pct: number }> | null;
  started_at: string | null;
  submitted_at: string | null;
  next_attempt_at: string | null;
  reveals_correct_answers: boolean;
  questions: AttemptQuestionDetail[];
}

export interface QuestionAnalyticsRow {
  question_id: string;
  question_code: string | null;
  question_text: string;
  module_id: string;
  module_title: string | null;
  mission_title: string | null;
  category: string;
  question_type: string;
  difficulty: string;
  weight: number;
  status: string;
  updated_at: string | null;
  times_used: number;
  times_answered: number;
  correct_rate: number | null;
  incorrect_rate: number | null;
  avg_response_seconds: number | null;
  pass_correlation: {
    correct_in_passed: number;
    correct_in_failed: number;
    answered_in_passed: number;
    answered_in_failed: number;
  };
  option_distribution: Array<{ option: string; count: number }>;
}

/** Questions that look broken: nearly everyone fails, or nearly everyone passes. */
export type QuestionFlag = "too_hard" | "too_easy" | "low_signal" | "unused" | null;

export function questionFlag(q: QuestionAnalyticsRow): QuestionFlag {
  if (q.times_answered === 0) return "unused";
  if ((q.correct_rate ?? 0) < 20) return "too_hard";
  if ((q.correct_rate ?? 0) > 95) return "too_easy";
  const pc = q.pass_correlation;
  const passRate = pc.answered_in_passed > 0 ? pc.correct_in_passed / pc.answered_in_passed : 0;
  const failRate = pc.answered_in_failed > 0 ? pc.correct_in_failed / pc.answered_in_failed : 0;
  if (pc.answered_in_passed >= 5 && pc.answered_in_failed >= 5 && passRate - failRate < 0.05) return "low_signal";
  return null;
}

export const QUESTION_FLAG_LABELS: Record<Exclude<QuestionFlag, null>, string> = {
  too_hard: "Possibly too hard",
  too_easy: "Possibly too easy",
  low_signal: "Weak discrimination",
  unused: "Never answered",
};

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function inactivityBucket(iso: string | null | undefined): "active" | "7" | "14" | "30" | "never" {
  const d = daysSince(iso);
  if (d === null) return "never";
  if (d >= 30) return "30";
  if (d >= 14) return "14";
  if (d >= 7) return "7";
  return "active";
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatPct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${Math.round(v * 10) / 10}%`;
}

export function answerToText(value: unknown): string {
  if (value === null || value === undefined) return "No answer";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(" · ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k} → ${String(v)}`)
      .join(" · ");
  }
  return String(value);
}

/** RFC4180-ish CSV. */
export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (!rows.length) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) || (typeof v === "object" && v !== null) ? answerToText(v) : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
