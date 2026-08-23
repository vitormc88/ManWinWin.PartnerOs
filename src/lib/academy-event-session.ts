/**
 * Tab-scoped session + idempotency store for Partner Academy learning events.
 *
 * Why sessionStorage and not a ref: refs die with the component, so a real
 * remount (route change back to the mission, React StrictMode double-mount,
 * a re-render triggered by a refetch) would mint a new session id and re-emit
 * "once per session" events such as mission_started / step_viewed.
 *
 * Privacy: the record holds ONLY a random session id and machine-shaped
 * dedupe keys (event name | step id | option id) mapped to random UUIDs.
 * No learner text, notes, drafts, names or identifiers are ever stored, and
 * sessionStorage is per browser tab, cleared when the tab closes.
 */

export interface LearningEventSession {
  /** Random, tab-scoped id — meaningless outside this tab. */
  id: string;
  /** dedupe key -> client_event_id, so retries stay idempotent server-side. */
  sent: Record<string, string>;
}

const PREFIX = "academy.le.";
/** Hard cap so a long session cannot grow the record without bound. */
const MAX_SENT_KEYS = 400;

export function randomId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function sessionStorageKey(missionId: string, moduleId: string): string {
  return `${PREFIX}${missionId}:${moduleId}`;
}

function store(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null; // private mode / blocked storage — degrade to in-memory
  }
}

const memory = new Map<string, LearningEventSession>();

function isSession(value: unknown): value is LearningEventSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !v.id) return false;
  if (!v.sent || typeof v.sent !== "object" || Array.isArray(v.sent)) return false;
  return Object.values(v.sent as Record<string, unknown>).every((x) => typeof x === "string");
}

/**
 * Returns the tab's session for this mission, creating it on first use.
 * Stable across remounts within the same tab.
 */
export function loadEventSession(missionId: string, moduleId: string): LearningEventSession {
  const key = sessionStorageKey(missionId, moduleId);
  const s = store();
  if (s) {
    try {
      const raw = s.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isSession(parsed)) return parsed;
      }
    } catch {
      /* corrupt or unreadable — fall through and start a fresh session */
    }
  }
  const existing = memory.get(key);
  if (existing) return existing;
  const fresh: LearningEventSession = { id: randomId(), sent: {} };
  saveEventSession(missionId, moduleId, fresh);
  return fresh;
}

export function saveEventSession(
  missionId: string,
  moduleId: string,
  session: LearningEventSession
): void {
  const key = sessionStorageKey(missionId, moduleId);
  memory.set(key, session);
  const s = store();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(session));
  } catch {
    /* quota or blocked storage — the in-memory copy still de-duplicates */
  }
}

/**
 * Resolves the `client_event_id` for a dedupe key.
 *
 * - already seen  -> `{ clientEventId, alreadySent: true }` (same id, so a
 *   replay hits the unique index instead of writing a near-duplicate row);
 * - new key       -> a fresh random id, persisted for the tab session.
 */
export function rememberEvent(
  missionId: string,
  moduleId: string,
  dedupeKey: string
): { clientEventId: string; alreadySent: boolean; sessionId: string } {
  const session = loadEventSession(missionId, moduleId);
  const known = session.sent[dedupeKey];
  if (known) return { clientEventId: known, alreadySent: true, sessionId: session.id };

  const clientEventId = randomId();
  const sent = { ...session.sent, [dedupeKey]: clientEventId };
  const keys = Object.keys(sent);
  if (keys.length > MAX_SENT_KEYS) {
    for (const k of keys.slice(0, keys.length - MAX_SENT_KEYS)) delete sent[k];
  }
  saveEventSession(missionId, moduleId, { ...session, sent });
  return { clientEventId, alreadySent: false, sessionId: session.id };
}

/** Test/debug helper — never called by the player. */
export function clearEventSession(missionId: string, moduleId: string): void {
  const key = sessionStorageKey(missionId, moduleId);
  memory.delete(key);
  try {
    store()?.removeItem(key);
  } catch {
    /* ignore */
  }
}
