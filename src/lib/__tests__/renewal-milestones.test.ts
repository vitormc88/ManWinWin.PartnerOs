import { describe, it, expect } from "vitest";
import { planRenewalMilestones, daysBetween } from "@/lib/renewal-milestones";

const keys = (r: ReturnType<typeof planRenewalMilestones>) => r.map((m) => m.key);

describe("canonical renewal milestones", () => {
  it("creates the full 120/90/60/30 series when tracked at 120 days", () => {
    const r = planRenewalMilestones({ renewalDate: "2026-12-09", today: "2026-08-11", contractStartDate: "2025-12-09" });
    expect(keys(r)).toEqual(["m120", "m90", "m60", "m30"]);
    expect(r.map((m) => m.dueDate)).toEqual(["2026-08-11", "2026-09-10", "2026-10-10", "2026-11-09"]);
  });

  it("first tracked at 75 days: next milestone is 60, then 30", () => {
    const r = planRenewalMilestones({ renewalDate: "2026-10-25", today: "2026-08-11" });
    expect(daysBetween("2026-08-11", "2026-10-25")).toBe(75);
    expect(keys(r)).toEqual(["m60", "m30"]);
    expect(r[0].dueDate).toBe("2026-08-26");
    expect(r[1].dueDate).toBe("2026-09-25");
  });

  it("first tracked at 45 days: only the 30-day milestone", () => {
    const r = planRenewalMilestones({ renewalDate: "2026-09-25", today: "2026-08-11" });
    expect(keys(r)).toEqual(["m30"]);
    expect(r[0].dueDate).toBe("2026-08-26");
  });

  it("first tracked at 15 days: one immediate action plus the overdue escalation", () => {
    const r = planRenewalMilestones({ renewalDate: "2026-08-26", today: "2026-08-11" });
    expect(keys(r)).toEqual(["action_required", "overdue"]);
    expect(r[0].dueDate).toBe("2026-08-11");
    expect(r[1].dueDate).toBe("2026-08-26");
  });

  it("never invents a short-contract calendar: a six-month contract keeps the real anchor", () => {
    const r = planRenewalMilestones({
      renewalDate: "2027-04-11",
      today: "2026-12-15",
      contractStartDate: "2026-10-10",
    });
    expect(keys(r)).toEqual(["m90", "m60", "m30"]);
    expect(r.every((m) => [120, 90, 60, 30].includes(m.offsetDays))).toBe(true);
  });

  it("drops milestones that fall before the contract start", () => {
    const r = planRenewalMilestones({
      renewalDate: "2027-04-11",
      today: "2026-10-10",
      contractStartDate: "2026-10-10",
    });
    expect(keys(r)).toEqual(["m90", "m60", "m30"]);
  });

  it("escalates a tracked cycle that went overdue", () => {
    const r = planRenewalMilestones({ renewalDate: "2026-08-01", today: "2026-08-11", trackedSince: "2026-05-01" });
    expect(keys(r)).toEqual(["overdue"]);
    expect(r[0].dueDate).toBe("2026-08-01");
  });

  it("does not back-date an overdue escalation for a historical cycle imported after the fact", () => {
    const r = planRenewalMilestones({ renewalDate: "2026-08-01", today: "2026-08-11", trackedSince: "2026-08-11" });
    expect(r).toEqual([]);
  });
});
