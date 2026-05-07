// Centralized configuration for Pipeline Health rules.
// Future Settings → Pipeline Health Rules will read/write this layer.
// Keep ALL magic numbers here — never scatter thresholds across components.

import type { DealHealth } from "@/lib/deal-health";

export interface PipelineHealthConfig {
  // Inactivity thresholds (days since last activity)
  hot_activity_window: number;          // < this = qualifies as "recent activity" for Hot
  attention_inactivity_days: number;    // > this = Attention
  stalled_inactivity_days: number;      // > this = Stalled

  // Follow-up + proposal aging
  no_followup_days: number;             // proposal sent > N days ago without follow-up
  proposal_recent_window: number;       // < N days = "recent proposal" (Hot signal)
  followup_grace_recent_activity_days: number; // recent activity within N days suppresses "no follow-up" warning
  followup_grace_recent_proposal_days: number; // recent proposal within N days suppresses "no follow-up" warning
  followup_grace_recent_stage_days: number;    // stage changed within N days suppresses "no follow-up" warning

  // Stage aging defaults (per-stage overrides live in STAGE_AGING)
  default_stage_warn_days: number;
  default_stage_risk_days: number;

  // Hot deal scoring — Hot triggers when score >= hot_score_threshold
  hot_score_threshold: number;
  hot_signal_weights: {
    recentActivity: number;     // activity within hot_activity_window
    futureFollowUp: number;     // has scheduled follow-up
    recentProposal: number;     // proposal within recent window
    highProbability: number;    // base probability >= high_probability_floor
    recentlyEnteredStage: number;
  };
  high_probability_floor: number;       // probability >= this counts as a Hot signal

  // Health-based effective probability adjustment (additive percentage points).
  health_probability_adjustments: Record<DealHealth, number>;
  // Floor for effective probability — never zero out an active opportunity.
  minimum_effective_probability: number;
}

// Default configuration — single source of truth.
export const PIPELINE_HEALTH_CONFIG: PipelineHealthConfig = {
  hot_activity_window: 3,
  attention_inactivity_days: 10,
  stalled_inactivity_days: 21,

  no_followup_days: 14,
  proposal_recent_window: 7,
  followup_grace_recent_activity_days: 3,
  followup_grace_recent_proposal_days: 5,
  followup_grace_recent_stage_days: 5,

  default_stage_warn_days: 14,
  default_stage_risk_days: 30,

  hot_score_threshold: 2,
  hot_signal_weights: {
    recentActivity: 1,
    futureFollowUp: 1,
    recentProposal: 1,
    highProbability: 1,
    recentlyEnteredStage: 1,
  },
  high_probability_floor: 70,

  health_probability_adjustments: {
    Hot: +5,
    Healthy: 0,
    Attention: -5,
    Stalled: -15,
    AtRisk: -25,
  },
  minimum_effective_probability: 5,
};

/** Apply health adjustment to a base probability. Clamped to [floor, 100]. */
export function applyHealthAdjustment(baseProbability: number, health: DealHealth): {
  base: number;
  adjustment: number;
  effective: number;
} {
  const base = Math.max(0, Math.min(100, baseProbability || 0));
  const adjustment = PIPELINE_HEALTH_CONFIG.health_probability_adjustments[health] ?? 0;
  const raw = base + adjustment;
  // Floor only when there's a real opportunity (base > 0); pure 0% stays 0.
  const floor = base > 0 ? PIPELINE_HEALTH_CONFIG.minimum_effective_probability : 0;
  const effective = Math.max(floor, Math.min(100, raw));
  return { base, adjustment, effective };
}

// ── Suggested next-best action ─────────────────────────────────────────
export interface SuggestedAction {
  label: string;
  hint?: string;
}

export interface SuggestActionInputs {
  health: DealHealth;
  stage: string;
  hasOverdueTask: boolean;
  hasFutureFollowUp: boolean;
  hasProposal: boolean;
  daysSinceActivity: number | null;
  daysSinceProposal: number | null;
  daysInStage: number;
  hasOwner: boolean;
}

export function suggestNextAction(i: SuggestActionInputs): SuggestedAction | null {
  // Hard blockers first
  if (!i.hasOwner) return { label: "Assign an owner", hint: "Deal has no salesperson" };
  if (i.hasOverdueTask) return { label: "Resolve overdue tasks", hint: "Clear backlog before progressing" };

  const inactive = (i.daysSinceActivity ?? 0) > 7;

  // Stage-aware contextual suggestions
  switch (i.stage) {
    case "Open Lead":
      return inactive
        ? { label: "Re-engage the prospect", hint: "Schedule discovery call" }
        : { label: "Schedule discovery call", hint: "Qualify maintenance maturity" };

    case "Qualified":
      return { label: "Book product demonstration", hint: "Confirm decision criteria" };

    case "Demo":
      return i.health === "Hot" || i.health === "Healthy"
        ? { label: "Prepare technical validation", hint: "Move toward proposal" }
        : { label: "Schedule demo follow-up", hint: "Confirm value perception" };

    case "Proposal Sent":
      if (!i.hasProposal) return { label: "Send the proposal", hint: "Stage requires a proposal" };
      if ((i.daysSinceProposal ?? 0) > 7)
        return { label: "Follow up proposal feedback", hint: `Sent ${i.daysSinceProposal}d ago` };
      return { label: "Confirm evaluation timeline", hint: "Set expectations for next step" };

    case "Advance 1":
      return { label: "Identify blockers", hint: "Confirm next milestone" };

    case "Meeting 2":
      return { label: "Clarify open objections", hint: "Document agreed next step" };

    case "Advance 2":
      return { label: "Prepare closing plan", hint: "Align stakeholders on timing" };

    case "Price Negotiation":
      if (i.health === "AtRisk" || i.health === "Stalled")
        return { label: "Escalate commercial approval", hint: "Validate procurement process" };
      return { label: "Clarify pricing objections", hint: "Validate procurement process" };

    default:
      if (i.health === "Healthy" || i.health === "Hot") {
        return i.hasFutureFollowUp ? null : { label: "Schedule next follow-up" };
      }
      return { label: "Re-engage the prospect" };
  }
}
