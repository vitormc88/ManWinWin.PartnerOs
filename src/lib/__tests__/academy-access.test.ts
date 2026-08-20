import { describe, it, expect } from "vitest";
import {
  accessRowFor,
  isItemUnlocked,
  lockMessage,
  nextOpenItem,
  type ItemAccessMap,
} from "@/lib/academy-access";

const learnerStart: ItemAccessMap = {
  module_id: "m5",
  is_admin: false,
  all_required_done: false,
  items: [
    { mission_id: "intro", slug: "module-introduction", unlocked: true, reason: "open" },
    { mission_id: "m1", slug: "mission-1", unlocked: false, reason: "requires_previous_item", blocked_by: "Module Introduction" },
    { mission_id: "chk", slug: "qualification-checklist", unlocked: true, reason: "optional" },
    { mission_id: "cert", slug: "module-certification", unlocked: false, reason: "requires_all_learning_items", blocked_by: "Module Introduction" },
  ],
};

describe("academy sequencing (server-authoritative mirror)", () => {
  it("denies a direct route to an item the server has not unlocked", () => {
    expect(isItemUnlocked(learnerStart, "intro")).toBe(true);
    expect(isItemUnlocked(learnerStart, "m1")).toBe(false);
    expect(isItemUnlocked(learnerStart, "cert")).toBe(false);
    // Unknown access (still loading) never opens an item.
    expect(isItemUnlocked(undefined, "intro")).toBe(false);
  });

  it("keeps the checklist non-blocking and always reachable", () => {
    expect(isItemUnlocked(learnerStart, "chk")).toBe(true);
    expect(accessRowFor(learnerStart, "chk")?.reason).toBe("optional");
    expect(nextOpenItem(learnerStart, new Set())?.mission_id).toBe("intro");
  });

  it("unlocks the next item once the previous required item is complete", () => {
    const progressed: ItemAccessMap = {
      ...learnerStart,
      items: [
        { mission_id: "intro", slug: "module-introduction", unlocked: true, reason: "open" },
        { mission_id: "m1", slug: "mission-1", unlocked: true, reason: "open" },
        { mission_id: "chk", slug: "qualification-checklist", unlocked: true, reason: "optional" },
        { mission_id: "cert", slug: "module-certification", unlocked: false, reason: "requires_all_learning_items", blocked_by: "Mission 1" },
      ],
    };
    expect(isItemUnlocked(progressed, "m1")).toBe(true);
    expect(isItemUnlocked(progressed, "cert")).toBe(false);
    expect(nextOpenItem(progressed, new Set(["intro"]))?.mission_id).toBe("m1");
  });

  it("opens certification only when every required learning item is done", () => {
    const ready: ItemAccessMap = {
      module_id: "m5",
      is_admin: false,
      all_required_done: true,
      items: [
        { mission_id: "cert", slug: "module-certification", unlocked: true, reason: "open" },
      ],
    };
    expect(isItemUnlocked(ready, "cert")).toBe(true);
  });

  it("lets admins preview every item", () => {
    const admin: ItemAccessMap = {
      module_id: "m5",
      is_admin: true,
      all_required_done: false,
      items: learnerStart.items.map((i) => ({ ...i, unlocked: true, reason: "admin_preview" })),
    };
    expect(admin.items.every((i) => isItemUnlocked(admin, i.mission_id))).toBe(true);
  });

  it("explains why an item is locked", () => {
    expect(lockMessage(accessRowFor(learnerStart, "m1"))).toContain("Module Introduction");
    expect(lockMessage(accessRowFor(learnerStart, "cert"))).toContain("every learning item");
    expect(lockMessage(accessRowFor(learnerStart, "intro"))).toBe("");
  });
});
