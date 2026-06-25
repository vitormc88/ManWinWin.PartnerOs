// Partner Brief — deterministic executive intelligence.
// Builds an executive-tone assessment without repeating data shown elsewhere.
// No AI, no LLM calls — pure deterministic logic over existing entities.

import type { PartnerNote, ActionItem } from "@/hooks/usePartnerNotes";

export type Momentum =
  | "New"
  | "Building"
  | "Accelerating"
  | "Growing"
  | "Stable"
  | "Slowing"
  | "Dormant"
  | "Recovering"
  | "At Risk";

export type Confidence = "High" | "Medium" | "Low";

export interface BusinessSignal {
  label: string;
  tone: "positive" | "neutral" | "negative";
}

export interface StrategicRecommendation {
  title: string;
  rationale: string;
}

export interface BriefData {
  isNew: boolean;
  /** 4-5 line executive assessment. */
  summary: string;
  /** Deterministic momentum classification. */
  momentum: Momentum;
  momentumHint: string;
  /** Confidence in the assessment, derived from data volume. */
  confidence: Confidence;
  confidenceReason?: string;
  /** 3-5 specific observations grounded in data. */
  signals: BusinessSignal[];
  /** Single highest-impact strategic recommendation. */
  recommendation: StrategicRecommendation | null;
  /** Supplementary detail (kept for the expandable section). */
  currentFocus: string[];
  openCommitments: string[];
  recentProgress: string[];
}

export interface BriefInput {
  partner: {
    company_name?: string | null;
    onboarding_status?: string | null;
    start_date?: string | null;
    created_at?: string | null;
    next_meeting_date?: string | null;
    last_meeting_date?: string | null;
  };
  maturity?: string | null;
  score?: number | null;
  clients: any[];
  deals: any[];
  notes: PartnerNote[];
  renewalsUpcoming?: number;
  leadsOpen?: number;
}

const DAY = 86_400_000;

function daysAgo(iso?: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / DAY;
}
function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);
}
function pct(curr: number, prev: number): number | null {
  if (prev <= 0) return curr > 0 ? 100 : null;
  return Math.round(((curr - prev) / prev) * 100);
}
function uniqueOrdered(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = (raw || "").trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

// ───────────────────────────────────────────────────────────── Focus & history
function extractCurrentFocus(notes: PartnerNote[]): string[] {
  const score = new Map<string, { label: string; weight: number }>();
  for (const n of notes) {
    const age = daysAgo(n.interaction_date || n.created_at);
    if (age > 120) continue;
    const w = age <= 14 ? 3 : age <= 45 ? 2 : 1;
    for (const t of n.topics || []) {
      if (!t) continue;
      const key = t.trim().toLowerCase();
      if (!key) continue;
      const prev = score.get(key);
      score.set(key, { label: prev?.label || t.trim(), weight: (prev?.weight || 0) + w });
    }
  }
  return [...score.values()].sort((a, b) => b.weight - a.weight).slice(0, 3).map((x) => x.label);
}

function extractOpenCommitments(notes: PartnerNote[]): string[] {
  const open: { item: ActionItem; date: string }[] = [];
  for (const n of notes) {
    const date = n.interaction_date || n.created_at;
    for (const ai of n.action_items || []) {
      if (!ai?.description) continue;
      if (ai.status && ai.status !== "Open") continue;
      open.push({ item: ai, date });
    }
  }
  open.sort((a, b) => {
    const ad = a.item.due_date ? new Date(a.item.due_date).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.item.due_date ? new Date(b.item.due_date).getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
  return uniqueOrdered(open.map((x) => x.item.description)).slice(0, 4);
}

function extractRecentProgress(input: BriefInput): string[] {
  const w = 90;
  const out: string[] = [];
  const wonDeals = (input.deals || []).filter(
    (d) => d.status === "Won" && daysAgo(d.won_at || d.status_changed_at || d.updated_at) <= w,
  ).length;
  const newDeals = (input.deals || []).filter((d) => daysAgo(d.created_at) <= w).length;
  const newClients = (input.clients || []).filter((c) => daysAgo(c.created_at) <= w).length;
  const decisions = (input.notes || []).reduce(
    (a, n) => a + (daysAgo(n.interaction_date || n.created_at) <= w ? n.decisions?.length || 0 : 0),
    0,
  );
  if (wonDeals) out.push(`${wonDeals} deal${wonDeals === 1 ? "" : "s"} won`);
  if (newDeals) out.push(`${newDeals} opportunit${newDeals === 1 ? "y" : "ies"} created`);
  if (newClients) out.push(`${newClients} new customer${newClients === 1 ? "" : "s"} added`);
  if (decisions >= 3) out.push(`${decisions} key decisions logged`);
  return out.slice(0, 4);
}

// ─────────────────────────────────────────────────────── Momentum (richer set)
interface MomentumContext {
  recentActivity30: number;
  priorActivity60: number; // days 31..90
  recentWins90: number;
  recentLosses90: number;
  newDeals60: number;
  priorDeals60: number; // days 61..120
  newClients90: number;
  daysSinceContact: number;
  daysSinceWin: number;
  meetingOverdueDays: number | null;
  hasOpenPipeline: boolean;
  hasClients: boolean;
  maturity: string;
}

function buildMomentumContext(input: BriefInput): MomentumContext {
  const deals = input.deals || [];
  const notes = input.notes || [];
  const clients = input.clients || [];

  const between = (arr: any[], key: (x: any) => string | null | undefined, from: number, to: number) =>
    arr.filter((x) => {
      const d = daysAgo(key(x));
      return d >= from && d < to;
    }).length;

  const lastNoteDays = Math.min(
    ...notes.map((n) => daysAgo(n.interaction_date || n.created_at)),
    Number.POSITIVE_INFINITY,
  );
  const lastMeetingDays = daysAgo(input.partner.last_meeting_date);
  const daysSinceContact = Math.min(lastNoteDays, lastMeetingDays);
  const lastWonDays = Math.min(
    ...deals
      .filter((d) => d.status === "Won")
      .map((d) => daysAgo(d.won_at || d.status_changed_at || d.updated_at)),
    Number.POSITIVE_INFINITY,
  );
  const nextMeeting = daysUntil(input.partner.next_meeting_date);

  return {
    recentActivity30:
      between(notes, (n) => n.interaction_date || n.created_at, 0, 30) +
      between(deals, (d) => d.created_at, 0, 30),
    priorActivity60:
      between(notes, (n) => n.interaction_date || n.created_at, 30, 90) +
      between(deals, (d) => d.created_at, 30, 90),
    recentWins90: deals.filter(
      (d) => d.status === "Won" && daysAgo(d.won_at || d.status_changed_at || d.updated_at) <= 90,
    ).length,
    recentLosses90: deals.filter(
      (d) => d.status === "Lost" && daysAgo(d.lost_at || d.status_changed_at || d.updated_at) <= 90,
    ).length,
    newDeals60: between(deals, (d) => d.created_at, 0, 60),
    priorDeals60: between(deals, (d) => d.created_at, 60, 120),
    newClients90: between(clients, (c) => c.created_at, 0, 90),
    daysSinceContact,
    daysSinceWin: lastWonDays,
    meetingOverdueDays: nextMeeting !== null && nextMeeting < 0 ? Math.abs(nextMeeting) : null,
    hasOpenPipeline: deals.some((d) => d.status === "Open"),
    hasClients: clients.length > 0,
    maturity: (input.maturity || "").toLowerCase(),
  };
}

function classifyMomentum(c: MomentumContext): { momentum: Momentum; hint: string } {
  if (c.maturity === "new") return { momentum: "New", hint: "Partnership recently established." };
  if (c.maturity === "onboarding") {
    return { momentum: "Building", hint: "Partnership is being established — history still developing." };
  }


  // Dormant: long silence and no commercial signal.
  if (c.daysSinceContact > 120 && !c.hasOpenPipeline && c.recentWins90 === 0 && c.newDeals60 === 0) {
    return { momentum: "Dormant", hint: "No activity recorded in over 4 months." };
  }

  // At Risk: was active, now visibly deteriorating.
  if (
    (c.recentLosses90 >= 2 && c.recentWins90 === 0) ||
    (c.meetingOverdueDays && c.meetingOverdueDays > 60 && !c.hasOpenPipeline) ||
    (c.priorActivity60 >= 4 && c.recentActivity30 === 0 && c.daysSinceContact > 60)
  ) {
    return { momentum: "At Risk", hint: "Multiple negative signals require direct attention." };
  }

  // Accelerating: clear positive trend on several fronts.
  const trend = pct(c.recentActivity30 * 2, c.priorActivity60); // normalise 30d vs 60d
  if (
    c.recentWins90 >= 2 ||
    (c.newClients90 >= 1 && c.recentActivity30 >= 3) ||
    (trend !== null && trend >= 50 && c.recentActivity30 >= 4)
  ) {
    return { momentum: "Accelerating", hint: "Activity and commercial outcomes are visibly increasing." };
  }

  // Recovering: activity resumed after a clear quiet stretch.
  if (c.priorActivity60 === 0 && c.recentActivity30 >= 2) {
    return { momentum: "Recovering", hint: "Engagement has resumed after a quiet period." };
  }

  // Growing: positive lift without strong wins.
  if (c.recentActivity30 >= 3 && (trend === null || trend >= 0)) {
    return { momentum: "Growing", hint: "Cadence is increasing and pipeline is moving." };
  }

  // Slowing: meaningful drop versus prior window.
  if (c.recentActivity30 === 0 && c.priorActivity60 >= 2) {
    return { momentum: "Slowing", hint: "Activity has dropped versus the previous quarter." };
  }
  if (trend !== null && trend <= -40) {
    return { momentum: "Slowing", hint: "Engagement is trending down versus prior period." };
  }

  return { momentum: "Stable", hint: "Cadence is consistent without notable changes." };
}

// ───────────────────────────────────────────────────────────────── Confidence
function classifyConfidence(input: BriefInput): { confidence: Confidence; reason?: string } {
  const notes = input.notes || [];
  const deals = input.deals || [];
  const clients = input.clients || [];
  const notes180 = notes.filter((n) => daysAgo(n.interaction_date || n.created_at) <= 180).length;
  const totalSignals = notes180 + deals.length + clients.length;

  if (notes180 >= 6 && deals.length >= 2) return { confidence: "High" };
  if (totalSignals >= 4) return { confidence: "Medium" };
  return {
    confidence: "Low",
    reason: "Assessment based on limited historical activity.",
  };
}

// ────────────────────────────────────────────────────────── Business signals
function buildSignals(input: BriefInput, c: MomentumContext): BusinessSignal[] {
  const out: BusinessSignal[] = [];
  const deals = input.deals || [];
  const clients = input.clients || [];

  // Pipeline growth/contraction (60d vs prior 60d)
  const pipeTrend = pct(c.newDeals60, c.priorDeals60);
  if (pipeTrend !== null && Math.abs(pipeTrend) >= 25 && (c.newDeals60 + c.priorDeals60) >= 2) {
    out.push({
      label:
        pipeTrend > 0
          ? `Pipeline has grown ${pipeTrend}% in the last 60 days`
          : `Pipeline has contracted ${Math.abs(pipeTrend)}% versus prior period`,
      tone: pipeTrend > 0 ? "positive" : "negative",
    });
  }

  // Meeting silence
  if (Number.isFinite(c.daysSinceContact) && c.daysSinceContact >= 30) {
    out.push({
      label: `No relationship touchpoints in ${Math.round(c.daysSinceContact)} days`,
      tone: c.daysSinceContact > 60 ? "negative" : "neutral",
    });
  }

  // Revenue / customer concentration
  if (clients.length === 1 && deals.length >= 2) {
    out.push({ label: "Revenue concentration depends on a single customer", tone: "negative" });
  } else if (clients.length >= 5) {
    out.push({ label: `Customer base spans ${clients.length} accounts`, tone: "positive" });
  }

  // Average deal size shift (won deals)
  const wonAll = deals.filter((d) => d.status === "Won" && (d.value ?? d.amount));
  if (wonAll.length >= 4) {
    const val = (d: any) => Number(d.value ?? d.amount ?? 0);
    const recent = wonAll.filter((d) => daysAgo(d.won_at || d.status_changed_at) <= 180);
    const older = wonAll.filter((d) => daysAgo(d.won_at || d.status_changed_at) > 180);
    if (recent.length >= 2 && older.length >= 2) {
      const avg = (xs: any[]) => xs.reduce((a, b) => a + val(b), 0) / xs.length;
      const delta = pct(avg(recent), avg(older));
      if (delta !== null && Math.abs(delta) >= 25) {
        out.push({
          label:
            delta < 0
              ? `New deals are ${Math.abs(delta)}% smaller than historical average`
              : `Recent deal size is ${delta}% above historical average`,
          tone: delta < 0 ? "negative" : "positive",
        });
      }
    }
  }

  // Wins streak
  if (c.recentWins90 >= 2) {
    out.push({ label: `${c.recentWins90} deals closed in the last 90 days`, tone: "positive" });
  } else if (c.recentLosses90 >= 2 && c.recentWins90 === 0) {
    out.push({ label: `${c.recentLosses90} opportunities lost without a recent win`, tone: "negative" });
  }

  // Activity shift — sales vs support
  const notes90 = (input.notes || []).filter(
    (n) => daysAgo(n.interaction_date || n.created_at) <= 90,
  );
  if (notes90.length >= 4) {
    const support = notes90.filter((n) =>
      /support|issue|incident|bug|ticket/i.test(
        [n.interaction_type, ...(n.topics || []), n.content || ""].join(" "),
      ),
    ).length;
    if (support / notes90.length >= 0.6) {
      out.push({ label: "Recent activity has shifted from sales to support topics", tone: "negative" });
    }
  }

  // Renewals
  if ((input.renewalsUpcoming || 0) >= 2) {
    out.push({
      label: `${input.renewalsUpcoming} renewals approaching in the next 120 days`,
      tone: "neutral",
    });
  }

  // Onboarding stuck
  const onb = (input.partner.onboarding_status || "").toLowerCase();
  const since = daysAgo(input.partner.created_at);
  if (onb && onb !== "completed" && since > 90 && c.maturity !== "new") {
    out.push({ label: "Onboarding remains incomplete after 90+ days", tone: "negative" });
  }

  return out.slice(0, 5);
}

// ─────────────────────────────────────────────────────── Strategic recommendation
function buildRecommendation(
  input: BriefInput,
  c: MomentumContext,
  momentum: Momentum,
): StrategicRecommendation | null {
  if (momentum === "Dormant" || momentum === "At Risk") {
    return {
      title: "Schedule an executive re-engagement",
      rationale: "Direct sponsor-level contact is needed to reset the relationship.",
    };
  }
  if (c.recentLosses90 >= 2 && c.recentWins90 === 0) {
    return {
      title: "Review commercial forecast",
      rationale: "Recent losses suggest pricing, fit or competitive issues worth diagnosing.",
    };
  }
  if (!c.hasOpenPipeline && c.hasClients) {
    return {
      title: "Re-engage inactive opportunities",
      rationale: "Customer base is intact but no new pipeline is being created.",
    };
  }
  if (c.newClients90 === 0 && c.recentWins90 === 0 && c.hasClients) {
    return {
      title: "Expand customer footprint",
      rationale: "Account growth has stalled; identify cross-sell or new logos with this partner.",
    };
  }
  if (c.meetingOverdueDays && c.meetingOverdueDays > 30) {
    return {
      title: "Schedule a quarterly business review",
      rationale: "Relationship cadence has lapsed and needs a structured reset.",
    };
  }
  if (momentum === "Accelerating" || momentum === "Growing") {
    return {
      title: "Launch joint marketing activities",
      rationale: "Momentum is positive — invest in co-marketing to compound growth.",
    };
  }
  if ((input.renewalsUpcoming || 0) >= 1) {
    return {
      title: "Protect upcoming renewals",
      rationale: "Renewals on the horizon deserve a deliberate retention play.",
    };
  }
  if (c.maturity === "new" || c.maturity === "onboarding") {
    return {
      title: "Convert first reference customer",
      rationale: "Establish a beachhead account to anchor the partnership commercially.",
    };
  }
  return null;
}

// ───────────────────────────────────────────────────────────────── Summary
function buildExecutiveSummary(args: {
  momentum: Momentum;
  c: MomentumContext;
  signals: BusinessSignal[];
  rec: StrategicRecommendation | null;
  score: number | null | undefined;
}): string {
  const { momentum, c, signals, rec, score } = args;
  const lines: string[] = [];

  // Line 1 — posture
  const posture: Record<Momentum, string> = {
    Accelerating: "Healthy partner with accelerating commercial activity.",
    Growing: "Healthy partner with positive commercial momentum.",
    Stable: "Commercial relationship remains stable and predictable.",
    Slowing: "Commercial relationship is stable but business development has slowed.",
    Recovering: "Partnership is regaining traction after a quieter period.",
    Dormant: "Partnership has gone quiet and is not currently producing business.",
    "At Risk": "Partnership is showing signs of deterioration that need attention.",
    New: "Partnership is in its early phase and still taking shape.",
    Building: "Partnership is being established and commercial history is still developing.",
  };
  lines.push(posture[momentum]);

  // Line 2 — commercial state (qualitative, no numbers already shown elsewhere)
  if (momentum === "Accelerating" || momentum === "Growing") {
    lines.push("Pipeline is moving and outcomes are translating into closed business.");
  } else if (momentum === "Slowing") {
    lines.push("Existing customers remain active, however no meaningful new pipeline has been created recently.");
  } else if (momentum === "At Risk") {
    lines.push("Commercial momentum has visibly weakened and recent outcomes have been negative.");
  } else if (momentum === "Dormant") {
    lines.push("No commercial activity or relationship touchpoints have been registered for a long time.");
  } else if (momentum === "Recovering") {
    lines.push("Recent activity suggests the partner is re-engaging after a period of silence.");
  } else if (momentum === "Stable") {
    lines.push("Commercial activity is consistent without notable acceleration or deceleration.");
  } else {
    lines.push("Early commercial activity is being established and outcomes are not yet measurable.");
  }

  // Line 3 — relationship cadence
  if (Number.isFinite(c.daysSinceContact) && c.daysSinceContact <= 30) {
    lines.push("Relationship cadence is being respected.");
  } else if (c.meetingOverdueDays && c.meetingOverdueDays > 0) {
    lines.push("Scheduled relationship reviews have lapsed.");
  } else if (Number.isFinite(c.daysSinceContact) && c.daysSinceContact > 60) {
    lines.push("Relationship cadence has weakened and a deliberate touchpoint is overdue.");
  }

  // Line 4 — risk / recommendation
  const negativeSignals = signals.filter((s) => s.tone === "negative").length;
  if (momentum === "Accelerating" || momentum === "Growing") {
    if (negativeSignals === 0) lines.push("No immediate risks detected.");
    else lines.push("Some operational signals warrant monitoring despite the positive trend.");
  } else if (rec) {
    lines.push(`Recommend: ${rec.title.toLowerCase()}.`);
  }

  // Cap at 5 lines.
  return lines.slice(0, 5).join(" ");
}

// ───────────────────────────────────────────────────────────────── Insufficient data
// Distinguishes "missing information" from "negative information" so newly
// created partners are never reported as At Risk just because history is thin.
function hasInsufficientHistory(input: BriefInput): boolean {
  const notes = input.notes || [];
  const deals = input.deals || [];
  const clients = input.clients || [];
  const maturity = (input.maturity || "").toLowerCase();
  const ageDays = daysAgo(input.partner.created_at);
  const totalSignals = notes.length + deals.length + clients.length;
  const notes90 = notes.filter((n) => daysAgo(n.interaction_date || n.created_at) <= 90).length;

  if (maturity === "new") return true;
  if (maturity === "onboarding" && totalSignals < 4) return true;
  if (totalSignals === 0) return true;
  // Thin history on a recently created partner: not enough to judge trends.
  if (ageDays <= 60 && notes90 < 2 && deals.length < 2) return true;
  return false;
}

function buildNeutralSignals(input: BriefInput): BusinessSignal[] {
  const notes = input.notes || [];
  const deals = input.deals || [];
  const clients = input.clients || [];
  const out: BusinessSignal[] = [];

  if (notes.length === 0 && deals.length === 0 && clients.length === 0) {
    out.push({ label: "Relationship recently created — no interactions logged yet.", tone: "neutral" });
  } else {
    out.push({ label: "First interactions being established.", tone: "neutral" });
  }
  if (deals.length === 0) {
    out.push({ label: "Commercial history still developing.", tone: "neutral" });
  } else if (deals.length < 2) {
    out.push({ label: "Early commercial activity — no historical trend available yet.", tone: "neutral" });
  }
  if (clients.length === 0) {
    out.push({ label: "No customers registered yet under this partner.", tone: "neutral" });
  }
  return out.slice(0, 4);
}

function buildOnboardingRecommendation(input: BriefInput): StrategicRecommendation {
  const notes = input.notes || [];
  const deals = input.deals || [];
  const clients = input.clients || [];

  if (notes.length === 0) {
    return {
      title: "Capture first structured interaction",
      rationale: "Log an initial meeting to start building relationship history.",
    };
  }
  if (!input.partner.next_meeting_date) {
    return {
      title: "Establish operating cadence",
      rationale: "Schedule a recurring touchpoint to anchor the partnership rhythm.",
    };
  }
  if (deals.length === 0) {
    return {
      title: "Register first customer opportunity",
      rationale: "Initial pipeline creates a foundation for commercial assessment.",
    };
  }
  if (clients.length === 0) {
    return {
      title: "Convert first reference customer",
      rationale: "A beachhead account anchors the partnership commercially.",
    };
  }
  return {
    title: "Schedule first quarterly review",
    rationale: "Set a structured checkpoint to consolidate early progress.",
  };
}

// ───────────────────────────────────────────────────────────────── Entry
export function buildPartnerBrief(input: BriefInput): BriefData {
  const notes = input.notes || [];
  const deals = input.deals || [];
  const clients = input.clients || [];
  const maturity = (input.maturity || "").toLowerCase();

  // Insufficient-data mode: avoid confusing absence of evidence with evidence of problems.
  if (hasInsufficientHistory(input)) {
    const momentum: Momentum = maturity === "new" || (notes.length + deals.length + clients.length) === 0 ? "New" : "Building";
    const hint =
      momentum === "New"
        ? "Partnership recently created — no momentum to assess yet."
        : "Partnership is being established — history still developing.";
    const summaryParts = [
      momentum === "New"
        ? "Partnership recently established."
        : "Partnership is in its early phase and commercial history is still developing.",
      "Insufficient historical activity to determine long-term relationship health.",
      "Continue recording meetings, opportunities and commercial interactions before producing strategic conclusions.",
    ];
    return {
      isNew: momentum === "New",
      summary: summaryParts.join(" "),
      momentum,
      momentumHint: hint,
      confidence: "Low",
      confidenceReason: "Limited historical activity — assessment will improve as data accumulates.",
      signals: buildNeutralSignals(input),
      recommendation: buildOnboardingRecommendation(input),
      currentFocus: extractCurrentFocus(notes),
      openCommitments: extractOpenCommitments(notes),
      recentProgress: extractRecentProgress(input),
    };
  }

  const ctx = buildMomentumContext(input);
  const { momentum, hint } = classifyMomentum(ctx);
  const { confidence, reason: confidenceReason } = classifyConfidence(input);
  const signals = buildSignals(input, ctx);
  const recommendation = buildRecommendation(input, ctx, momentum);
  const summary = buildExecutiveSummary({
    momentum,
    c: ctx,
    signals,
    rec: recommendation,
    score: input.score,
  });

  return {
    isNew: false,
    summary,
    momentum,
    momentumHint: hint,
    confidence,
    confidenceReason,
    signals,
    recommendation,
    currentFocus: extractCurrentFocus(notes),
    openCommitments: extractOpenCommitments(notes),
    recentProgress: extractRecentProgress(input),
  };
}

