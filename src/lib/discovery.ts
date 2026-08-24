/**
 * DISCOVERY WORKSPACE (Academy Module 7)
 * CURRENT -> PROBLEM -> IMPACT -> FUTURE -> ALIGN.
 *
 * One canonical discovery record travels with the commercial journey: it is
 * created on the Lead and continues, read/write, on the converted Opportunity.
 * Pure helpers only — no network, no invented sales score.
 */

export type DiscoverySectionKey = "current" | "problem" | "impact" | "future" | "align";

export interface DiscoveryField {
  key: string;
  label: string;
  hint?: string;
  kind: "text" | "textarea" | "select" | "date";
  options?: { key: string; label: string }[];
  /** Counts towards the section's completeness. */
  core?: boolean;
}

export interface DiscoverySection {
  key: DiscoverySectionKey;
  label: string;
  purpose: string;
  fields: DiscoveryField[];
}

const CONFIDENCE_OPTIONS = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

const EVIDENCE_LEVEL_OPTIONS = [
  { key: "customer_stated", label: "Stated by customer" },
  { key: "observed", label: "Observed / documented" },
  { key: "estimated", label: "Our estimate" },
  { key: "hypothesis", label: "Hypothesis" },
];

export const VALIDATION_STATUSES = [
  { key: "not_shared", label: "Not shared yet" },
  { key: "shared", label: "Shared with customer" },
  { key: "validated", label: "Validated by customer" },
  { key: "corrected", label: "Corrected by customer" },
];

export const DISCOVERY_SECTIONS: DiscoverySection[] = [
  {
    key: "current",
    label: "Current",
    purpose: "How maintenance actually runs today — facts, hypotheses and unknowns kept apart.",
    fields: [
      { key: "current_process", label: "Current process", kind: "textarea", core: true },
      { key: "current_people", label: "People involved", kind: "textarea", core: true },
      { key: "current_tools", label: "Tools / systems", kind: "textarea", core: true },
      { key: "current_workflow", label: "Workflow", kind: "textarea" },
      { key: "current_known_facts", label: "Known facts", hint: "Confirmed by the customer.", kind: "textarea" },
      { key: "current_hypotheses", label: "Hypotheses", hint: "Our assumptions — not yet confirmed.", kind: "textarea" },
      { key: "current_unknowns", label: "Unknowns", hint: "What we still need to ask.", kind: "textarea" },
    ],
  },
  {
    key: "problem",
    label: "Problem",
    purpose: "A problem the customer recognises, with a concrete example.",
    fields: [
      { key: "problem_statement", label: "Problem statement", kind: "textarea", core: true },
      { key: "problem_evidence", label: "Evidence / example", kind: "textarea", core: true },
      { key: "problem_frequency", label: "Frequency", kind: "text" },
      { key: "problem_scope", label: "Scope", kind: "text" },
      { key: "problem_affected", label: "Affected teams / assets", kind: "textarea" },
      { key: "root_cause_confidence", label: "Root-cause confidence", kind: "select", options: CONFIDENCE_OPTIONS },
    ],
  },
  {
    key: "impact",
    label: "Impact",
    purpose: "What the problem costs today, and what happens if nothing changes.",
    fields: [
      { key: "impact_operational", label: "Operational impact", kind: "textarea", core: true },
      { key: "impact_financial", label: "Financial impact", kind: "textarea", core: true },
      { key: "impact_risk", label: "Risk / compliance impact", kind: "textarea" },
      { key: "impact_customer", label: "Customer / service impact", kind: "textarea" },
      { key: "impact_people", label: "People impact", kind: "textarea" },
      { key: "cost_of_inaction", label: "Cost of inaction", kind: "textarea", core: true },
      { key: "impact_evidence_level", label: "Evidence level", kind: "select", options: EVIDENCE_LEVEL_OPTIONS },
    ],
  },
  {
    key: "future",
    label: "Future",
    purpose: "The outcome the customer wants and how they will judge success.",
    fields: [
      { key: "future_desired_outcomes", label: "Desired outcomes", kind: "textarea", core: true },
      { key: "future_priorities", label: "Priorities", kind: "textarea" },
      { key: "future_success_criteria", label: "Success criteria", kind: "textarea", core: true },
      { key: "future_target_state", label: "Target state", kind: "textarea" },
      { key: "future_constraints", label: "Constraints", kind: "textarea" },
    ],
  },
  {
    key: "align",
    label: "Align",
    purpose: "The shared understanding, confirmed back by the customer.",
    fields: [
      { key: "align_shared_summary", label: "Summary shared with customer", kind: "textarea", core: true },
      { key: "align_validation_status", label: "Validation status", kind: "select", options: VALIDATION_STATUSES, core: true },
      { key: "align_validated_at", label: "Validation date", kind: "date" },
      { key: "align_stakeholder_alignment", label: "Stakeholder alignment", kind: "textarea" },
      { key: "align_open_questions", label: "Open questions", kind: "textarea" },
    ],
  },
];

export type DiscoveryLike = Record<string, unknown> | null | undefined;

const filled = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : v !== null && v !== undefined;

function isCoreDone(record: DiscoveryLike, field: DiscoveryField): boolean {
  const value = record ? (record as Record<string, unknown>)[field.key] : undefined;
  if (field.key === "align_validation_status") {
    return value === "shared" || value === "validated" || value === "corrected";
  }
  return filled(value);
}

export interface SectionCompleteness {
  key: DiscoverySectionKey;
  label: string;
  done: number;
  total: number;
  pct: number;
  missing: string[];
}

export function sectionCompleteness(record: DiscoveryLike): SectionCompleteness[] {
  return DISCOVERY_SECTIONS.map((s) => {
    const core = s.fields.filter((f) => f.core);
    const done = core.filter((f) => isCoreDone(record, f));
    return {
      key: s.key,
      label: s.label,
      done: done.length,
      total: core.length,
      pct: core.length ? Math.round((done.length / core.length) * 100) : 0,
      missing: core.filter((f) => !isCoreDone(record, f)).map((f) => f.label),
    };
  });
}

/** Overall completeness across every core field. Reports gaps, never a score. */
export function discoveryCompleteness(record: DiscoveryLike): number {
  const sections = sectionCompleteness(record);
  const total = sections.reduce((s, x) => s + x.total, 0);
  const done = sections.reduce((s, x) => s + x.done, 0);
  return total ? Math.round((done / total) * 100) : 0;
}

export function missingDiscoverySections(record: DiscoveryLike): string[] {
  return sectionCompleteness(record)
    .filter((s) => s.done < s.total)
    .map((s) => `${s.label} (${s.done}/${s.total})`);
}

/** True when a section has all its core fields captured. Used by stage gates. */
export function isSectionCaptured(record: DiscoveryLike, key: DiscoverySectionKey): boolean {
  const s = sectionCompleteness(record).find((x) => x.key === key);
  return !!s && s.total > 0 && s.done === s.total;
}

/* ------------------------------------------------------------ stakeholders */

export const BUYING_ROLES = [
  { key: "economic_buyer", label: "Economic buyer" },
  { key: "decision_maker", label: "Decision maker" },
  { key: "problem_owner", label: "Problem owner" },
  { key: "technical_evaluator", label: "Technical evaluator" },
  { key: "end_user", label: "End user" },
  { key: "influencer", label: "Influencer" },
  { key: "gatekeeper", label: "Gatekeeper" },
  { key: "unknown", label: "Unknown" },
];

export const INFLUENCE_LEVELS = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

export const ATTITUDES = [
  { key: "champion", label: "Champion" },
  { key: "supportive", label: "Supportive" },
  { key: "neutral", label: "Neutral" },
  { key: "sceptical", label: "Sceptical" },
  { key: "detractor", label: "Detractor" },
  { key: "unknown", label: "Unknown" },
];

export interface StakeholderLike {
  buying_role?: string | null;
  influence?: string | null;
  attitude?: string | null;
}

/** A usable decision path = at least one high-influence decision-side stakeholder. */
export function hasDecisionPath(stakeholders: StakeholderLike[]): boolean {
  return stakeholders.some(
    (s) =>
      ["economic_buyer", "decision_maker", "problem_owner"].includes(s.buying_role || "") &&
      s.attitude !== "detractor"
  );
}
