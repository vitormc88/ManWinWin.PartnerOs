// Deal Health computation logic — central, reusable.
// All thresholds live in src/lib/pipeline-health-config.ts.

import { PIPELINE_HEALTH_CONFIG, applyHealthAdjustment, suggestNextAction, type SuggestedAction } from "@/lib/pipeline-health-config";

export type DealHealth = "Hot" | "Healthy" | "Attention" | "Stalled" | "AtRisk";

export interface DealHealthInputs {
  stage: string;
  status?: string | null;
  stageEnteredAt: Date | null;
  createdAt: Date;
  lastActivityAt: Date | null;
  nextFollowUpAt: Date | null;
  hasOverdueTask: boolean;
  latestProposalAt: Date | null;
  hasOwner: boolean;
  baseProbability?: number | null;
}

export interface DealHealthResult {
  health: DealHealth;
  reasons: string[];
  positives: string[];
  warnings: string[];
  daysSinceActivity: number | null;
  daysInStage: number;
  daysSinceProposal: number | null;
  hasFutureFollowUp: boolean;
  suggestedAction: SuggestedAction | null;
  effectiveProbability: number;
  baseProbability: number;
  probabilityAdjustment: number;
}

const DAY = 86400000;
const cfg = PIPELINE_HEALTH_CONFIG;

// Per-stage aging overrides — fallback to config defaults when unspecified.
export const STAGE_AGING: Record<string, { warn: number; risk: number }> = {
  "Open Lead":         { warn: 14, risk: 30 },
  "Qualified":         { warn: 14, risk: 30 },
  "Demo":              { warn: 10, risk: 21 },
  "Proposal Sent":     { warn: 7,  risk: 14 },
  "Advance 1":         { warn: 14, risk: 28 },
  "Meeting 2":         { warn: 14, risk: 28 },
  "Advance 2":         { warn: 14, risk: 28 },
  "Price Negotiation": { warn: 10, risk: 21 },
};

// Re-export legacy constants so existing imports keep working.
export const PROPOSAL_AGING_WARN_DAYS = cfg.no_followup_days;
export const INACTIVITY_ATTENTION_DAYS = cfg.attention_inactivity_days;
export const INACTIVITY_STALLED_DAYS = cfg.stalled_inactivity_days;

function daysBetween(from: Date | null, to: Date = new Date()): number | null {
  if (!from) return null;
  return Math.floor((to.getTime() - from.getTime()) / DAY);
}

export function computeDealHealth(input: DealHealthInputs): DealHealthResult {
  const now = new Date();
  const daysSinceActivity = daysBetween(input.lastActivityAt, now);
  const daysInStage = daysBetween(input.stageEnteredAt ?? input.createdAt, now) ?? 0;
  const daysSinceProposal = daysBetween(input.latestProposalAt, now);
  const hasFutureFollowUp =
    !!input.nextFollowUpAt && input.nextFollowUpAt.getTime() >= now.getTime() - DAY;

  const reasons: string[] = [];
  const positives: string[] = [];
  const warnings: string[] = [];

  // ── At Risk signals ─────────────────────────────────────────────────
  const stageThr = STAGE_AGING[input.stage] ?? { warn: cfg.default_stage_warn_days, risk: cfg.default_stage_risk_days };
  const stageStuck = daysInStage >= stageThr.risk;
  if (input.hasOverdueTask) { reasons.push("Has overdue tasks"); warnings.push("Overdue tasks"); }
  if (!input.hasOwner) { reasons.push("Missing owner"); warnings.push("No owner"); }
  if (stageStuck) { reasons.push(`${daysInStage}d in ${input.stage} stage`); warnings.push(`${daysInStage}d in stage`); }

  // ── Stalled signals ─────────────────────────────────────────────────
  const veryInactive = (daysSinceActivity ?? Infinity) > cfg.stalled_inactivity_days;
  const proposalAging =
    daysSinceProposal !== null &&
    daysSinceProposal > cfg.no_followup_days &&
    !hasFutureFollowUp;
  if (veryInactive) reasons.push(`No activity for ${daysSinceActivity}d`);
  if (proposalAging) { reasons.push(`Proposal sent ${daysSinceProposal}d ago, no follow-up`); warnings.push(`Proposal ${daysSinceProposal}d old`); }

  // ── Attention signals ───────────────────────────────────────────────
  const attentionInactive = (daysSinceActivity ?? Infinity) > cfg.attention_inactivity_days;
  const noFollowUpRequired =
    !hasFutureFollowUp &&
    ["Proposal Sent", "Advance 1", "Meeting 2", "Advance 2", "Price Negotiation"].includes(input.stage);
  if (attentionInactive && !veryInactive) reasons.push(`No activity for ${daysSinceActivity}d`);
  if (noFollowUpRequired) { reasons.push("No follow-up scheduled"); warnings.push("No follow-up"); }
  const stageWarn = daysInStage >= stageThr.warn && daysInStage < stageThr.risk;
  if (stageWarn) warnings.push(`${daysInStage}d in stage`);

  // ── Hot signals (rebalanced — score-based, not all-or-nothing) ──────
  const w = cfg.hot_signal_weights;
  const recentActivity = (daysSinceActivity ?? Infinity) < cfg.hot_activity_window;
  const recentProposal = (daysSinceProposal ?? Infinity) < cfg.proposal_recent_window;
  const recentlyEnteredStage = daysInStage < 5;
  const highProb = (input.baseProbability ?? 0) >= cfg.high_probability_floor;

  let hotScore = 0;
  if (recentActivity)        { hotScore += w.recentActivity;        positives.push(`Activity ${daysSinceActivity ?? 0}d ago`); }
  if (hasFutureFollowUp)     { hotScore += w.futureFollowUp;        positives.push("Follow-up scheduled"); }
  if (recentProposal)        { hotScore += w.recentProposal;        positives.push(`Proposal sent ${daysSinceProposal}d ago`); }
  if (highProb)              { hotScore += w.highProbability;       positives.push(`Probability ${input.baseProbability}%`); }
  if (recentlyEnteredStage)  { hotScore += w.recentlyEnteredStage;  positives.push(`Entered stage ${daysInStage}d ago`); }

  const isHot = hotScore >= cfg.hot_score_threshold;

  // ── Decide health (priority: AtRisk > Stalled > Attention > Hot > Healthy) ──
  let health: DealHealth = "Healthy";
  if (input.hasOverdueTask || !input.hasOwner || stageStuck) health = "AtRisk";
  else if (veryInactive || proposalAging) health = "Stalled";
  else if (attentionInactive || noFollowUpRequired || stageWarn) health = "Attention";
  else if (isHot) health = "Hot";

  if (health === "Healthy") {
    if (hasFutureFollowUp) positives.push("Follow-up scheduled");
    if ((daysSinceActivity ?? Infinity) <= cfg.attention_inactivity_days) positives.push("Regular activity");
    if (!stageWarn && !stageStuck) positives.push("Stage progression normal");
  }

  // ── Probability adjustment ───────────────────────────────────────────
  const adj = applyHealthAdjustment(input.baseProbability ?? 0, health);
  const suggestedAction = suggestNextAction({
    health,
    stage: input.stage,
    hasOverdueTask: input.hasOverdueTask,
    hasFutureFollowUp,
    daysSinceActivity,
    daysSinceProposal,
    hasOwner: input.hasOwner,
  });

  return {
    health,
    reasons,
    positives,
    warnings,
    daysSinceActivity,
    daysInStage,
    daysSinceProposal,
    hasFutureFollowUp,
    suggestedAction,
    baseProbability: adj.base,
    probabilityAdjustment: adj.adjustment,
    effectiveProbability: adj.effective,
  };
}

// ── UI helpers ──────────────────────────────────────────────────────────
export const HEALTH_META: Record<DealHealth, { label: string; dot: string; chip: string; ring: string }> = {
  Hot:       { label: "Hot",       dot: "bg-rose-500",    chip: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",         ring: "ring-rose-300/40" },
  Healthy:   { label: "Healthy",   dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900", ring: "ring-emerald-300/40" },
  Attention: { label: "Attention", dot: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",   ring: "ring-amber-300/40" },
  Stalled:   { label: "Stalled",   dot: "bg-orange-500",  chip: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900", ring: "ring-orange-300/40" },
  AtRisk:    { label: "At Risk",   dot: "bg-red-500",     chip: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",               ring: "ring-red-300/40" },
};
