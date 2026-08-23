/**
 * Prospecting — Target Account domain helpers (pure, no network).
 *
 * SEMANTIC BOUNDARY — read before adding anything here.
 *
 *   Target Account  = a company we chose to research. No relationship required.
 *   Lead            = company + person with real two-way engagement (incoming_leads).
 *   Opportunity     = qualified, valued pursuit (deals).
 *   Client          = paying customer (clients).
 *
 * The /12 priority score prioritises SALES ATTENTION. It is NOT purchase
 * probability. Budget, timeline, TIMD, expected value, probability, close date,
 * product recommendation and proposal data must never appear in this module.
 */

/* ---------------------------------------------------------------- statuses */

export const TARGET_ACCOUNT_STATUSES = [
  "Researching",
  "Ready for Outreach",
  "Deprioritised",
  "Converted",
] as const;
export type TargetAccountStatus = (typeof TARGET_ACCOUNT_STATUSES)[number];

export function normalizeTargetStatus(s: string | null | undefined): TargetAccountStatus {
  return (TARGET_ACCOUNT_STATUSES as readonly string[]).includes(s ?? "")
    ? (s as TargetAccountStatus)
    : "Researching";
}

export function statusTone(
  s: TargetAccountStatus
): "neutral" | "primary" | "success" | "warning" {
  switch (s) {
    case "Researching":
      return "primary";
    case "Ready for Outreach":
      return "success";
    case "Deprioritised":
      return "warning";
    case "Converted":
      return "neutral";
  }
}

/** Allowed lifecycle transitions. Outreach happens *inside* Ready for Outreach. */
const TRANSITIONS: Record<TargetAccountStatus, TargetAccountStatus[]> = {
  Researching: ["Ready for Outreach", "Deprioritised"],
  "Ready for Outreach": ["Researching", "Deprioritised", "Converted"],
  Deprioritised: ["Researching"],
  Converted: [],
};

export function canTransition(from: TargetAccountStatus, to: TargetAccountStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: TargetAccountStatus): TargetAccountStatus[] {
  return TRANSITIONS[from];
}

/* ------------------------------------------------------------ vocabularies */

export type VocabEntry = { key: string; label: string };

/** Block 2 — Why It Fits (maintenance-fit indicators). */
export const FIT_INDICATORS: VocabEntry[] = [
  { key: "asset_intensive", label: "Asset-intensive operation" },
  { key: "critical_assets", label: "Critical assets / operational continuity" },
  { key: "dedicated_maintenance_org", label: "Dedicated maintenance organisation" },
  { key: "multi_site", label: "Multiple sites / distributed operation" },
  { key: "planned_maintenance", label: "Significant planned maintenance" },
  { key: "spare_parts_complexity", label: "Spare-parts complexity" },
  { key: "traceability_compliance", label: "Traceability / compliance needs" },
  { key: "service_maintenance_complexity", label: "Customer/service maintenance complexity" },
];

/** Block 4 — Signal types. A signal is only a reason to look closer. */
export const SIGNAL_TYPES: VocabEntry[] = [
  { key: "expansion_new_site", label: "Expansion / new site" },
  { key: "new_equipment_capex", label: "New equipment / CAPEX" },
  { key: "maintenance_hiring", label: "Maintenance hiring" },
  { key: "new_leadership", label: "New leadership" },
  { key: "digital_transformation", label: "Digital transformation" },
  { key: "erp_technology_project", label: "ERP / technology project" },
  { key: "compliance_audit", label: "Compliance / audit" },
  { key: "sustainability_efficiency", label: "Sustainability / efficiency initiative" },
  { key: "acquisition_growth", label: "Acquisition / growth" },
  { key: "new_contract_service_expansion", label: "New contract / service expansion" },
  { key: "other", label: "Other" },
];

/** Block 5 — Role in the potential conversation. */
export const CONVERSATION_ROLES: VocabEntry[] = [
  { key: "maintenance_problem_owner", label: "Maintenance / Problem Owner" },
  { key: "operations", label: "Operations" },
  { key: "management", label: "Management" },
  { key: "it_technical", label: "IT / Technical" },
  { key: "finance_economic", label: "Finance / Economic" },
  { key: "quality_hse", label: "Quality / HSE" },
  { key: "user_influencer", label: "User / Influencer" },
  { key: "unknown", label: "Unknown" },
];

/** Block 6 — Structured unknowns. */
export const UNKNOWN_TYPES: VocabEntry[] = [
  { key: "current_system_process", label: "Current maintenance system / process" },
  { key: "main_challenges", label: "Main maintenance challenges" },
  { key: "team_size", label: "Maintenance team size" },
  { key: "asset_environment", label: "Approximate asset environment" },
  { key: "current_priorities", label: "Current priorities" },
  { key: "stakeholders", label: "Stakeholders" },
  { key: "project_timing", label: "Current project / timing" },
  { key: "other", label: "Other" },
];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export function labelFor(vocab: VocabEntry[], key: string | null | undefined): string {
  return vocab.find((v) => v.key === key)?.label ?? (key || "—");
}

/* -------------------------------------------------------------- scoring /12 */

export interface ScoreInput {
  fit_score?: number | null;
  complexity_score?: number | null;
  signal_score?: number | null;
  access_score?: number | null;
}

export type PriorityBand = "High" | "Medium" | "Low";

export const SCORE_DIMENSIONS: Array<{
  key: keyof ScoreInput;
  label: string;
  hint: string;
}> = [
  { key: "fit_score", label: "Fit", hint: "How well the maintenance profile matches what we solve" },
  { key: "complexity_score", label: "Complexity", hint: "How much maintenance complexity we can see" },
  { key: "signal_score", label: "Signal", hint: "Strength and freshness of the signals found" },
  { key: "access_score", label: "Access", hint: "How reachable the right people appear to be" },
];

function clamp03(n: number | null | undefined): number {
  const v = Math.trunc(Number(n ?? 0));
  if (!Number.isFinite(v)) return 0;
  return Math.min(3, Math.max(0, v));
}

export function priorityTotal(s: ScoreInput): number {
  return (
    clamp03(s.fit_score) +
    clamp03(s.complexity_score) +
    clamp03(s.signal_score) +
    clamp03(s.access_score)
  );
}

export function priorityBand(total: number): PriorityBand {
  if (total >= 9) return "High";
  if (total >= 6) return "Medium";
  return "Low";
}

/* --------------------------------------------------- research completeness */

export interface CompletenessInput {
  country?: string | null;
  industry?: string | null;
  fit_indicators?: unknown;
  fit_score?: number | null;
  maintenance_hypothesis?: string | null;
  key_research_gap?: string | null;
  evidenceCount?: number;
  signalCount?: number;
  peopleWithRoleCount?: number;
}

export function asKeyArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

const hasText = (s: string | null | undefined) => !!s && s.trim().length > 0;

/** Eight equally-weighted checks. Derived only — never stored. */
export function researchChecks(a: CompletenessInput): Array<{ label: string; done: boolean }> {
  return [
    { label: "Country and industry", done: hasText(a.country) && hasText(a.industry) },
    { label: "At least one fit indicator", done: asKeyArray(a.fit_indicators).length > 0 },
    { label: "Fit score set", done: clamp03(a.fit_score) > 0 },
    { label: "At least one evidence record", done: (a.evidenceCount ?? 0) > 0 },
    { label: "Maintenance hypothesis", done: hasText(a.maintenance_hypothesis) },
    { label: "At least one signal", done: (a.signalCount ?? 0) > 0 },
    { label: "A person with a conversation role", done: (a.peopleWithRoleCount ?? 0) > 0 },
    { label: "Key research gap", done: hasText(a.key_research_gap) },
  ];
}

export function researchCompleteness(a: CompletenessInput): number {
  const checks = researchChecks(a);
  const done = checks.filter((c) => c.done).length;
  return Math.round((done / checks.length) * 100);
}

export function missingResearchItems(a: CompletenessInput): string[] {
  return researchChecks(a)
    .filter((c) => !c.done)
    .map((c) => c.label);
}

/** Soft gate for Researching -> Ready for Outreach. Warns, never blocks. */
export function readinessWarnings(a: CompletenessInput): string[] {
  const warn: string[] = [];
  if (asKeyArray(a.fit_indicators).length === 0) warn.push("No fit indicators selected");
  if ((a.evidenceCount ?? 0) === 0) warn.push("No evidence recorded");
  if (!hasText(a.maintenance_hypothesis)) warn.push("No maintenance hypothesis");
  if ((a.peopleWithRoleCount ?? 0) === 0) warn.push("No person with a conversation role");
  return warn;
}

/* --------------------------------------------------------- company identity */

/** Normalise a website into a comparable domain. Returns "" when unusable. */
export function normaliseDomain(input: string | null | undefined): string {
  const raw = (input || "").trim().toLowerCase();
  if (!raw) return "";
  const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const host = withoutScheme.split(/[/?#]/)[0].replace(/^www\./, "").replace(/\.$/, "");
  if (!host.includes(".") || /\s/.test(host)) return "";
  return host;
}

const LEGAL_SUFFIXES = [
  "inc","llc","ltd","limited","gmbh","bv","nv","sa","sas","srl","spa","plc","ab","as","oy",
  "lda","sl","pty","co","corp","corporation","company","group","holding","holdings","kg","ag",
];

/** Normalise a company name for duplicate matching only (never for display). */
export function normaliseCompanyName(input: string | null | undefined): string {
  const base = (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const trimmed = base.filter((w) => !LEGAL_SUFFIXES.includes(w));
  return (trimmed.length ? trimmed : base).join(" ");
}

export interface DuplicateCandidate {
  entity: "Target Account" | "Lead" | "Opportunity" | "Client";
  id: string;
  name: string;
  route: string;
  matchedOn: "domain" | "name";
}

/** Soft-warning matcher. Domain wins over name; result is advisory only. */
export function matchDuplicates(
  input: { company_name?: string | null; website_domain?: string | null },
  candidates: Array<Omit<DuplicateCandidate, "matchedOn"> & { domain?: string | null }>
): DuplicateCandidate[] {
  const domain = normaliseDomain(input.website_domain);
  const name = normaliseCompanyName(input.company_name);
  const out: DuplicateCandidate[] = [];
  for (const c of candidates) {
    const cDomain = normaliseDomain(c.domain);
    if (domain && cDomain && cDomain === domain) {
      out.push({ ...c, matchedOn: "domain" });
      continue;
    }
    if (name && normaliseCompanyName(c.name) === name) {
      out.push({ ...c, matchedOn: "name" });
    }
  }
  return out;
}

/* ------------------------------------------------------------- conversion */

export interface ConversionGateInput {
  status: TargetAccountStatus;
  primaryContact?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
}

/** A Lead is created ONLY by an explicit action, from Ready for Outreach. */
export function canCreateLead(input: ConversionGateInput): { ok: boolean; reason?: string } {
  if (input.status !== "Ready for Outreach") {
    return { ok: false, reason: "Only accounts marked Ready for Outreach can become a Lead." };
  }
  const c = input.primaryContact;
  if (!c || !hasText(c.full_name)) {
    return { ok: false, reason: "Set a primary prospecting contact first." };
  }
  if (!hasText(c.email) && !hasText(c.phone)) {
    return { ok: false, reason: "The primary contact needs an email or a phone number." };
  }
  return { ok: true };
}

/** Context digest carried into the lead's notes (research stays on the account). */
export function buildLeadNotes(a: {
  maintenance_hypothesis?: string | null;
  key_research_gap?: string | null;
  evidence?: Array<{ fact: string; source?: string | null }>;
  signals?: Array<{ signal_type: string; description?: string | null }>;
}): string {
  const parts: string[] = ["Created from a Target Account (Prospecting)."];
  if (hasText(a.maintenance_hypothesis)) {
    parts.push(`Maintenance hypothesis: ${a.maintenance_hypothesis!.trim()}`);
  }
  if (hasText(a.key_research_gap)) {
    parts.push(`Key research gap: ${a.key_research_gap!.trim()}`);
  }
  if (a.evidence?.length) {
    parts.push(
      "Evidence:\n" +
        a.evidence
          .slice(0, 5)
          .map((e) => `- ${e.fact}${e.source ? ` (${e.source})` : ""}`)
          .join("\n")
    );
  }
  if (a.signals?.length) {
    parts.push(
      "Signals:\n" +
        a.signals
          .slice(0, 5)
          .map((s) => `- ${labelFor(SIGNAL_TYPES, s.signal_type)}${s.description ? `: ${s.description}` : ""}`)
          .join("\n")
    );
  }
  return parts.join("\n\n");
}
