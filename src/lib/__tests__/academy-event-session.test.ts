import { beforeEach, describe, expect, it } from "vitest";
import {
  clearEventSession,
  loadEventSession,
  rememberEvent,
  sessionStorageKey,
} from "@/lib/academy-event-session";
import { eventDedupeKey } from "@/lib/academy-events";

const MISSION = "11111111-1111-4111-8111-111111111111";
const MODULE = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  sessionStorage.clear();
  clearEventSession(MISSION, MODULE);
});

describe("tab-scoped session id", () => {
  it("is stable across remounts (re-reads the same tab session)", () => {
    const first = loadEventSession(MISSION, MODULE).id;
    const second = loadEventSession(MISSION, MODULE).id;
    expect(second).toBe(first);
    expect(sessionStorage.getItem(sessionStorageKey(MISSION, MODULE))).toBeTruthy();
  });

  it("is per mission/module pair", () => {
    const a = loadEventSession(MISSION, MODULE).id;
    const b = loadEventSession(MISSION, "33333333-3333-4333-8333-333333333333").id;
    expect(a).not.toBe(b);
  });

  it("starts fresh in a new tab (empty sessionStorage)", () => {
    const first = loadEventSession(MISSION, MODULE).id;
    sessionStorage.clear();
    clearEventSession(MISSION, MODULE);
    expect(loadEventSession(MISSION, MODULE).id).not.toBe(first);
  });

  it("recovers from a corrupt record instead of throwing", () => {
    sessionStorage.setItem(sessionStorageKey(MISSION, MODULE), "{not json");
    expect(() => loadEventSession(MISSION, MODULE)).not.toThrow();
    expect(loadEventSession(MISSION, MODULE).id).toBeTruthy();
  });
});

describe("idempotency across remounts (StrictMode double-mount)", () => {
  it("reports the second identical emission as already sent, with the same client_event_id", () => {
    const key = eventDedupeKey("mission_started", null, null);
    const first = rememberEvent(MISSION, MODULE, key);
    const second = rememberEvent(MISSION, MODULE, key);

    expect(first.alreadySent).toBe(false);
    expect(second.alreadySent).toBe(true);
    expect(second.clientEventId).toBe(first.clientEventId);
    expect(second.sessionId).toBe(first.sessionId);
  });

  it("de-duplicates step views per step", () => {
    const hook = eventDedupeKey("step_viewed", "hook");
    const learn = eventDedupeKey("step_viewed", "learn");
    expect(rememberEvent(MISSION, MODULE, hook).alreadySent).toBe(false);
    expect(rememberEvent(MISSION, MODULE, hook).alreadySent).toBe(true);
    expect(rememberEvent(MISSION, MODULE, learn).alreadySent).toBe(false);
  });

  it("gives a changed answer a new client_event_id and de-dupes the same answer", () => {
    const answerA = eventDedupeKey("knowledge_check_answered", "s2", "a");
    const answerB = eventDedupeKey("knowledge_check_answered", "s2", "b");

    const a1 = rememberEvent(MISSION, MODULE, answerA);
    const b1 = rememberEvent(MISSION, MODULE, answerB);
    const a2 = rememberEvent(MISSION, MODULE, answerA);

    expect(b1.alreadySent).toBe(false);
    expect(b1.clientEventId).not.toBe(a1.clientEventId);
    expect(a2.alreadySent).toBe(true);
    expect(a2.clientEventId).toBe(a1.clientEventId);
  });

  it("stores no learner content — only ids and machine dedupe keys", () => {
    rememberEvent(MISSION, MODULE, eventDedupeKey("apply_completed", "apply"));
    const raw = sessionStorage.getItem(sessionStorageKey(MISSION, MODULE)) ?? "";
    expect(raw).not.toMatch(/[A-Za-z]+\s[A-Za-z]+/); // no sentences / names
    expect(raw).toContain("apply_completed|apply|-");
  });
});
