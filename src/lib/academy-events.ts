/**
 * Partner Academy — learning telemetry contract (pure, no I/O).
 *
 * The event log exists for internal QA and product visibility only. It is
 * deliberately privacy-first:
 *
 *  - the allowed event names are a closed list, mirrored by a DB CHECK;
 *  - properties are whitelisted, bounded and token-shaped — free text, draft
 *    content, notes, account names, e-mails and raw media URLs can never pass
 *    the sanitiser;
 *  - nothing here throws: tracking must never break learning or progress.
 *
 * Progress, completion and certification stay owned by
 * `academy_mission_progress` / `academy_complete_mission`. These events are
 * strictly additive observability.
 */

export const LEARNING_EVENT_NAMES = [
  "mission_started",
  "mission_resumed",
  "mission_completed",
  "step_viewed",
  "step_completed",
  "knowledge_check_answered",
  "scenario_answered",
  "video_started",
  "video_completed",
  "audio_started",
  "audio_completed",
  "deep_dive_opened",
  "deep_dive_closed",
  "apply_started",
  "apply_completed",
] as const;

export type LearningEventName = (typeof LEARNING_EVENT_NAMES)[number];

export function isLearningEventName(value: unknown): value is LearningEventName {
  return typeof value === "string" && (LEARNING_EVENT_NAMES as readonly string[]).includes(value);
}

/**
 * The only property keys ever persisted. Anything else is dropped silently so
 * a future caller cannot accidentally leak content.
 */
export const SAFE_EVENT_PROPERTY_KEYS = [
  "option_id",
  "reasoning_option_ids",
  "correct",
  "reasoning_correct",
  "asset_key",
  "media_kind",
  "media_ready",
  "position_bucket",
  "duration_bucket",
  "source",
  "completion_pct",
  "step_type",
  "step_index",
  "steps_total",
  "resumed",
  "fields_filled",
] as const;

export type SafeEventPropertyKey = (typeof SAFE_EVENT_PROPERTY_KEYS)[number];

export type SafeEventValue = string | number | boolean | string[];
export type LearningEventProperties = Partial<Record<SafeEventPropertyKey, SafeEventValue>>;

/** Bounded, machine-shaped identifiers only — no spaces, no sentences. */
const SAFE_TOKEN = /^[a-z0-9][a-z0-9._:-]{0,79}$/;

const MAX_ARRAY_ITEMS = 10;
const MAX_KEYS = 20;

export function isSafeEventToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value);
}

function sanitizeValue(value: unknown): SafeEventValue | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return Math.round(value * 100) / 100;
  }
  if (typeof value === "string") return isSafeEventToken(value) ? value : undefined;
  if (Array.isArray(value)) {
    const items = value.filter(isSafeEventToken).slice(0, MAX_ARRAY_ITEMS);
    return items.length > 0 ? items : undefined;
  }
  return undefined;
}

/**
 * Drops every key that is not whitelisted and every value that is not a safe
 * token / number / boolean. Always returns a plain object.
 */
export function sanitizeEventProperties(input: unknown): LearningEventProperties {
  const out: LearningEventProperties = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  let count = 0;
  for (const key of SAFE_EVENT_PROPERTY_KEYS) {
    if (!(key in (input as Record<string, unknown>))) continue;
    const value = sanitizeValue((input as Record<string, unknown>)[key]);
    if (value === undefined) continue;
    out[key] = value;
    if (++count >= MAX_KEYS) break;
  }
  return out;
}

/** Coarse media position bucket — never an exact timestamp. */
export function mediaPositionBucket(
  positionSeconds: number | null | undefined,
  durationSeconds: number | null | undefined
): string {
  const total = typeof durationSeconds === "number" && durationSeconds > 0 ? durationSeconds : 0;
  const at = typeof positionSeconds === "number" && positionSeconds > 0 ? positionSeconds : 0;
  if (total <= 0) return "unknown";
  const pct = Math.min(100, Math.max(0, (at / total) * 100));
  if (pct < 25) return "0-25";
  if (pct < 50) return "25-50";
  if (pct < 75) return "50-75";
  if (pct < 100) return "75-99";
  return "100";
}

/** Coarse length bucket for a media asset. */
export function mediaDurationBucket(durationSeconds: number | null | undefined): string {
  const d = typeof durationSeconds === "number" && durationSeconds > 0 ? durationSeconds : 0;
  if (d <= 0) return "unknown";
  if (d < 60) return "lt-1m";
  if (d < 180) return "1-3m";
  if (d < 600) return "3-10m";
  return "gt-10m";
}

/** Stable de-duplication key for "once per player session" events. */
export function eventDedupeKey(
  name: LearningEventName,
  stepId?: string | null,
  discriminator?: string | null
): string {
  return [name, stepId ?? "-", discriminator ?? "-"].join("|");
}

export const LEARNING_EVENT_LABELS: Record<LearningEventName, string> = {
  mission_started: "Mission started",
  mission_resumed: "Mission resumed",
  mission_completed: "Mission completed",
  step_viewed: "Step viewed",
  step_completed: "Step completed",
  knowledge_check_answered: "Knowledge check answered",
  scenario_answered: "Scenario answered",
  video_started: "Video started",
  video_completed: "Video completed",
  audio_started: "Audio started",
  audio_completed: "Audio completed",
  deep_dive_opened: "Deep Dive opened",
  deep_dive_closed: "Deep Dive closed",
  apply_started: "Apply started",
  apply_completed: "Apply completed",
};

/** Short, non-reversible-looking label for an internal QA table. */
export function anonymisedLearnerLabel(userId: string | null | undefined): string {
  if (!userId) return "Learner ——";
  return `Learner ${userId.slice(0, 8)}`;
}
