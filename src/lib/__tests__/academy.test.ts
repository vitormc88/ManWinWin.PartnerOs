import { describe, expect, it } from "vitest";
import {
  actionLabel,
  countableMissions,
  deriveModuleStatus,
  formatDuration,
  moduleProgressPct,
  nextMission,
  parseContentBlocks,
  simpleStatus,
  type AcademyMission,
} from "@/lib/academy";

const mission = (over: Partial<AcademyMission>): AcademyMission => ({
  id: "m1",
  module_id: "mod",
  mission_number: 1,
  title: "T",
  slug: "t",
  short_description: null,
  estimated_duration_minutes: 10,
  content_markdown: null,
  item_kind: "mission",
  is_locked: false,
  sort_order: 1,
  is_required: true,
  status: "published",
  version: 1,
  ...over,
});

describe("academy progress", () => {
  it("ignores locked and unpublished items", () => {
    const list = [
      mission({ id: "a" }),
      mission({ id: "b", is_locked: true }),
      mission({ id: "c", status: "draft" }),
    ];
    expect(countableMissions(list).map((m) => m.id)).toEqual(["a"]);
    expect(moduleProgressPct(list, new Set(["a"]))).toBe(100);
  });

  it("computes partial progress", () => {
    const list = [mission({ id: "a" }), mission({ id: "b" }), mission({ id: "c" })];
    expect(moduleProgressPct(list, new Set(["a"]))).toBe(33);
    expect(moduleProgressPct(list, new Set())).toBe(0);
  });

  it("maps internal status to simple UI status", () => {
    expect(simpleStatus("not_started")).toBe("Not Started");
    expect(simpleStatus("ready_for_certification")).toBe("In Progress");
    expect(simpleStatus("certification_failed")).toBe("In Progress");
    expect(simpleStatus("certified")).toBe("Completed");
    expect(simpleStatus(undefined)).toBe("Not Started");
  });

  it("derives module status and action label from percentage", () => {
    expect(deriveModuleStatus(0)).toBe("not_started");
    expect(deriveModuleStatus(50)).toBe("in_progress");
    expect(deriveModuleStatus(100)).toBe("certified");
    expect(actionLabel(0)).toBe("Start");
    expect(actionLabel(40)).toBe("Continue");
    expect(actionLabel(100)).toBe("Review");
  });

  it("suggests the first incomplete unlocked mission", () => {
    const list = [
      mission({ id: "a", sort_order: 1, slug: "a" }),
      mission({ id: "b", sort_order: 2, slug: "b" }),
    ];
    expect(nextMission(list, new Set(["a"]))?.id).toBe("b");
    expect(nextMission(list, new Set(["a", "b"]))?.id).toBe("a");
  });

  it("formats durations", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(90)).toBe("1h 30min");
    expect(formatDuration(120)).toBe("2h");
  });
});

describe("content callouts", () => {
  it("parses known callouts and keeps surrounding text", () => {
    const blocks = parseContentBlocks("Intro\n\n:::best-practice\nDo this\n:::\n\nOutro");
    expect(blocks).toEqual([
      { type: "text", text: "Intro" },
      { type: "callout", kind: "best-practice", text: "Do this" },
      { type: "text", text: "Outro" },
    ]);
  });

  it("preserves unknown callout kinds as text", () => {
    const blocks = parseContentBlocks(":::mystery\nhidden\n:::");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
    expect((blocks[0] as { text: string }).text).toContain("hidden");
  });

  it("returns nothing for empty content", () => {
    expect(parseContentBlocks(null)).toEqual([]);
  });
});
