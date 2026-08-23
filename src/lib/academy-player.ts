/**
 * Academy Mission Player v2 — pure data model, validation and state helpers.
 *
 * The v2 experience is data-driven: it is stored in the existing
 * `academy_missions.content_json` column and only activates when
 * `kind === "academy-learning-experience-v2"`. Everything else keeps the
 * legacy markdown player untouched.
 *
 * Learner state is namespaced inside the existing
 * `academy_mission_progress.checklist_state` jsonb under `__missionPlayerV2`,
 * so no parallel progress/analytics/completion system is introduced. All
 * unrelated keys (legacy markdown checklist ids, future namespaces) are
 * preserved on every merge.
 */

export const MISSION_PLAYER_V2_KIND = "academy-learning-experience-v2";
export const MISSION_PLAYER_V2_STATE_KEY = "__missionPlayerV2";

export const PLAYER_STEP_TYPES = [
  "hook",
  "challenge",
  "learn",
  "knowledge-check",
  "interactive-framework",
  "scenario",
  "ai-moment",
  "takeaway",
  "apply",
] as const;

export type PlayerStepType = (typeof PLAYER_STEP_TYPES)[number];

export interface PlayerOption {
  id: string;
  /** Optional short label shown above the option body (e.g. "Brochure"). */
  label?: string;
  text: string;
  correct?: boolean;
  feedback?: string;
}

/**
 * Optional Asset Library references.
 *
 * Media is never inlined as a URL: content stores only an `asset_key` that is
 * resolved against the existing `academy_assets` table (published rows only).
 * When the key is missing, draft or unresolvable, the player keeps its current
 * polished placeholder — content stays valid either way.
 */
export interface PlayerMediaRefs {
  /** `academy_assets.asset_key` of the primary media file. */
  assetKey?: string;
  /** Optional poster/thumbnail asset (video only). */
  posterAssetKey?: string;
  /** Optional WebVTT captions asset. */
  captionsAssetKey?: string;
  /** Authored transcript shown next to the player (accessibility). */
  transcript?: string;
}

export interface PlayerVideo extends PlayerMediaRefs {
  duration: string;
  label: string;
}


export interface PlayerFrameworkItem {
  id: string;
  title: string;
  question: string;
  detail?: string;
}

export interface PlayerApplyField {
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

export interface PlayerStep {
  id: string;
  type: PlayerStepType;
  title: string;
  /** Short label used in the Journey rail; falls back to `title`. */
  navLabel?: string;
  scenario?: string;
  body?: string;
  intro?: string;
  prompt?: string;
  rule?: string;
  quote?: string;
  insight?: string;
  bullets?: string[];
  video?: PlayerVideo;
  options?: PlayerOption[];
  items?: PlayerFrameworkItem[];
  reasoningPrompt?: string;
  reasoningOptions?: PlayerOption[];
  reasoningFeedback?: string;
  correctFeedback?: string;
  incorrectFeedback?: string;
  /** Free-text capture (takeaway note / AI draft). */
  noteLabel?: string;
  notePlaceholder?: string;
  saveLabel?: string;
  requireAccountName?: boolean;
  accountLabel?: string;
  fields?: PlayerApplyField[];
  /** Optional Asset Library image for this step (e.g. the Takeaway card). */
  assetKey?: string;
  assetCaption?: string;
  assetAlt?: string;
}

export interface PlayerAudioBrief extends PlayerMediaRefs {
  title: string;
  duration: string;
  /** Legacy marker; when an `assetKey` resolves, real audio is rendered. */
  status?: "coming-soon" | "available";
}


export interface MissionExperienceV2 {
  kind: typeof MISSION_PLAYER_V2_KIND;
  version: number;
  title: string;
  subtitle?: string;
  intro?: {
    eyebrow?: string;
    headline?: string;
    description?: string;
    bullets?: string[];
    startLabel?: string;
  };
  audioBrief?: PlayerAudioBrief;
  deepDiveTitle?: string;
  steps: PlayerStep[];
}

// ── Validation ────────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true; experience: MissionExperienceV2 }
  | { ok: false; errors: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Asset keys used by the player are namespaced (e.g. `academy.m5m3.audio-brief`)
 * so dots are allowed on top of the Asset Library slug characters.
 */
export function isValidMediaAssetKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{1,79}$/.test(value);
}

const MEDIA_KEY_FIELDS = ["assetKey", "posterAssetKey", "captionsAssetKey"] as const;

/** Validates the optional Asset Library references on any container object. */
function validateMediaRefs(raw: Record<string, unknown>, where: string, errors: string[]): void {
  for (const field of MEDIA_KEY_FIELDS) {
    const value = raw[field];
    if (value === undefined || value === null) continue;
    if (!isValidMediaAssetKey(value)) {
      errors.push(`${where}.${field}: must be a valid asset key (a-z, 0-9, dot, dash, underscore)`);
    }
  }
  if (raw.transcript !== undefined && typeof raw.transcript !== "string") {
    errors.push(`${where}.transcript: must be a string`);
  }
}



function validateOptions(
  raw: unknown,
  where: string,
  errors: string[],
  { requireCorrect }: { requireCorrect: boolean }
): void {
  if (!Array.isArray(raw) || raw.length < 2) {
    errors.push(`${where}: needs at least 2 options`);
    return;
  }
  const ids = new Set<string>();
  let correct = 0;
  raw.forEach((o, i) => {
    if (!isRecord(o)) {
      errors.push(`${where}[${i}]: must be an object`);
      return;
    }
    if (typeof o.id !== "string" || !o.id.trim()) errors.push(`${where}[${i}]: "id" is required`);
    else if (ids.has(o.id)) errors.push(`${where}[${i}]: duplicate option id "${o.id}"`);
    else ids.add(o.id);
    if (typeof o.text !== "string" || !o.text.trim()) errors.push(`${where}[${i}]: "text" is required`);
    if (o.correct === true) correct++;
  });
  if (requireCorrect && correct < 1) errors.push(`${where}: at least one option must be correct`);
}

/** Strict runtime validation of a `content_json` payload. */
export function validateMissionExperience(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ["Content must be a JSON object"] };
  if (raw.kind !== MISSION_PLAYER_V2_KIND) {
    return { ok: false, errors: [`"kind" must be "${MISSION_PLAYER_V2_KIND}"`] };
  }
  if (typeof raw.version !== "number" || !Number.isFinite(raw.version)) {
    errors.push('"version" must be a number');
  }
  if (typeof raw.title !== "string" || !raw.title.trim()) errors.push('"title" is required');

  const steps = raw.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    errors.push('"steps" must be a non-empty array');
  } else {
    const ids = new Set<string>();
    steps.forEach((s, i) => {
      const where = `steps[${i}]`;
      if (!isRecord(s)) {
        errors.push(`${where}: must be an object`);
        return;
      }
      if (typeof s.id !== "string" || !s.id.trim()) errors.push(`${where}: "id" is required`);
      else if (ids.has(s.id)) errors.push(`${where}: duplicate step id "${s.id}"`);
      else ids.add(s.id);

      if (typeof s.type !== "string" || !(PLAYER_STEP_TYPES as readonly string[]).includes(s.type)) {
        errors.push(`${where}: unknown step type "${String(s.type)}"`);
        return;
      }
      if (typeof s.title !== "string" || !s.title.trim()) errors.push(`${where}: "title" is required`);
      if (s.bullets !== undefined && !isStringArray(s.bullets)) {
        errors.push(`${where}: "bullets" must be an array of strings`);
      }
      if (s.assetKey !== undefined && s.assetKey !== null && !isValidMediaAssetKey(s.assetKey)) {
        errors.push(`${where}.assetKey: must be a valid asset key`);
      }
      if (isRecord(s.video)) validateMediaRefs(s.video, `${where}.video`, errors);


      switch (s.type) {
        case "challenge":
        case "knowledge-check":
        case "scenario":
          validateOptions(s.options, `${where}.options`, errors, { requireCorrect: true });
          if (s.type === "scenario" && s.reasoningOptions !== undefined) {
            validateOptions(s.reasoningOptions, `${where}.reasoningOptions`, errors, {
              requireCorrect: true,
            });
          }
          break;
        case "interactive-framework": {
          const items = s.items;
          if (!Array.isArray(items) || items.length === 0) {
            errors.push(`${where}: "items" must be a non-empty array`);
          } else {
            items.forEach((it, j) => {
              if (!isRecord(it)) {
                errors.push(`${where}.items[${j}]: must be an object`);
                return;
              }
              if (typeof it.id !== "string" || !it.id.trim())
                errors.push(`${where}.items[${j}]: "id" is required`);
              if (typeof it.title !== "string" || !it.title.trim())
                errors.push(`${where}.items[${j}]: "title" is required`);
              if (typeof it.question !== "string" || !it.question.trim())
                errors.push(`${where}.items[${j}]: "question" is required`);
            });
          }
          break;
        }
        case "apply": {
          const fields = s.fields;
          if (!Array.isArray(fields) || fields.length === 0) {
            errors.push(`${where}: "fields" must be a non-empty array`);
          } else {
            const fieldIds = new Set<string>();
            fields.forEach((f, j) => {
              if (!isRecord(f)) {
                errors.push(`${where}.fields[${j}]: must be an object`);
                return;
              }
              if (typeof f.id !== "string" || !f.id.trim())
                errors.push(`${where}.fields[${j}]: "id" is required`);
              else if (fieldIds.has(f.id))
                errors.push(`${where}.fields[${j}]: duplicate field id "${f.id}"`);
              else fieldIds.add(f.id);
              if (typeof f.label !== "string" || !f.label.trim())
                errors.push(`${where}.fields[${j}]: "label" is required`);
            });
          }
          break;
        }
        default:
          break;
      }
    });
  }

  if (isRecord(raw.audioBrief)) validateMediaRefs(raw.audioBrief, "audioBrief", errors);

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, experience: raw as unknown as MissionExperienceV2 };
}

/** True when a mission row carries a valid v2 experience. */
export function isMissionPlayerV2(contentJson: unknown): boolean {
  if (!isRecord(contentJson) || contentJson.kind !== MISSION_PLAYER_V2_KIND) return false;
  return validateMissionExperience(contentJson).ok;
}

/** Returns the validated experience, or null when v2 is not applicable. */
export function parseMissionExperience(contentJson: unknown): MissionExperienceV2 | null {
  if (!isRecord(contentJson) || contentJson.kind !== MISSION_PLAYER_V2_KIND) return null;
  const result = validateMissionExperience(contentJson);
  return result.ok ? result.experience : null;
}

// ── Learner state ─────────────────────────────────────────────────────────

export interface ApplyDraft {
  account?: string;
  values?: Record<string, string>;
  saved_at?: string;
}

export interface MissionPlayerV2State {
  version: 1;
  started: boolean;
  currentStepId: string | null;
  /** Step id → selected option id. */
  choices: Record<string, string>;
  /** Scenario step id → selected reasoning option ids. */
  reasoning: Record<string, string[]>;
  /** Step id → free-text note (takeaway, AI draft). */
  notes: Record<string, string>;
  /** Step ids the learner has completed/confirmed. */
  completed: string[];
  apply: ApplyDraft;
}

export function emptyPlayerState(): MissionPlayerV2State {
  return {
    version: 1,
    started: false,
    currentStepId: null,
    choices: {},
    reasoning: {},
    notes: {},
    completed: [],
    apply: {},
  };
}

type RawState = Record<string, unknown>;

const stringRecord = (v: unknown): Record<string, string> => {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === "string") out[k] = val;
  return out;
};

/** Reads the namespaced player state out of an arbitrary checklist_state. */
export function readPlayerState(checklistState: unknown): MissionPlayerV2State {
  const base = emptyPlayerState();
  if (!isRecord(checklistState)) return base;
  const raw = checklistState[MISSION_PLAYER_V2_STATE_KEY];
  if (!isRecord(raw)) return base;

  const reasoning: Record<string, string[]> = {};
  if (isRecord(raw.reasoning)) {
    for (const [k, val] of Object.entries(raw.reasoning)) {
      if (isStringArray(val)) reasoning[k] = val;
    }
  }

  const applyRaw = isRecord(raw.apply) ? (raw.apply as RawState) : {};
  const apply: ApplyDraft = {
    account: typeof applyRaw.account === "string" ? applyRaw.account : undefined,
    values: stringRecord(applyRaw.values),
    saved_at: typeof applyRaw.saved_at === "string" ? applyRaw.saved_at : undefined,
  };

  return {
    version: 1,
    started: raw.started === true,
    currentStepId: typeof raw.currentStepId === "string" ? raw.currentStepId : null,
    choices: stringRecord(raw.choices),
    reasoning,
    notes: stringRecord(raw.notes),
    completed: isStringArray(raw.completed) ? raw.completed : [],
    apply,
  };
}

/**
 * Merges a player-state patch back into checklist_state, preserving every
 * unrelated key (legacy markdown checklist ids and any other namespace).
 */
export function mergePlayerState(
  checklistState: unknown,
  patch: Partial<MissionPlayerV2State>
): Record<string, unknown> {
  const existingOuter: Record<string, unknown> = isRecord(checklistState)
    ? { ...checklistState }
    : {};
  const current = readPlayerState(checklistState);
  const next: MissionPlayerV2State = {
    ...current,
    ...patch,
    version: 1,
    choices: { ...current.choices, ...(patch.choices ?? {}) },
    reasoning: { ...current.reasoning, ...(patch.reasoning ?? {}) },
    notes: { ...current.notes, ...(patch.notes ?? {}) },
    completed: Array.from(new Set([...current.completed, ...(patch.completed ?? [])])),
    apply: patch.apply ? { ...current.apply, ...patch.apply } : current.apply,
  };
  existingOuter[MISSION_PLAYER_V2_STATE_KEY] = next as unknown as Record<string, unknown>;
  return existingOuter;
}

/**
 * Reconciles a freshly fetched server checklist_state with the local mirror.
 *
 * A refetch can land before an in-flight write is visible, so a plain replace
 * would drop just-completed steps. The union below keeps every server key,
 * prefers local values for unrelated keys, and unions the player state so no
 * completion, note, choice or saved apply draft is ever lost.
 */
export function reconcileChecklistState(
  serverState: unknown,
  localState: unknown
): Record<string, unknown> {
  const local: Record<string, unknown> = isRecord(localState) ? localState : {};
  const server: Record<string, unknown> = isRecord(serverState) ? serverState : {};
  if (Object.keys(local).length === 0) return server;
  const base: Record<string, unknown> = { ...server, ...local };
  base[MISSION_PLAYER_V2_STATE_KEY] = server[MISSION_PLAYER_V2_STATE_KEY];
  return mergePlayerState(base, readPlayerState(local));
}

// ── Journey progress ──────────────────────────────────────────────────────

export function stepIds(experience: MissionExperienceV2): string[] {
  return experience.steps.map((s) => s.id);
}

/** Index of the step to resume on; always inside bounds and deterministic. */
export function resumeStepIndex(
  experience: MissionExperienceV2,
  state: MissionPlayerV2State
): number {
  const ids = stepIds(experience);
  if (state.currentStepId) {
    const idx = ids.indexOf(state.currentStepId);
    if (idx >= 0) return idx;
  }
  const firstIncomplete = ids.findIndex((id) => !state.completed.includes(id));
  return firstIncomplete >= 0 ? firstIncomplete : Math.max(0, ids.length - 1);
}

/** Deterministic 0-100 journey progress based on completed steps only. */
export function journeyProgress(
  experience: MissionExperienceV2,
  state: MissionPlayerV2State
): number {
  const ids = stepIds(experience);
  if (ids.length === 0) return 0;
  const done = ids.filter((id) => state.completed.includes(id)).length;
  return Math.round((done / ids.length) * 100);
}

export function isStepComplete(state: MissionPlayerV2State, stepId: string): boolean {
  return state.completed.includes(stepId);
}

/** The Apply draft must be saved before the mission can be finished. */
export function applyStep(experience: MissionExperienceV2): PlayerStep | undefined {
  return experience.steps.find((s) => s.type === "apply");
}

export function isApplyDraftSaved(
  experience: MissionExperienceV2,
  state: MissionPlayerV2State
): boolean {
  const step = applyStep(experience);
  if (!step) return true;
  if (!state.apply.saved_at) return false;
  if (step.requireAccountName && !(state.apply.account ?? "").trim()) return false;
  const values = state.apply.values ?? {};
  return (step.fields ?? [])
    .filter((f) => f.required !== false)
    .every((f) => (values[f.id] ?? "").trim().length > 0);
}

/** Every step answered/confirmed and the Apply draft saved. */
export function canFinishMission(
  experience: MissionExperienceV2,
  state: MissionPlayerV2State
): boolean {
  return (
    stepIds(experience).every((id) => state.completed.includes(id)) &&
    isApplyDraftSaved(experience, state)
  );
}

export function optionById(step: PlayerStep, optionId: string | undefined): PlayerOption | undefined {
  if (!optionId) return undefined;
  return (step.options ?? []).find((o) => o.id === optionId);
}

export function isChoiceCorrect(step: PlayerStep, optionId: string | undefined): boolean {
  return optionById(step, optionId)?.correct === true;
}

/** Reasoning selection is correct when exactly the correct options are picked. */
export function isReasoningCorrect(step: PlayerStep, selected: string[] | undefined): boolean {
  const options = step.reasoningOptions ?? [];
  if (options.length === 0) return true;
  const picked = new Set(selected ?? []);
  return options.every((o) => picked.has(o.id) === (o.correct === true));
}

export const STEP_TYPE_LABELS: Record<PlayerStepType, string> = {
  hook: "Hook",
  challenge: "Challenge",
  learn: "Learn",
  "knowledge-check": "Knowledge Check",
  "interactive-framework": "Framework",
  scenario: "Scenario",
  "ai-moment": "AI Moment",
  takeaway: "Takeaway",
  apply: "Apply",
};
