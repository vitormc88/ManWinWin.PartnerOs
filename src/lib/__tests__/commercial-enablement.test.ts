import { describe, expect, it } from "vitest";
import {
  conversionReadiness,
  engagementChip,
  meaningfulEngagement,
  recommendedNextAction,
} from "@/lib/outreach-activities";
import {
  discoveryCompleteness,
  hasDecisionPath,
  isSectionCaptured,
  missingDiscoverySections,
  sectionCompleteness,
} from "@/lib/discovery";
import {
  currentNextStep,
  hasAgreedFutureNextStep,
  hasCustomerNextStep,
  isOverdue,
} from "@/lib/next-steps";
import { dealStageGate, leadToOpportunityGate, requiresDedicatedWorkflow, stageLabel } from "@/lib/pipeline-gates";

const at = (iso: string) => ({ performed_at: iso });

describe("outreach engagement", () => {
  it("starts with no outreach", () => {
    expect(engagementChip([]).label).toBe("No outreach yet");
  });

  it("treats attempts without a reply as Attempted", () => {
    const chip = engagementChip([{ ...at("2026-08-20T10:00:00Z"), channel: "email", outcome: "attempted" }]);
    expect(chip.label).toBe("Attempted");
    expect(meaningfulEngagement([{ ...at("2026-08-20T10:00:00Z"), outcome: "attempted" }]).ok).toBe(false);
  });

  it("recognises real two-way engagement", () => {
    const acts = [{ ...at("2026-08-21T10:00:00Z"), channel: "email", outcome: "replied" }];
    expect(engagementChip(acts).label).toBe("In Conversation");
    expect(meaningfulEngagement(acts).ok).toBe(true);
  });

  it("always recommends an action grounded in what was recorded", () => {
    expect(recommendedNextAction([]).title.length).toBeGreaterThan(0);
    expect(recommendedNextAction([{ ...at("2026-08-21T10:00:00Z"), outcome: "do_not_contact" }]).title).toMatch(/contact/i);
  });
});

describe("target account -> lead conversion gate", () => {
  const contact = { full_name: "Ana Silva", email: "ana@example.com", phone: null };
  const engaged = [{ ...at("2026-08-21T10:00:00Z"), outcome: "replied" }];

  it("blocks while still researching", () => {
    expect(conversionReadiness({ status: "Researching", primaryContact: contact, activities: engaged }).ready).toBe(false);
  });

  it("blocks without meaningful engagement", () => {
    const r = conversionReadiness({
      status: "Ready for Outreach",
      primaryContact: contact,
      activities: [{ ...at("2026-08-20T10:00:00Z"), outcome: "attempted" }],
    });
    expect(r.ready).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/reply|meeting|referral|next step/i);
  });

  it("blocks a second conversion", () => {
    expect(
      conversionReadiness({ status: "Ready for Outreach", primaryContact: contact, activities: engaged, alreadyConverted: true }).ready
    ).toBe(false);
  });

  it("passes with status, contact channel and engagement", () => {
    expect(conversionReadiness({ status: "Ready for Outreach", primaryContact: contact, activities: engaged }).ready).toBe(true);
  });
});

describe("discovery completeness", () => {
  const current = {
    current_process: "Paper work orders",
    current_people: "Two technicians",
    current_tools: "Excel",
  };

  it("is 0% when empty and reports every section as missing", () => {
    expect(discoveryCompleteness(null)).toBe(0);
    expect(missingDiscoverySections(null)).toHaveLength(5);
  });

  it("marks a section captured only when all core fields are filled", () => {
    expect(isSectionCaptured({ ...current, current_tools: "" }, "current")).toBe(false);
    expect(isSectionCaptured(current, "current")).toBe(true);
  });

  it("counts core fields per section", () => {
    const s = sectionCompleteness(current).find((x) => x.key === "current")!;
    expect(s.done).toBe(s.total);
    expect(discoveryCompleteness(current)).toBeGreaterThan(0);
    expect(discoveryCompleteness(current)).toBeLessThan(100);
  });

  it("only accepts a shared/validated alignment status", () => {
    expect(isSectionCaptured({ align_shared_summary: "x", align_validation_status: "not_shared" }, "align")).toBe(false);
    expect(isSectionCaptured({ align_shared_summary: "x", align_validation_status: "validated" }, "align")).toBe(true);
  });

  it("detects a decision-side stakeholder", () => {
    expect(hasDecisionPath([{ buying_role: "influencer" }])).toBe(false);
    expect(hasDecisionPath([{ buying_role: "decision_maker" }])).toBe(true);
  });
});

describe("agreed next steps", () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();

  it("surfaces the soonest open step", () => {
    const step = currentNextStep([
      { title: "Later", due_at: future },
      { title: "Now", due_at: past },
      { title: "Done", due_at: past, status: "completed" },
    ]);
    expect(step?.title).toBe("Now");
  });

  it("distinguishes agreed-with-customer from any planned step", () => {
    expect(hasCustomerNextStep([{ title: "Internal review", due_at: future }])).toBe(false);
    expect(hasCustomerNextStep([{ title: "Workshop", due_at: future, agreed_with_customer: true }])).toBe(true);
  });

  it("requires a future date for readiness", () => {
    expect(hasAgreedFutureNextStep([{ title: "Workshop", due_at: past, agreed_with_customer: true }])).toBe(false);
    expect(hasAgreedFutureNextStep([{ title: "Workshop", due_at: future, agreed_with_customer: true }])).toBe(true);
  });

  it("flags overdue open steps only", () => {
    expect(isOverdue({ title: "x", due_at: past })).toBe(true);
    expect(isOverdue({ title: "x", due_at: past, status: "completed" })).toBe(false);
  });
});

describe("pipeline stage gates", () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const agreed = [{ title: "Discovery call", due_at: future, agreed_with_customer: true }];
  const currentCaptured = {
    current_process: "Paper",
    current_people: "Two",
    current_tools: "Excel",
    problem_statement: "Unplanned downtime",
    problem_evidence: "Line 2 stopped twice in June",
  };

  it("blocks lead -> opportunity without an explicit Qualified decision", () => {
    const gate = leadToOpportunityGate({ discovery: currentCaptured, nextSteps: agreed, owner: "u1" });
    expect(gate.status).toBe("block");
  });

  it("passes lead -> opportunity with decision, discovery, owner and next step", () => {
    const gate = leadToOpportunityGate({
      discovery: currentCaptured,
      nextSteps: agreed,
      owner: "u1",
      qualificationDecision: "Qualified",
    });
    expect(gate.status).toBe("ok");
  });

  it("warns on Demo when discovery or the next step is missing", () => {
    const gate = dealStageGate("Demo", { discovery: null, nextSteps: [] });
    expect(gate.status).toBe("warn");
    expect(gate.missing.length).toBe(3);
    expect(dealStageGate("Demo", { discovery: currentCaptured, nextSteps: agreed }).status).toBe("ok");
  });

  it("requires value, decision path and next step for Proposal Sent", () => {
    const gate = dealStageGate("Proposal Sent", {
      discovery: currentCaptured,
      nextSteps: agreed,
      stakeholders: [{ buying_role: "decision_maker" }],
      owner: "u1",
      value: 0,
    });
    expect(gate.status).toBe("warn");
    expect(gate.missing.join(" ")).toMatch(/value/i);
  });

  it("keeps Won and Lost on their dedicated workflows", () => {
    expect(requiresDedicatedWorkflow("Won")).toBe(true);
    expect(requiresDedicatedWorkflow("Lost")).toBe(true);
    expect(requiresDedicatedWorkflow("Demo")).toBe(false);
  });

  it("relabels vague stages without changing stored keys", () => {
    expect(stageLabel("Advance 1", "Advance 1")).not.toBe("Advance 1");
    expect(stageLabel("Demo", "Demo")).toBe("Demo");
  });
});
