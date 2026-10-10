import { describe, expect, it } from "vitest";
import { firstValueTaskIssue } from "@/lib/partner-activation-task";

describe("Sprint 4A first-value task safeguards", () => {
  const task = { title: "Partner activation: First qualified opportunity", due_date: "2026-11-10", task_status: "Open" };
  it("requires meaningful milestone and due date", () => {
    expect(firstValueTaskIssue("", "2026-11-10", [])).toContain("milestone");
    expect(firstValueTaskIssue("First qualified opportunity", "", [])).toContain("due date");
    expect(firstValueTaskIssue("First qualified opportunity", "2026-02-30", [])).toContain("valid");
  });
  it("allows a new dated action", () => {
    expect(firstValueTaskIssue("First qualified opportunity", "2026-11-10", [])).toBeNull();
  });
  it("blocks repeating an open task even when due date differs", () => {
    expect(firstValueTaskIssue("First qualified opportunity", "2026-12-12", [task])).toContain("already exists");
  });
  it("ignores completed and cancelled actions", () => {
    for (const status of ["Done", "Completed", "Cancelled"]) {
      expect(firstValueTaskIssue("First qualified opportunity", "2026-11-10", [{...task,task_status: status}])).toBeNull();
    }
  });
  it("does not block a different first-value milestone", () => {
    expect(firstValueTaskIssue("First jointly delivered demo", "2026-11-10", [task])).toBeNull();
  });
});
