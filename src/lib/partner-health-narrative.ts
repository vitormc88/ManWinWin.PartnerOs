// Deterministic, business-oriented narrative for the Partner Health Card v2.1.
// Builds a one-sentence summary and a list of human-readable health factors
// directly from the same data displayed elsewhere on the Partner page —
// guaranteeing the Health Card never contradicts Partner Information.
//
// No AI, no scoring changes. This file only translates known facts into
// language a Sales Director would use.

import { healthBand, type FactorImpact, type HealthDimension, type PartnerMaturity } from "./partner-health-config";

export interface BusinessFactor {
  type: "positive" | "negative";
  dimension: HealthDimension;
  impact: FactorImpact;
  label: string;
}

export interface NarrativeInput {
  score: number;
  maturity?: PartnerMaturity;
  partner: {
    onboarding_status?: string | null;
    next_meeting_date?: string | null;
    last_meeting_date?: string | null;
    account_owner_id?: string | null;
    assigned_manager_id?: string | null;
  };
  clients: Array<any>;
  deals: Array<{ status?: string | null; created_at?: string | null; won_at?: string | null; last_activity_at?: string | null }>;
  notes: Array<{ created_at?: string | null }>;
  leadsOpen?: number;
  renewalsUpcoming?: number;
}

export interface PartnerNarrative {
  summary: string;
  factors: BusinessFactor[];
}

const DAY = 86_400_000;
const daysSince = (iso?: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null;
const daysUntil = (iso?: string | null) =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / DAY) : null;

const IMPACT_RANK: Record<FactorImpact, number> = { high: 3, medium: 2, low: 1 };
const DIM_RANK: Record<HealthDimension, number> = {
  relationship: 3,
  momentum: 2,
  engagement: 1,
};

function prioritize(factors: BusinessFactor[]): BusinessFactor[] {
  return [...factors].sort((a, b) => {
    const i = IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact];
    if (i !== 0) return i;
    return DIM_RANK[b.dimension] - DIM_RANK[a.dimension];
  });
}

export function buildPartnerNarrative(input: NarrativeInput): PartnerNarrative {
  const { partner, clients, deals, notes } = input;
  const maturity = input.maturity ?? "active";
  const openDeals = deals.filter((d) => d.status === "Open").length;
  const recentWins = deals.filter(
    (d) => d.status === "Won" && d.won_at && Date.now() - new Date(d.won_at).getTime() <= 180 * DAY,
  ).length;
  const recentDeals = deals.filter(
    (d) => d.created_at && Date.now() - new Date(d.created_at).getTime() <= 90 * DAY,
  ).length;
  const notes90d = notes.filter(
    (n) => n.created_at && Date.now() - new Date(n.created_at).getTime() <= 90 * DAY,
  ).length;
  const lastNoteDays = daysSince(
    notes.length ? notes.map((n) => n.created_at).filter(Boolean).sort().slice(-1)[0] : null,
  );
  const lastMeetingDays = daysSince(partner.last_meeting_date);
  const nextMeetingDays = daysUntil(partner.next_meeting_date);

  const meetingOverdueDays =
    partner.next_meeting_date && nextMeetingDays !== null && nextMeetingDays < 0
      ? Math.abs(nextMeetingDays)
      : null;

  // Days since any relationship signal (note or meeting).
  const contactCandidates = [lastNoteDays, lastMeetingDays].filter(
    (v): v is number => v !== null,
  );
  const daysSinceContact = contactCandidates.length ? Math.min(...contactCandidates) : null;

  // Onboarding consistency — drive from Partner Info, NOT a separate table.
  const onboardingStatus = (partner.onboarding_status || "").toLowerCase();
  const onboardingDone = onboardingStatus === "completed";
  const onboardingInProgress =
    !onboardingDone &&
    ["in progress", "active", "started"].some((s) => onboardingStatus.includes(s));

  const positives: BusinessFactor[] = [];
  const negatives: BusinessFactor[] = [];

  // ─── Relationship ────────────────────────────────────────────────
  if (daysSinceContact !== null && daysSinceContact <= 14) {
    positives.push({
      type: "positive",
      dimension: "relationship",
      impact: "high",
      label:
        lastMeetingDays !== null && lastMeetingDays <= 14
          ? `Last meeting held ${lastMeetingDays === 0 ? "today" : `${lastMeetingDays} day${lastMeetingDays === 1 ? "" : "s"} ago`}`
          : `Recent business engagement (${daysSinceContact === 0 ? "today" : `${daysSinceContact}d ago`})`,
    });
  } else if (daysSinceContact !== null && daysSinceContact <= 45 && notes90d >= 2) {
    positives.push({
      type: "positive",
      dimension: "relationship",
      impact: "medium",
      label: `Regular relationship engagement (${notes90d} touchpoints in 90 days)`,
    });
  }

  if (nextMeetingDays !== null && nextMeetingDays >= 0) {
    positives.push({
      type: "positive",
      dimension: "relationship",
      impact: "medium",
      label:
        nextMeetingDays === 0
          ? "Relationship review scheduled today"
          : `Next relationship review in ${nextMeetingDays} day${nextMeetingDays === 1 ? "" : "s"}`,
    });
  }

  if (meetingOverdueDays !== null) {
    const impact: FactorImpact =
      meetingOverdueDays <= 30 ? "low" : meetingOverdueDays <= 60 ? "medium" : "high";
    negatives.push({
      type: "negative",
      dimension: "relationship",
      impact,
      label: `Next relationship review overdue by ${meetingOverdueDays} day${meetingOverdueDays === 1 ? "" : "s"}`,
    });
  } else if (!partner.next_meeting_date && maturity !== "new") {
    negatives.push({
      type: "negative",
      dimension: "relationship",
      impact: "medium",
      label: "No upcoming relationship review scheduled",
    });
  }

  if (
    daysSinceContact === null &&
    !partner.last_meeting_date &&
    notes.length === 0 &&
    maturity !== "new"
  ) {
    negatives.push({
      type: "negative",
      dimension: "relationship",
      impact: "high",
      label: "No recorded interactions with this partner yet",
    });
  } else if (daysSinceContact !== null && daysSinceContact > 90) {
    negatives.push({
      type: "negative",
      dimension: "relationship",
      impact: daysSinceContact > 180 ? "high" : "medium",
      label: `No relationship activity in the last ${daysSinceContact} days`,
    });
  }

  // ─── Business Momentum ──────────────────────────────────────────
  if (clients.length >= 5) {
    positives.push({
      type: "positive",
      dimension: "momentum",
      impact: "high",
      label: `Strong customer portfolio (${clients.length} active customers)`,
    });
  } else if (clients.length >= 2) {
    positives.push({
      type: "positive",
      dimension: "momentum",
      impact: "medium",
      label: `${clients.length} customers under management`,
    });
  }

  if (openDeals >= 3) {
    positives.push({
      type: "positive",
      dimension: "momentum",
      impact: "high",
      label: `Growing opportunity pipeline (${openDeals} active opportunities)`,
    });
  } else if (openDeals > 0) {
    positives.push({
      type: "positive",
      dimension: "momentum",
      impact: "medium",
      label: `${openDeals} active opportunity${openDeals === 1 ? "" : "ies"} progressing`,
    });
  }

  if (recentWins > 0) {
    positives.push({
      type: "positive",
      dimension: "momentum",
      impact: "high",
      label: `${recentWins} deal${recentWins === 1 ? "" : "s"} won in the last 6 months`,
    });
  } else if (recentDeals > 0) {
    positives.push({
      type: "positive",
      dimension: "momentum",
      impact: "medium",
      label: `Pipeline updated recently (${recentDeals} new opportunity${recentDeals === 1 ? "" : "ies"} in 90 days)`,
    });
  }

  if ((input.leadsOpen ?? 0) > 0) {
    positives.push({
      type: "positive",
      dimension: "momentum",
      impact: "medium",
      label: `${input.leadsOpen} active lead${input.leadsOpen === 1 ? "" : "s"} in qualification`,
    });
  }

  if ((input.renewalsUpcoming ?? 0) > 0) {
    positives.push({
      type: "positive",
      dimension: "momentum",
      impact: "medium",
      label: `${input.renewalsUpcoming} renewal${input.renewalsUpcoming === 1 ? "" : "s"} coming up`,
    });
  }

  // Negative momentum — only when it's actually a problem given maturity.
  if (clients.length === 0 && (maturity === "new" || maturity === "onboarding")) {
    negatives.push({
      type: "negative",
      dimension: "momentum",
      impact: "low",
      label: "Customer portfolio still being established",
    });
  } else if (
    clients.length === 0 &&
    maturity !== "new" &&
    maturity !== "onboarding"
  ) {
    negatives.push({
      type: "negative",
      dimension: "momentum",
      impact: "high",
      label: "No customers under management",
    });
  }

  if (
    openDeals === 0 &&
    (input.leadsOpen ?? 0) === 0 &&
    (maturity === "active" || maturity === "mature")
  ) {
    negatives.push({
      type: "negative",
      dimension: "momentum",
      impact: "high",
      label: "Commercial activity has slowed — no open pipeline",
    });
  }

  if (maturity === "dormant") {
    negatives.push({
      type: "negative",
      dimension: "momentum",
      impact: "high",
      label: "Partner has shown no commercial activity for over 6 months",
    });
  }

  // ─── Operational Engagement ─────────────────────────────────────
  if (onboardingDone) {
    positives.push({
      type: "positive",
      dimension: "engagement",
      impact: "medium",
      label: "Onboarding fully completed",
    });
  } else if (onboardingInProgress && maturity !== "new") {
    negatives.push({
      type: "negative",
      dimension: "engagement",
      impact: "low",
      label: "Onboarding still in progress",
    });
  }

  // Weak positives intentionally omitted: "Account owner assigned",
  // "Profile complete", "Partner users provisioned", "Partner profile exists".

  // ─── Build summary ──────────────────────────────────────────────
  const band = healthBand(input.score);
  const summary = buildSummary({
    band,
    maturity,
    openDeals,
    clients: clients.length,
    daysSinceContact,
    meetingOverdueDays,
    recentWins,
  });

  return {
    summary,
    factors: [...prioritize(positives), ...prioritize(negatives)],
  };
}

function buildSummary(args: {
  band: ReturnType<typeof healthBand>;
  maturity: PartnerMaturity;
  openDeals: number;
  clients: number;
  daysSinceContact: number | null;
  meetingOverdueDays: number | null;
  recentWins: number;
}): string {
  const { band, maturity, openDeals, clients, daysSinceContact, meetingOverdueDays, recentWins } = args;

  if (maturity === "new") {
    if (band === "at_risk") {
      return "This partnership is just getting started — early setup steps still need attention.";
    }
    return "This partnership is in its early stages and developing as expected.";
  }

  if (maturity === "onboarding") {
    if (band === "healthy") {
      return "This partnership is onboarding well and showing early commercial signs.";
    }
    if (band === "moderate") {
      return "This partnership is still in its onboarding phase and is developing positively.";
    }
    return "Onboarding is taking longer than expected and needs follow-up.";
  }

  if (maturity === "dormant") {
    return "This partnership has gone quiet and requires reactivation.";
  }

  if (band === "healthy") {
    if (recentWins > 0) {
      return "This partnership is commercially active, winning deals and maintaining a healthy relationship.";
    }
    return "This partnership is commercially active and maintaining a healthy relationship.";
  }

  if (band === "moderate") {
    if (openDeals > 0 && (daysSinceContact ?? 999) > 60) {
      return "Pipeline is moving but relationship touchpoints have slowed — worth reconnecting soon.";
    }
    if (clients > 0 && openDeals === 0) {
      return "The customer base is stable but new commercial activity has slowed.";
    }
    return "The partnership is progressing well but still has opportunities to strengthen engagement.";
  }

  // At Risk
  if (meetingOverdueDays && meetingOverdueDays > 60) {
    return "Relationship cadence has lapsed and commercial momentum is weakening — direct attention needed.";
  }
  if (openDeals === 0 && clients === 0) {
    return "There is little commercial or relationship signal from this partner — re-engagement is needed.";
  }
  return "Commercial activity and partner engagement have slowed and require attention.";
}
