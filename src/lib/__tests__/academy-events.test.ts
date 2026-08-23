import { describe, expect, it } from "vitest";
import {
  LEARNING_EVENT_NAMES,
  eventDedupeKey,
  isLearningEventName,
  isSafeEventToken,
  mediaDurationBucket,
  mediaPositionBucket,
  sanitizeEventProperties,
} from "@/lib/academy-events";

describe("event names", () => {
  it("recognises only the allowed closed list", () => {
    for (const name of LEARNING_EVENT_NAMES) expect(isLearningEventName(name)).toBe(true);
    expect(isLearningEventName("mission_deleted")).toBe(false);
    expect(isLearningEventName(null)).toBe(false);
  });
});

describe("sanitizeEventProperties", () => {
  it("keeps whitelisted, bounded values", () => {
    expect(
      sanitizeEventProperties({
        option_id: "opt-b",
        correct: true,
        completion_pct: 70.456,
        reasoning_option_ids: ["r1", "r2"],
      })
    ).toEqual({
      option_id: "opt-b",
      correct: true,
      completion_pct: 70.46,
      reasoning_option_ids: ["r1", "r2"],
    });
  });

  it("drops any key that is not whitelisted", () => {
    const out = sanitizeEventProperties({
      note: "my private draft",
      account_name: "Atlas Foods",
      email: "a@b.com",
      option_id: "a",
    });
    expect(out).toEqual({ option_id: "a" });
  });

  it("drops free-text values even under a whitelisted key", () => {
    expect(sanitizeEventProperties({ source: "I met Jane at ACME Corp." })).toEqual({});
    expect(sanitizeEventProperties({ asset_key: "academy.m5m3.audio-brief" })).toEqual({
      asset_key: "academy.m5m3.audio-brief",
    });
  });

  it("never throws on hostile input", () => {
    expect(sanitizeEventProperties(null)).toEqual({});
    expect(sanitizeEventProperties("nope")).toEqual({});
    expect(sanitizeEventProperties([1, 2, 3])).toEqual({});
    expect(sanitizeEventProperties({ completion_pct: Number.NaN })).toEqual({});
  });

  it("bounds array values", () => {
    const many = Array.from({ length: 40 }, (_, i) => `r${i}`);
    const out = sanitizeEventProperties({ reasoning_option_ids: many });
    expect((out.reasoning_option_ids as string[]).length).toBe(10);
  });
});

describe("tokens and buckets", () => {
  it("accepts machine tokens and rejects sentences", () => {
    expect(isSafeEventToken("step-1")).toBe(true);
    expect(isSafeEventToken("academy.m5m3.takeaway")).toBe(true);
    expect(isSafeEventToken("Hello there")).toBe(false);
    expect(isSafeEventToken("A".repeat(200))).toBe(false);
  });

  it("buckets media position coarsely", () => {
    expect(mediaPositionBucket(0, 100)).toBe("0-25");
    expect(mediaPositionBucket(60, 100)).toBe("50-75");
    expect(mediaPositionBucket(100, 100)).toBe("100");
    expect(mediaPositionBucket(10, 0)).toBe("unknown");
  });

  it("buckets media duration coarsely", () => {
    expect(mediaDurationBucket(30)).toBe("lt-1m");
    expect(mediaDurationBucket(120)).toBe("1-3m");
    expect(mediaDurationBucket(400)).toBe("3-10m");
    expect(mediaDurationBucket(1200)).toBe("gt-10m");
    expect(mediaDurationBucket(undefined)).toBe("unknown");
  });

  it("builds stable dedupe keys", () => {
    expect(eventDedupeKey("step_viewed", "hook")).toBe("step_viewed|hook|-");
    expect(eventDedupeKey("step_viewed", "hook")).toBe(eventDedupeKey("step_viewed", "hook"));
    expect(eventDedupeKey("scenario_answered", "s1", "a")).not.toBe(
      eventDedupeKey("scenario_answered", "s1", "b")
    );
  });
});
