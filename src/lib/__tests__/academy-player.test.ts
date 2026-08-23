import { describe, expect, it } from "vitest";
import {
  MISSION_PLAYER_V2_KIND,
  MISSION_PLAYER_V2_STATE_KEY,
  canFinishMission,
  emptyPlayerState,
  isApplyDraftSaved,
  isChoiceCorrect,
  isMissionPlayerV2,
  isReasoningCorrect,
  journeyProgress,
  mergePlayerState,
  parseMissionExperience,
  readPlayerState,
  resumeStepIndex,
  validateMissionExperience,
  type MissionExperienceV2,
} from "@/lib/academy-player";
import missionThree from "../../../docs/academy/module-5-mission-3-first-touch.v2.json";

const experience: MissionExperienceV2 = {
  kind: MISSION_PLAYER_V2_KIND,
  version: 1,
  title: "Test mission",
  steps: [
    { id: "s1", type: "hook", title: "Hook" },
    {
      id: "s2",
      type: "knowledge-check",
      title: "Check",
      options: [
        { id: "a", text: "Wrong" },
        { id: "b", text: "Right", correct: true },
      ],
    },
    {
      id: "s3",
      type: "apply",
      title: "Apply",
      requireAccountName: true,
      fields: [{ id: "opening", label: "Opening line" }],
    },
  ],
};

describe("validateMissionExperience", () => {
  it("accepts a well-formed experience", () => {
    const result = validateMissionExperience(experience);
    expect(result.ok).toBe(true);
  });

  it("rejects a wrong kind", () => {
    const result = validateMissionExperience({ ...experience, kind: "something-else" });
    expect(result.ok).toBe(false);
  });

  it("rejects missing or duplicate step ids", () => {
    const dup = { ...experience, steps: [experience.steps[0], experience.steps[0]] };
    expect(validateMissionExperience(dup).ok).toBe(false);
    expect(validateMissionExperience({ ...experience, steps: [] }).ok).toBe(false);
  });

  it("rejects an unknown step type", () => {
    const bad = { ...experience, steps: [{ id: "x", type: "quiz", title: "X" }] };
    expect(validateMissionExperience(bad).ok).toBe(false);
  });

  it("only activates for the v2 kind", () => {
    expect(isMissionPlayerV2(experience)).toBe(true);
    expect(isMissionPlayerV2(null)).toBe(false);
    expect(isMissionPlayerV2({ kind: "legacy" })).toBe(false);
    expect(parseMissionExperience({ kind: "legacy" })).toBeNull();
    expect(parseMissionExperience(experience)?.title).toBe("Test mission");
  });

  it("validates the authored Module 5 / Mission 3 journey", () => {
    const result = validateMissionExperience(missionThree);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.experience.steps.length).toBeGreaterThan(5);
      expect(result.experience.steps.some((s) => s.type === "apply")).toBe(true);
    }
  });
});

describe("namespaced state", () => {
  it("returns an empty state for unrelated checklist payloads", () => {
    expect(readPlayerState({ "block#0": true })).toEqual(emptyPlayerState());
    expect(readPlayerState(null)).toEqual(emptyPlayerState());
  });

  it("preserves legacy markdown checklist keys when merging", () => {
    const merged = mergePlayerState({ "block#0": true }, { started: true });
    expect(merged["block#0"]).toBe(true);
    expect(readPlayerState(merged).started).toBe(true);
  });

  it("merges patches without dropping earlier answers", () => {
    let state: unknown = {};
    state = mergePlayerState(state, { choices: { s2: "b" }, completed: ["s2"] });
    state = mergePlayerState(state, { notes: { s4: "note" }, completed: ["s4"] });
    const read = readPlayerState(state);
    expect(read.choices).toEqual({ s2: "b" });
    expect(read.notes).toEqual({ s4: "note" });
    expect(read.completed).toEqual(["s2", "s4"]);
    expect(Object.keys(state as object)).toContain(MISSION_PLAYER_V2_STATE_KEY);
  });

  it("ignores malformed persisted values", () => {
    const read = readPlayerState({ [MISSION_PLAYER_V2_STATE_KEY]: { choices: { a: 3 }, completed: "nope" } });
    expect(read.choices).toEqual({});
    expect(read.completed).toEqual([]);
  });
});

describe("journey logic", () => {
  it("resumes at the saved step and clamps unknown ids", () => {
    const state = { ...emptyPlayerState(), currentStepId: "s3" };
    expect(resumeStepIndex(experience, state)).toBe(2);
    expect(resumeStepIndex(experience, { ...emptyPlayerState(), currentStepId: "ghost" })).toBe(0);
  });

  it("reports progress from completed steps", () => {
    expect(journeyProgress(experience, emptyPlayerState())).toBe(0);
    expect(journeyProgress(experience, { ...emptyPlayerState(), completed: ["s1", "s2", "s3"] })).toBe(100);
  });

  it("grades choices and reasoning", () => {
    expect(isChoiceCorrect(experience.steps[1], "b")).toBe(true);
    expect(isChoiceCorrect(experience.steps[1], "a")).toBe(false);
    expect(isChoiceCorrect(experience.steps[1], undefined)).toBe(false);

    const scenario = {
      id: "sc",
      type: "scenario" as const,
      title: "Scenario",
      reasoningOptions: [
        { id: "r1", text: "yes", correct: true },
        { id: "r2", text: "no" },
      ],
    };
    expect(isReasoningCorrect(scenario, ["r1"])).toBe(true);
    expect(isReasoningCorrect(scenario, ["r1", "r2"])).toBe(false);
  });

  it("requires a saved apply draft before completion", () => {
    const done = { ...emptyPlayerState(), completed: ["s1", "s2", "s3"] };
    expect(isApplyDraftSaved(experience, done)).toBe(false);
    expect(canFinishMission(experience, done)).toBe(false);

    const withDraft = {
      ...done,
      apply: { account: "Acme", values: { opening: "Hi" }, saved_at: "2026-01-01T00:00:00Z" },
    };
    expect(isApplyDraftSaved(experience, withDraft)).toBe(true);
    expect(canFinishMission(experience, withDraft)).toBe(true);

    const missingField = { ...withDraft, apply: { ...withDraft.apply, values: { opening: "  " } } };
    expect(isApplyDraftSaved(experience, missingField)).toBe(false);
  });
});
