// Centralized qualification logic for Incoming Leads workspace.
// Pure functions; no AI. Logic stays transparent and editable.

export const QUALIFICATION_STAGES = [
  "New",
  "Attempted",
  "Contacted",
  "Qualified",
  "Converted",
  "Disqualified",
] as const;
export type QualificationStage = (typeof QUALIFICATION_STAGES)[number];

export const STAGE_LABEL: Record<QualificationStage, string> = {
  New: "New",
  Attempted: "Attempted",
  Contacted: "Contacted",
  Qualified: "Qualified",
  Converted: "Converted",
  Disqualified: "Disqualified",
};

/** Helpful tooltip describing what each stage really means operationally. */
export const STAGE_HINT: Record<QualificationStage, string> = {
  New: "Lead just landed. No outreach yet.",
  Attempted: "Outreach started (calls, voicemails, emails). No reply yet.",
  Contacted: "Two-way communication established (reply, conversation or meeting).",
  Qualified: "Discovery covered. Fit and intent validated.",
  Converted: "Promoted to an opportunity in the pipeline.",
  Disqualified: "Closed out — not a fit or unreachable after enough attempts.",
};

/** Normalize legacy stages into the current enum. */
export function normalizeStage(s: string | null | undefined): QualificationStage {
  if (s === "Discovery Call") return "Contacted";
  if (s === "Qualification") return "Attempted";
  if (s === "In Review") return "Attempted";
  if (s && (QUALIFICATION_STAGES as readonly string[]).includes(s)) return s as QualificationStage;
  return "New";
}

export const CATEGORY_STATUSES = ["missing", "partial", "complete"] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

export const TIMD_CATEGORIES = [
  {
    key: "interest",
    label: "Interest",
    icon: "Sparkles",
    prompt: "What's the business problem they're trying to solve?",
    questions: [
      "What made you start looking at this now?",
      "If this works out, what would be different in a year?",
      "How are you handling this day to day right now?",
    ],
  },
  {
    key: "timing",
    label: "Timing",
    icon: "Clock",
    prompt: "How urgent is this — and why now?",
    questions: [
      "Is there a date you'd ideally want to be live by?",
      "What's pushing this forward internally?",
      "If nothing changes in six months, what happens?",
    ],
  },
  {
    key: "budget",
    label: "Money / Budget",
    icon: "Wallet",
    prompt: "What's the budget conversation looking like internally?",
    questions: [
      "Have you set aside budget for this, or is it still being scoped?",
      "How do projects like this usually get approved here?",
      "What's it costing you to live with the current situation?",
    ],
  },
  {
    key: "decision",
    label: "Decision Making",
    icon: "Users",
    prompt: "Who else needs to be part of this decision?",
    questions: [
      "Besides you, who else would weigh in?",
      "Is there a sponsor at the leadership level?",
      "What does your typical buying process look like?",
    ],
  },
] as const;
export type TimdKey = (typeof TIMD_CATEGORIES)[number]["key"];

export const CURRENT_PROCESS_OPTIONS = ["Excel", "Paper", "Existing CMMS", "ERP", "Other", "None"];
export const MAIN_CHALLENGE_OPTIONS = [
  "Downtime",
  "No maintenance history",
  "No visibility",
  "Reactive maintenance",
  "Reporting difficulty",
  "Compliance / Audit",
  "Cost control",
];
export const EXISTING_SYSTEM_OPTIONS = ["None", "Excel", "ERP", "Other CMMS", "Custom in-house"];
export const DATA_VISIBILITY_OPTIONS = ["Low", "Medium", "High"];

export const FIT_FACTORS = [
  { key: "fit_pain_identified", label: "Operational pain identified", positive: true },
  { key: "fit_current_process_identified", label: "Current process identified", positive: true },
  { key: "fit_urgency_identified", label: "Urgency discussed", positive: true },
  { key: "fit_decision_maker_identified", label: "Decision maker identified", positive: true },
  { key: "fit_operational_maturity", label: "Maintenance process maturity", positive: true },
  { key: "fit_system_dissatisfaction", label: "Existing system dissatisfaction", positive: true },
] as const;
export type FitFactorKey = (typeof FIT_FACTORS)[number]["key"];

export function statusValue(s: string | null | undefined): CategoryStatus {
  if (s === "complete" || s === "partial" || s === "missing") return s;
  return "missing";
}

// Auto-suggest status based on note content. User can still override.
export function autoStatusFromNotes(notes: string | null | undefined): CategoryStatus {
  const v = (notes || "").trim();
  if (v.length === 0) return "missing";
  if (v.length < 40) return "partial";
  return "complete";
}

// Resolve final status: prefer stored value if user picked one, else auto.
export function resolvedStatus(stored: string | null | undefined, notes: string | null | undefined): CategoryStatus {
  if (stored === "complete" || stored === "partial" || stored === "missing") return stored;
  return autoStatusFromNotes(notes);
}

export function timdCompletion(lead: Record<string, any>): {
  completed: number;
  partial: number;
  missing: number;
  percent: number;
} {
  let completed = 0,
    partial = 0,
    missing = 0;
  for (const c of TIMD_CATEGORIES) {
    const s = resolvedStatus(lead[`${c.key}_status`], lead[`${c.key}_notes`]);
    if (s === "complete") completed++;
    else if (s === "partial") partial++;
    else missing++;
  }
  const total = TIMD_CATEGORIES.length;
  const percent = Math.round(((completed + partial * 0.5) / total) * 100);
  return { completed, partial, missing, percent };
}

export function fitScore(lead: Record<string, any>): {
  score: number;
  total: number;
  label: "Good Fit" | "Partial Fit" | "Fit pending";
  tone: "success" | "warning" | "destructive";
} {
  const total = FIT_FACTORS.length;
  const score = FIT_FACTORS.filter((f) => !!lead[f.key]).length;
  let label: "Good Fit" | "Partial Fit" | "Fit pending" = "Fit pending";
  let tone: "success" | "warning" | "destructive" = "warning";
  if (score >= 5) {
    label = "Good Fit";
    tone = "success";
  } else if (score >= 3) {
    label = "Partial Fit";
    tone = "warning";
  }
  return { score, total, label, tone };
}

// Positive signals vs risks — replaces raw checkbox feeling with consultative framing.
export function qualificationSignals(lead: Record<string, any>): {
  positive: { key: string; label: string }[];
  risks: { key: string; label: string }[];
} {
  const positive: { key: string; label: string }[] = [];
  const risks: { key: string; label: string }[] = [];

  for (const f of FIT_FACTORS) {
    if (lead[f.key]) positive.push({ key: f.key, label: f.label });
    else risks.push({ key: f.key, label: `${f.label} — not validated yet` });
  }
  // Add note-based signals
  if (resolvedStatus(lead.budget_status, lead.budget_notes) === "missing")
    risks.push({ key: "budget_unclear", label: "Budget still unclear" });
  if (resolvedStatus(lead.decision_status, lead.decision_notes) === "missing")
    risks.push({ key: "no_decision", label: "Decision maker not confirmed" });
  if (resolvedStatus(lead.timing_status, lead.timing_notes) === "complete")
    positive.push({ key: "timing_clear", label: "Clear timing / urgency" });

  return { positive, risks };
}

export function missingInformation(lead: Record<string, any>): string[] {
  const missing: string[] = [];
  if (resolvedStatus(lead.interest_status, lead.interest_notes) === "missing") missing.push("Lead interest level");
  if (resolvedStatus(lead.timing_status, lead.timing_notes) === "missing") missing.push("Timeline / urgency");
  if (resolvedStatus(lead.budget_status, lead.budget_notes) === "missing") missing.push("Budget range");
  if (resolvedStatus(lead.decision_status, lead.decision_notes) === "missing") missing.push("Decision maker");
  if (!lead.current_process) missing.push("Current maintenance process");
  if (!lead.main_challenge) missing.push("Main challenge");
  if (!lead.existing_system) missing.push("Existing system");
  return missing;
}

export function nextBestActions(lead: Record<string, any>): string[] {
  const actions: string[] = [];
  if (resolvedStatus(lead.interest_status, lead.interest_notes) === "missing")
    actions.push("Schedule a discovery call to qualify intent");
  if (!lead.current_process) actions.push("Validate the current maintenance process");
  if (resolvedStatus(lead.decision_status, lead.decision_notes) !== "complete")
    actions.push("Confirm the decision maker and sponsor");
  if (resolvedStatus(lead.timing_status, lead.timing_notes) === "missing")
    actions.push("Understand project urgency and timeline");
  if (resolvedStatus(lead.budget_status, lead.budget_notes) === "missing")
    actions.push("Explore budget expectations");
  if (actions.length === 0) actions.push("Lead looks ready — consider converting to opportunity");
  return actions.slice(0, 3);
}

// Top single next best action with reasoning.
export function topNextAction(lead: Record<string, any>): { title: string; reason: string } {
  const a = nextBestActions(lead)[0];
  let reason = "Based on what's captured so far.";
  if (!lead.current_process) reason = "We don't know yet how they currently manage maintenance.";
  else if (resolvedStatus(lead.decision_status, lead.decision_notes) !== "complete")
    reason = "Decision maker not yet confirmed — risk of stalling later.";
  else if (resolvedStatus(lead.timing_status, lead.timing_notes) === "missing")
    reason = "Without urgency, the deal will lack momentum.";
  return { title: a, reason };
}

// Concise discovery summary built strictly from captured fields. Not AI.
export function lastMeaningfulDiscovery(lead: Record<string, any>): string[] {
  const bits: string[] = [];
  if (lead.current_process) bits.push(`Currently using ${lead.current_process}.`);
  if (lead.main_challenge) bits.push(`Main challenge: ${String(lead.main_challenge).toLowerCase()}.`);
  if (lead.existing_system && lead.existing_system !== lead.current_process)
    bits.push(`Existing system: ${lead.existing_system}.`);
  if (lead.data_visibility) bits.push(`Data visibility reported as ${String(lead.data_visibility).toLowerCase()}.`);
  if (lead.asset_range) bits.push(`Asset range: ${lead.asset_range}.`);
  if (lead.maintenance_team_size) bits.push(`Maintenance team: ${lead.maintenance_team_size}.`);
  const interest = (lead.interest_notes || "").trim();
  if (interest) bits.push(interest.length > 140 ? `${interest.slice(0, 140)}…` : interest);
  return bits.slice(0, 4);
}

export function suggestedQuestions(lead: Record<string, any>): string[] {
  return [
    "How are you managing maintenance day to day?",
    "What's the part of the operation that frustrates you most?",
    "Are you using any system today — even spreadsheets?",
    "What made you start looking at this now?",
    "Besides you, who else would weigh in on a decision like this?",
    "If this worked well, what would change in six months?",
  ];
}

// Rich rule-based contextual guidance: pains + prompts + positioning.
export function contextualGuidance(lead: Record<string, any>): {
  title: string;
  pains?: string[];
  prompts?: string[];
  positioning?: string[];
} | null {
  switch (lead.current_process) {
    case "Excel":
    case "Paper":
      return {
        title: `Working with ${lead.current_process}`,
        pains: [
          "No reliable maintenance history",
          "Difficult reporting and KPIs",
          "Reactive — not preventive — maintenance",
          "Limited spare parts control",
          "High risk of data loss",
        ],
        prompts: [
          "How do you keep track of preventive work today?",
          "When something keeps failing, how do you usually investigate it?",
          "How do different teams share maintenance information today?",
        ],
        positioning: [
          "Preventive maintenance workflows",
          "Dashboards & KPI visibility",
          "Work order traceability",
          "Mobility for technicians",
        ],
      };
    case "Existing CMMS":
    case "Other CMMS":
      return {
        title: "Replacing an existing CMMS",
        pains: ["Low adoption", "Outdated UX", "Reports not usable by management", "Limited mobility"],
        prompts: [
          "What part of the current system frustrates the team the most?",
          "Are technicians actually using it day to day?",
          "What would it take internally to justify moving away from it?",
        ],
        positioning: ["Modern UX", "Mobile-first technicians", "Faster onboarding", "Actionable analytics"],
      };
    case "ERP":
      return {
        title: "Maintenance inside an ERP",
        pains: [
          "ERPs rarely cover field maintenance well",
          "Limited mobile experience",
          "Hard to capture preventive plans",
          "Poor asset hierarchy / criticality",
        ],
        prompts: [
          "How do technicians log what they do when they're on the floor?",
          "Is there a real preventive plan today, or is it mostly reactive?",
          "How do you decide which assets get attention first?",
        ],
        positioning: ["Specialized CMMS layer", "Integrates with ERP", "Stronger preventive workflows"],
      };
    case "None":
      return {
        title: "Greenfield opportunity",
        pains: ["No baseline data", "Unclear scope risk", "Change management critical"],
        prompts: [
          "Roughly how many assets and sites would be in scope?",
          "Is there someone internally who already champions this?",
          "Would it make sense to start small — one site or one line?",
        ],
        positioning: ["Quick-win pilot", "Phased rollout", "Best-practice templates"],
      };
    default:
      return null;
  }
}

/* =====================================================================
 * CONTEXTUAL GUIDANCE ENGINE — rule-based, deterministic, no AI.
 * Multiple guidance blocks combined from current_process + existing_system
 * + main_challenge so the assistant evolves as data is captured.
 * ===================================================================== */

export type GuidanceBlock = {
  id: string;
  title: string;
  source: "process" | "system" | "challenge" | "context";
  pains?: string[];
  prompts?: string[];
  positioning?: string[]; // legacy combined list (kept for back-compat)
  businessValue?: string[]; // outcomes
  capabilities?: string[]; // product features
  modules?: string[];
};

// Heuristic split for legacy `positioning` lists into business value vs capability.
const VALUE_HINTS = [
  "reduce", "improve", "standardiz", "visibility", "control", "lower", "faster",
  "adoption", "lifecycle", "traceability", "ready", "audit trail", "support",
  "onboarding", "tco", "scale",
];
export function splitPositioning(items: string[] | undefined): { businessValue: string[]; capabilities: string[] } {
  const businessValue: string[] = [];
  const capabilities: string[] = [];
  for (const it of items || []) {
    const v = it.toLowerCase();
    if (VALUE_HINTS.some((h) => v.includes(h))) businessValue.push(it);
    else capabilities.push(it);
  }
  return { businessValue, capabilities };
}

function guidanceForChallenge(challenge: string | null | undefined): GuidanceBlock | null {
  switch (challenge) {
    case "Reactive maintenance":
      return {
        id: "challenge-reactive",
        source: "challenge",
        title: "Reactive maintenance environment",
        pains: [
          "Excessive unplanned downtime",
          "Firefighting culture across teams",
          "Unpredictable planning and overtime costs",
          "Poor visibility on recurring failures",
        ],
        prompts: [
          "Roughly how much of the work is firefighting vs planned?",
          "How are preventive tasks scheduled today?",
          "Which assets give you the most trouble?",
          "How do you currently measure downtime?",
        ],
        positioning: [
          "Preventive maintenance planning",
          "Recurring failure analysis",
          "Downtime reduction",
          "Maintenance scheduling",
          "KPI visibility",
        ],
        modules: ["Preventive Maintenance", "Work Orders", "Reports & KPI"],
      };
    case "Downtime":
      return {
        id: "challenge-downtime",
        source: "challenge",
        title: "Downtime is the pain",
        pains: [
          "Production losses from unplanned stops",
          "Slow technician response times",
          "Limited root-cause analysis",
        ],
        prompts: [
          "What does an hour of downtime cost you, roughly?",
          "When something breaks, how quickly does the right person know?",
          "For the big failures, do you go back and figure out why?",
        ],
        positioning: ["Faster work-order dispatch", "MTBF / MTTR tracking", "Predictive insights"],
        modules: ["Work Orders", "Mobile", "Reports & KPI"],
      };
    case "No maintenance history":
      return {
        id: "challenge-history",
        source: "challenge",
        title: "No maintenance history",
        pains: [
          "Decisions made from memory, not data",
          "No traceability of past interventions",
          "Hard to justify investments",
        ],
        prompts: [
          "If I asked what was done on a specific machine last month, could you tell me?",
          "How do you prepare when an audit comes up?",
          "If you needed a year of history tomorrow, how long would that take to pull together?",
        ],
        positioning: ["Centralized maintenance history", "Asset lifecycle traceability", "Audit-ready records"],
        modules: ["Asset Management", "Work Orders", "Reports & KPI"],
      };
    case "No visibility":
    case "Reporting difficulty":
      return {
        id: "challenge-visibility",
        source: "challenge",
        title: "Limited operational visibility",
        pains: [
          "Management lacks reliable KPIs",
          "Reports built manually in spreadsheets",
          "No single source of truth across sites",
        ],
        prompts: [
          "How do you currently measure maintenance performance?",
          "How much time goes into the monthly maintenance report?",
          "Can you easily compare how different sites are doing?",
        ],
        positioning: ["Dashboards & KPIs", "Multi-site visibility", "Automated reporting", "Standardized metrics"],
        modules: ["Reports & KPI", "Dashboards"],
      };
    case "Compliance / Audit":
      return {
        id: "challenge-compliance",
        source: "challenge",
        title: "Compliance and audit pressure",
        pains: ["Manual evidence collection", "Risk of non-conformities", "Slow audit preparation"],
        prompts: [
          "What standards or audits do you have to comply with?",
          "How do you gather the evidence auditors ask for today?",
          "Have any recent audits flagged anything painful?",
        ],
        positioning: ["Audit trail", "Standard operating procedures", "Document control"],
        modules: ["Work Orders", "Document Management"],
      };
    case "Cost control":
      return {
        id: "challenge-cost",
        source: "challenge",
        title: "Cost control challenge",
        pains: ["Maintenance spend not tied to assets", "Spare parts overstock or rupture", "No cost-per-asset view"],
        prompts: [
          "Can you see what each asset or line is actually costing you?",
          "How do you manage spare parts — overstock or rupture issues?",
          "Do work orders capture real costs, or is that done separately?",
        ],
        positioning: ["Cost-per-asset tracking", "Stock optimization", "Budget control"],
        modules: ["Stock Management", "Reports & KPI"],
      };
    default:
      return null;
  }
}

function guidanceForSystem(system: string | null | undefined): GuidanceBlock | null {
  switch (system) {
    case "Other CMMS":
      return {
        id: "system-old-cmms",
        source: "system",
        title: "Replacing an existing CMMS",
        pains: ["Low user adoption", "Outdated UI", "Weak mobility", "Reports unusable by management"],
        prompts: [
          "What do people complain about most with the current tool?",
          "Are technicians really using it, or working around it?",
          "What's pushing you to look at alternatives now?",
        ],
        positioning: ["User-friendly adoption", "Mobility for technicians", "Modern workflows", "Implementation support"],
        modules: ["Mobile", "Work Orders", "Reports & KPI"],
      };
    case "Custom in-house":
      return {
        id: "system-custom",
        source: "system",
        title: "Custom in-house tool",
        pains: ["Dependency on a single developer", "No roadmap or updates", "Hard to scale"],
        prompts: [
          "Who keeps the in-house tool running today?",
          "What happens to it if that person moves on?",
          "Could it actually scale to other sites or teams?",
        ],
        positioning: ["Standard product with roadmap", "Vendor support", "Lower TCO long-term"],
      };
    default:
      return null;
  }
}

export function contextualGuidanceAll(lead: Record<string, any>): GuidanceBlock[] {
  const blocks: GuidanceBlock[] = [];
  const p = contextualGuidance(lead);
  if (p) blocks.push({ id: "process", source: "process", ...p });
  const s = guidanceForSystem(lead.existing_system);
  if (s) blocks.push(s);
  const c = guidanceForChallenge(lead.main_challenge);
  if (c) blocks.push(c);
  return blocks;
}

/* ---------- Discovery Insights ---------- */

export type DiscoveryInsight = { id: string; label: string; tone: "neutral" | "positive" | "warning" };

export function discoveryInsights(lead: Record<string, any>): DiscoveryInsight[] {
  const out: DiscoveryInsight[] = [];
  if (lead.current_process === "Excel" || lead.current_process === "Paper")
    out.push({ id: "manual", label: `Maintenance managed in ${lead.current_process}`, tone: "warning" });
  if (lead.current_process === "ERP")
    out.push({ id: "erp", label: "Maintenance handled inside an ERP", tone: "neutral" });
  if (lead.current_process === "None")
    out.push({ id: "none", label: "No structured maintenance process", tone: "warning" });
  if (lead.main_challenge === "Reactive maintenance")
    out.push({ id: "reactive", label: "Reactive maintenance environment", tone: "warning" });
  else if (lead.main_challenge)
    out.push({ id: `chal`, label: `Main pain: ${String(lead.main_challenge).toLowerCase()}`, tone: "neutral" });
  if (lead.existing_system && lead.existing_system !== "None")
    out.push({ id: "system", label: `Existing system: ${lead.existing_system}`, tone: "neutral" });
  if (lead.data_visibility === "Low")
    out.push({ id: "vis-low", label: "Low operational data visibility", tone: "warning" });
  if (lead.data_visibility === "High")
    out.push({ id: "vis-high", label: "Strong operational data visibility", tone: "positive" });
  if (lead.asset_range)
    out.push({ id: "assets", label: `Asset base: ${lead.asset_range}`, tone: "neutral" });
  if (lead.maintenance_team_size)
    out.push({ id: "team", label: `Maintenance team: ${lead.maintenance_team_size}`, tone: "neutral" });
  if (resolvedStatus(lead.decision_status, lead.decision_notes) !== "complete")
    out.push({ id: "no-dm", label: "Decision maker not yet confirmed", tone: "warning" });
  if (resolvedStatus(lead.timing_status, lead.timing_notes) === "complete")
    out.push({ id: "timing", label: "Clear timeline and urgency", tone: "positive" });
  if (lead.fit_pain_identified)
    out.push({ id: "pain", label: "Operational pain validated", tone: "positive" });
  return out.slice(0, 8);
}

/* ---------- Positioning Help ---------- */

export type PositioningHint = { id: string; emphasis: string; reason: string };

export function positioningHelp(lead: Record<string, any>): PositioningHint[] {
  const out: PositioningHint[] = [];
  if (lead.current_process === "Excel" || lead.current_process === "Paper")
    out.push({
      id: "preventive",
      emphasis: "Preventive maintenance workflows",
      reason: `Managing maintenance in ${lead.current_process} — no structured prevention today.`,
    });
  if (lead.main_challenge === "No visibility" || lead.main_challenge === "Reporting difficulty")
    out.push({
      id: "kpi",
      emphasis: "Dashboards, KPIs and analytics",
      reason: "Reporting and visibility flagged as the main pain.",
    });
  if (lead.maintenance_team_size && /[5-9]|[1-9]\d/.test(String(lead.maintenance_team_size)))
    out.push({
      id: "mobility",
      emphasis: "Mobile work orders for technicians",
      reason: "Sizeable maintenance team — mobility unlocks productivity.",
    });
  if (lead.asset_range && /\d{3,}/.test(String(lead.asset_range)))
    out.push({
      id: "assets",
      emphasis: "Asset hierarchy and criticality",
      reason: "Large asset base requires structured asset management.",
    });
  if (lead.existing_system === "Other CMMS" || lead.existing_system === "Custom in-house")
    out.push({
      id: "adoption",
      emphasis: "User-friendly adoption",
      reason: "Replacing a system — adoption is the #1 risk to mitigate.",
    });
  if (lead.main_challenge === "Cost control")
    out.push({
      id: "stock",
      emphasis: "Stock and spare parts control",
      reason: "Cost control flagged — spare parts are usually a quick win.",
    });
  if (lead.main_challenge === "Compliance / Audit")
    out.push({
      id: "audit",
      emphasis: "Audit trail and traceability",
      reason: "Compliance pressure — emphasize evidence and traceability.",
    });
  return out;
}

/* ---------- Likely Risks ---------- */

export type RiskHint = { id: string; label: string; hint: string };

export function likelyRisks(lead: Record<string, any>): RiskHint[] {
  const out: RiskHint[] = [];
  if (resolvedStatus(lead.timing_status, lead.timing_notes) === "missing")
    out.push({ id: "no-urgency", label: "No urgency identified", hint: "Deals without timing stall." });
  if (resolvedStatus(lead.decision_status, lead.decision_notes) !== "complete")
    out.push({ id: "no-dm", label: "Decision maker unclear", hint: "Map the buying committee early." });
  if (resolvedStatus(lead.budget_status, lead.budget_notes) === "missing")
    out.push({ id: "no-budget", label: "Budget unclear", hint: "Explore how similar investments get approved." });
  if (!lead.fit_pain_identified)
    out.push({ id: "no-pain", label: "Operational pain not validated", hint: "Without pain there's no project." });
  if (lead.data_visibility === "Low" && !lead.main_challenge)
    out.push({ id: "low-maturity", label: "Low operational maturity", hint: "Expect a longer education cycle." });
  if (lead.lead_source === "Website" && !lead.contact_name)
    out.push({ id: "exploratory", label: "Exploratory inbound lead", hint: "Qualify intent before investing time." });
  return out;
}

/* ---------- Knowledge Snippets (ManWinWin positioning) ---------- */

export type KnowledgeSnippet = { id: string; title: string; body: string };

const SNIPPET_LIBRARY: Record<string, KnowledgeSnippet> = {
  preventive: { id: "preventive", title: "Preventive maintenance", body: "Plan recurring interventions by time, usage or condition — reduce failures before they happen." },
  kpi: { id: "kpi", title: "KPI visibility", body: "Out-of-the-box dashboards for MTBF, MTTR, compliance rate and backlog — no spreadsheets." },
  mobility: { id: "mobility", title: "Technician mobility", body: "Mobile work orders with QR codes, photos and signatures — technicians work where assets are." },
  stock: { id: "stock", title: "Spare parts visibility", body: "Stock control tied to work orders — avoid both rupture and overstock." },
  multisite: { id: "multisite", title: "Multi-site management", body: "Centralized configuration with site-level autonomy — standardize KPIs across operations." },
  adoption: { id: "adoption", title: "User-friendly adoption", body: "Designed for technicians, not IT — fast onboarding and high daily usage." },
  assets: { id: "assets", title: "Asset hierarchy", body: "Structure assets by site, line and criticality — drive priorities from data." },
};

export function knowledgeSnippets(lead: Record<string, any>): KnowledgeSnippet[] {
  const ids = new Set<string>();
  if (["Excel", "Paper", "None"].includes(lead.current_process)) ids.add("preventive");
  if (lead.main_challenge === "No visibility" || lead.main_challenge === "Reporting difficulty") ids.add("kpi");
  if (lead.maintenance_team_size) ids.add("mobility");
  if (lead.main_challenge === "Cost control") ids.add("stock");
  if (lead.asset_range && /\d{3,}/.test(String(lead.asset_range))) ids.add("assets");
  if (["Other CMMS", "Custom in-house"].includes(lead.existing_system)) ids.add("adoption");
  if (lead.fit_operational_maturity) ids.add("multisite");
  return Array.from(ids).map((id) => SNIPPET_LIBRARY[id]).filter(Boolean);
}

/* =====================================================================
 * OPERATIONAL HELPERS — cadence, SLA, dynamic NBA, readiness, templates.
 * All pure, deterministic, no AI, no auto-actions.
 * ===================================================================== */

export type AttemptLike = {
  outcome: string;
  channel?: string;
  performed_at?: string;
};

export type TaskLike = {
  status: string;
  due_date?: string | null;
};

/** Engagement health derived purely from outreach attempts and responses. */
export function engagementHealthFromAttempts(attempts: AttemptLike[]): string {
  if (!attempts || attempts.length === 0) return "New";
  const replied = attempts.some((a) => a.outcome === "reached" || a.outcome === "replied");
  const scheduled = attempts.some((a) => a.outcome === "scheduled");
  const unreachable = attempts.some((a) => a.outcome === "unreachable");
  const emailSent = attempts.some((a) => a.channel === "email");
  const failedCalls = attempts.filter((a) =>
    ["no_answer", "left_voicemail", "bounced"].includes(a.outcome),
  ).length;
  // True engagement requires a response — failed calls never count as contact.
  if (scheduled) return "Discovery Scheduled";
  if (replied) return "In Conversation";
  if (unreachable || failedCalls >= 5) return "Unreachable";
  if (failedCalls >= 3) return "Silent";
  if (emailSent) return "Outreach Sent";
  return "Outreach Attempted";
}

export function attemptCounts(attempts: AttemptLike[]) {
  const calls = attempts.filter((a) => a.channel === "call").length;
  const emails = attempts.filter((a) => a.channel === "email").length;
  const linkedin = attempts.filter((a) => a.channel === "linkedin").length;
  const meetings = attempts.filter((a) => a.channel === "meeting").length;
  const failed = attempts.filter((a) =>
    ["no_answer", "left_voicemail", "bounced"].includes(a.outcome),
  ).length;
  const replied = attempts.filter((a) => a.outcome === "reached" || a.outcome === "replied").length;
  return { total: attempts.length, calls, emails, linkedin, meetings, failed, replied };
}

/** Suggested cadence steps — assistive coaching only, never auto-creates anything. */
export function cadenceGuidance(attempts: AttemptLike[]): {
  step: string;
  suggestions: string[];
  tone: "neutral" | "warning" | "destructive" | "positive";
} {
  const counts = attemptCounts(attempts);
  const last = attempts[0]; // assumed sorted desc
  const reached = counts.replied > 0;

  if (reached) {
    return {
      step: "Reached — keep momentum",
      tone: "positive",
      suggestions: [
        "Confirm next step in writing",
        "Send a short recap email",
        "Book a discovery slot",
      ],
    };
  }

  if (counts.total === 0) {
    return {
      step: "No outreach yet",
      tone: "neutral",
      suggestions: [
        "Open with a short qualification call",
        "Or send a short intro email — a couple of operational questions count as micro-discovery",
        "Confirm the right contact is in the record",
      ],
    };
  }

  if (counts.failed >= 5) {
    return {
      step: "Repeated no-response — decide outcome",
      tone: "destructive",
      suggestions: [
        "Send a final break-up email",
        "Move to nurture for re-engagement later",
        "Disqualify as unreachable if no signal",
      ],
    };
  }

  if (counts.failed >= 3) {
    return {
      step: "Several attempts without response",
      tone: "warning",
      suggestions: [
        "Try a LinkedIn message or a different contact",
        "Send a value-oriented email referencing their sector",
        "Move to nurture if business priorities have shifted",
      ],
    };
  }

  if (counts.total === 1) {
    return {
      step: "First outreach logged — no response yet",
      tone: "neutral",
      suggestions: [
        "Retry in 2 days at a different time window",
        "Send a short email with one or two operational questions",
        "Try the company main line if the direct number failed",
      ],
    };
  }

  // counts.total === 2
  return {
    step: "Two attempts without response",
    tone: "neutral",
    suggestions: [
      last?.channel === "call"
        ? "Switch to email with a clear value angle"
        : "Try a call in the morning window",
      "Add a LinkedIn touch — keep it short",
      "Confirm contact details are still valid",
    ],
  };
}

/** SLA bucket from creation timestamp. */
export function slaBucket(createdAt: string | Date | null | undefined, lastContactAt?: string | null): {
  hoursSinceCreated: number;
  hoursSinceLastContact: number | null;
  bucket: "healthy" | "warning" | "critical";
  label: string;
} {
  if (!createdAt) {
    return { hoursSinceCreated: 0, hoursSinceLastContact: null, bucket: "healthy", label: "—" };
  }
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const hoursSinceCreated = Math.round((now - created) / 36e5);
  const hoursSinceLastContact = lastContactAt
    ? Math.round((now - new Date(lastContactAt).getTime()) / 36e5)
    : null;

  // SLA measured against first response — if a contact happened, treat as healthy.
  let bucket: "healthy" | "warning" | "critical" = "healthy";
  let label = `${hoursSinceCreated}h since created`;
  if (lastContactAt) {
    bucket = "healthy";
    label = `First contact within ${Math.max(1, Math.round((new Date(lastContactAt).getTime() - created) / 36e5))}h`;
  } else if (hoursSinceCreated >= 72) {
    bucket = "critical";
    label = `${hoursSinceCreated}h with no outbound activity`;
  } else if (hoursSinceCreated >= 48) {
    bucket = "warning";
    label = `${hoursSinceCreated}h with no outbound activity`;
  } else if (hoursSinceCreated >= 24) {
    bucket = "warning";
    label = `${hoursSinceCreated}h since created`;
  }
  return { hoursSinceCreated, hoursSinceLastContact, bucket, label };
}

/** Dynamic Next Best Action — reactive to attempts, tasks and qualification data. */
export function nextBestActionDynamic(
  lead: Record<string, any>,
  attempts: AttemptLike[],
  tasks: TaskLike[],
): { title: string; reason: string; cta?: "log_contact" | "create_task" | "convert" | "schedule_discovery" } {
  const openTasks = tasks.filter((t) => t.status !== "Done");
  const counts = attemptCounts(attempts);
  const reached = counts.replied > 0;

  if (counts.total === 0 && openTasks.length === 0) {
    return {
      title: "Schedule the first qualification touch",
      reason: "No outbound attempts or planned tasks yet.",
      cta: "create_task",
    };
  }
  if (counts.failed >= 5 && !reached) {
    return {
      title: "Decide: nurture or disqualify",
      reason: "Five or more attempts without any response.",
    };
  }
  if (counts.failed >= 3 && !reached) {
    return {
      title: "Switch channel and try again",
      reason: "Multiple failed attempts on the current channel.",
      cta: "log_contact",
    };
  }
  if (openTasks.length > 0) {
    return {
      title: "Execute the next open qualification task",
      reason: `${openTasks.length} task${openTasks.length > 1 ? "s" : ""} pending.`,
    };
  }
  if (reached) {
    const readiness = qualificationReadiness(lead);
    if (readiness.ready) {
      return {
        title: "Lead looks ready — review for conversion",
        reason: "Discovery covered, fit signals captured.",
        cta: "convert",
      };
    }
    return {
      title: "Complete the missing qualification points",
      reason: readiness.missing[0] || "Close the discovery gaps.",
    };
  }
  return {
    title: "Log your next contact attempt",
    reason: "Keep the cadence alive.",
    cta: "log_contact",
  };
}

/** Operational readiness — lightweight, no fake scoring. */
export type ReadinessItem = { key: string; label: string; done: boolean };

export function qualificationReadiness(lead: Record<string, any>): {
  items: ReadinessItem[];
  done: number;
  total: number;
  pct: number;
  ready: boolean;
  missing: string[];
} {
  const items: ReadinessItem[] = [
    { key: "pain", label: "Operational pain identified", done: !!lead.fit_pain_identified },
    { key: "dm", label: "Decision maker identified", done: !!lead.fit_decision_maker_identified },
    { key: "discovery", label: "Initial qualification completed",
      done: resolvedStatus(lead.interest_status, lead.interest_notes) !== "missing" },
    { key: "fit", label: "Potential fit validated",
      done: !!(lead.fit_current_process_identified || lead.fit_system_dissatisfaction) },
    { key: "next", label: "Next step agreed",
      done: resolvedStatus(lead.timing_status, lead.timing_notes) !== "missing" },
  ];
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = Math.round((done / total) * 100);
  const missing = items.filter((i) => !i.done).map((i) => i.label);
  // "Ready" = pain + decision maker + at least one of fit / discovery covered.
  const ready = !!lead.fit_pain_identified
    && !!lead.fit_decision_maker_identified
    && items.find((i) => i.key === "discovery")!.done;
  return { items, done, total, pct, ready, missing };
}

/** Qualification-only task templates (no proposal / negotiation / closing). */
export type LeadTaskTemplate = {
  id: string;
  label: string;
  title: string;
  priority: "Low" | "Medium" | "High";
  dueInDays: number;
  description?: string;
};

export const LEAD_TASK_TEMPLATES: LeadTaskTemplate[] = [
  {
    id: "qual_call",
    label: "Initial Qualification Call",
    title: "Initial qualification call",
    priority: "High",
    dueInDays: 1,
    description: "First call to understand context, pain and current process.",
  },
  {
    id: "retry_contact",
    label: "Retry Contact",
    title: "Retry contact",
    priority: "Medium",
    dueInDays: 2,
    description: "Retry the previous channel at a different time window.",
  },
  {
    id: "intro_email",
    label: "Send Intro / Follow-up Email",
    title: "Send introduction / follow-up email",
    priority: "Medium",
    dueInDays: 1,
    description: "Short email referencing sector and main pain.",
  },
  {
    id: "discovery_call",
    label: "Discovery Call",
    title: "Discovery call",
    priority: "High",
    dueInDays: 3,
    description: "Deeper conversation on operations, decision process and timing.",
  },
  {
    id: "qual_review",
    label: "Qualification Review",
    title: "Qualification review",
    priority: "Medium",
    dueInDays: 2,
    description: "Internal review of qualification readiness and next step.",
  },
  {
    id: "contact_validation",
    label: "Validate Contact Details",
    title: "Validate contact details",
    priority: "Low",
    dueInDays: 1,
    description: "Confirm the right contact, role and channel.",
  },
  {
    id: "dm_confirmation",
    label: "Decision Maker Confirmation",
    title: "Confirm decision maker",
    priority: "High",
    dueInDays: 3,
    description: "Identify and confirm who owns the decision internally.",
  },
];

