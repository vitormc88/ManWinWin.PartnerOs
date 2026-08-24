/**
 * EVIDENCE-AWARE STAGE GATES.
 *
 * Central definition of user-facing stage semantics and the commercial evidence
 * expected before a stage advance. Stored stage keys are NEVER rewritten —
 * legacy keys stay compatible; only the labels shown to users are improved.
 */

import type { DealStage } from "@/data/pipeline-stages";
import { isSectionCaptured, hasDecisionPath, type DiscoveryLike, type StakeholderLike } from "./discovery";
import { hasAgreedFutureNextStep, hasCustomerNextStep, type NextStepLike } from "./next-steps";

/** Outcome-oriented labels for the vague legacy stage keys. */
export const STAGE_LABEL_OVERRIDES: Partial<Record<DealStage, string>> = {
  "Advance 1": "Solution Alignment",
  "Meeting 2": "Clarifications & Validation",
  "Advance 2": "Decision Path Confirmed",
};

export function stageLabel(stage: string, fallback?: string): string {
  return STAGE_LABEL_OVERRIDES[stage as DealStage] ?? fallback ?? stage;
}

export interface GateContext {
  discovery?: DiscoveryLike;
  stakeholders?: StakeholderLike[];
  nextSteps?: NextStepLike[];
  owner?: string | null;
  value?: number | null;
  proposalCount?: number;
  qualificationDecision?: string | null;
}

export interface GateRequirement {
  label: string;
  met: boolean;
  /** Blocking requirements protect data integrity; the rest are warnings. */
  blocking?: boolean;
}

export interface GateResult {
  status: "ok" | "warn" | "block";
  requirements: GateRequirement[];
  missing: string[];
  /** Missing requirement labels, machine-friendly for the audit record. */
  missingKeys: string[];
}

function evaluate(reqs: GateRequirement[]): GateResult {
  const unmet = reqs.filter((r) => !r.met);
  const blocked = unmet.some((r) => r.blocking);
  return {
    status: blocked ? "block" : unmet.length ? "warn" : "ok",
    requirements: reqs,
    missing: unmet.map((r) => r.label),
    missingKeys: unmet.map((r) => r.label),
  };
}

/** Lead -> Opportunity. */
export function leadToOpportunityGate(ctx: GateContext): GateResult {
  return evaluate([
    {
      label: "Explicit Qualified decision recorded",
      met: ctx.qualificationDecision === "Qualified",
      blocking: true,
    },
    { label: "Core discovery captured (Current)", met: isSectionCaptured(ctx.discovery, "current") },
    { label: "An owner is assigned", met: !!ctx.owner },
    { label: "A future next step agreed with the customer", met: hasAgreedFutureNextStep(ctx.nextSteps || []) },
  ]);
}

/** Opportunity stage gates, keyed by the target stage. */
export function dealStageGate(toStage: string, ctx: GateContext): GateResult {
  const discovery = ctx.discovery;
  const steps = ctx.nextSteps || [];
  const stakeholders = ctx.stakeholders || [];

  switch (toStage) {
    case "Demo":
      return evaluate([
        { label: "Discovery — Current captured", met: isSectionCaptured(discovery, "current") },
        { label: "Discovery — Problem captured", met: isSectionCaptured(discovery, "problem") },
        { label: "A next step agreed with the customer", met: hasCustomerNextStep(steps) },
      ]);
    case "Proposal Sent":
      return evaluate([
        { label: "Discovery — Problem captured", met: isSectionCaptured(discovery, "problem") },
        { label: "Discovery — Impact captured", met: isSectionCaptured(discovery, "impact") },
        { label: "Discovery — Future captured", met: isSectionCaptured(discovery, "future") },
        { label: "A decision-side stakeholder identified", met: hasDecisionPath(stakeholders) },
        { label: "Opportunity value recorded", met: !!ctx.value && ctx.value > 0 },
        { label: "An owner is assigned", met: !!ctx.owner },
        { label: "A next step agreed with the customer", met: hasCustomerNextStep(steps) },
      ]);
    case "Won":
      return evaluate([
        { label: "A proposal exists or a value is recorded", met: (ctx.proposalCount || 0) > 0 || (!!ctx.value && ctx.value > 0) },
        { label: "A decision contact / decision path is known", met: hasDecisionPath(stakeholders) },
        { label: "A next step agreed with the customer", met: hasCustomerNextStep(steps) },
      ]);
    default:
      return { status: "ok", requirements: [], missing: [], missingKeys: [] };
  }
}

/** Stages that carry their own dedicated workflow and must not be drag-dropped. */
export const DEDICATED_WORKFLOW_STAGES = ["Won", "Lost"] as const;

export function requiresDedicatedWorkflow(stage: string): boolean {
  return (DEDICATED_WORKFLOW_STAGES as readonly string[]).includes(stage);
}
