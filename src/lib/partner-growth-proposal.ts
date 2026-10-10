import type { PartnerProspect, PartnerModel } from "@/hooks/usePartnerGrowth";
import type { ProspectQualification, ResearchSource } from "@/hooks/usePartnerQualification";
import { COUNTRY_NAME_BY_CODE } from "@/data/iso-countries";

export type ProposalSection = { heading: string; paragraphs: string[]; bullets?: string[] };
export type ProposalReference = { title: string; url: string | null; finding: string; verified_at: string | null };
export interface StrategicProposalSnapshot {
  title: string; subtitle: string; prospect_name: string; country: string;
  model: PartnerModel | null; objective: string; commercial_terms: string;
  proposal_notice: string; language: "en";
  sections: ProposalSection[]; evidence: ProposalReference[];
  missing_inputs: string[]; research_limitations: string;
  // Optional presentation metadata: old stored v1 snapshots remain exportable.
  design_version?: 2;
  executive_message?: string;
  value_pillars?: { label: string; detail: string }[];
  responsibility_matrix?: { activity: string; partner: string; manwinwin: string }[];
}
export interface ProposalInput {
  prospect: PartnerProspect; qualification: ProspectQualification | null;
  verifiedSources: ResearchSource[]; contactNames: string[];
  model: PartnerModel | null; objective?: string; commercialTerms?: string;
}

const modelConfig: Record<PartnerModel, {
  title: string; partnerRole: string; manwinwinRole: string; enablement: string;
  lead: string; commercial: string; delivery: string;
}> = {
  CMSC: {
    title: "Strategic Connector",
    partnerRole: "Identify and introduce relevant customer opportunities",
    manwinwinRole: "Lead qualification, product demonstration, proposal, sale and delivery",
    enablement: "Lightweight onboarding, lead registration and coordinated referral follow-up",
    lead: "Identify & introduce", commercial: "HQ-led", delivery: "HQ-led",
  },
  CMAR: {
    title: "Accredited Reseller pathway",
    partnerRole: "Develop opportunities and progressively own the commercial process",
    manwinwinRole: "Provide product expertise, enablement and technical support as agreed",
    enablement: "Commercial Academy, demonstration assessment and written HQ approval",
    lead: "Partner-led", commercial: "Progressive accreditation", delivery: "As agreed with HQ",
  },
  CMAI: {
    title: "Accredited Implementer pathway",
    partnerRole: "Develop business and build independently validated delivery capability",
    manwinwinRole: "Provide initial guidance, joint implementation oversight and assessment",
    enablement: "Technical Academy, supervised first deployment and written HQ accreditation",
    lead: "Partner-led", commercial: "Accreditation required", delivery: "Accreditation required",
  },
  "Strategic Alliance": {
    title: "Strategic Alliance",
    partnerRole: "Identify complementary solutions and joint go-to-market opportunities",
    manwinwinRole: "Validate technical/commercial fit and negotiate responsibilities per case",
    enablement: "Joint scope, governance and appropriate commercial/technical agreement",
    lead: "Jointly scoped", commercial: "To be agreed", delivery: "To be agreed",
  },
};

export function getProposalReadiness(input: ProposalInput) {
  const missing: string[] = [];
  if (!input.model) missing.push("Choose an appropriate proposed partnership model");
  if (input.model && input.prospect.proposed_partner_type !== input.model)
    missing.push("Confirm this partnership model in Prospect 360° before HQ approval");
  if (!input.prospect.fit_summary?.trim())
    missing.push("Confirm and record commercial fit in Prospect 360°");
  if (!input.prospect.interest_evidence?.trim())
    missing.push("Record evidence of actual partner interest");
  if (!input.contactNames.length) missing.push("Identify at least one contact");
  if (!input.verifiedSources.length) missing.push("Verify at least one cited source or meeting fact");
  if (!input.objective?.trim() && !input.prospect.description?.trim())
    missing.push("Describe a concrete partnership opportunity");
  return { readyForHQApproval: missing.length === 0, missing };
}

export function buildStrategicProposalSnapshot(input: ProposalInput): StrategicProposalSnapshot {
  const { prospect, qualification, verifiedSources, model } = input;
  const readiness = getProposalReadiness(input);
  const objective = input.objective?.trim() || prospect.description?.trim()
    || "Collaboration opportunity to be clarified together.";
  const commercialTerms = input.commercialTerms?.trim()
    || "Commission rates, renewal treatment, territory and financial conditions are subject to a separate approved written agreement. No commission or renewal entitlement is established by this discussion document.";
  const config = model ? modelConfig[model] : null;
  const country = COUNTRY_NAME_BY_CODE[prospect.country] ?? prospect.country;
  const observations: ProposalReference[] = verifiedSources.map(x => ({
    title: x.title, url: x.source_url, finding: x.finding, verified_at: x.verified_at,
  }));

  // The external-facing proposal never incorporates unverified research_summary or
  // private discovery risks as supposed public company facts.
  const pillars = [
    { label: "PARTNER OPPORTUNITY", detail: prospect.fit_summary?.trim()
      ? "Potential customer reach: " + prospect.fit_summary.trim()
      : "Customer and sector alignment to be confirmed" },
    { label: "PROPOSED COLLABORATION", detail: config
      ? config.partnerRole : "Responsibilities to be assessed together" },
    { label: "FIRST MILESTONE", detail: qualification?.recommended_next_action?.trim()
      || "Agree on one well-qualified joint opportunity and its owner" },
  ];

  const responsibilities = [
    { activity: "Opportunity identification", partner: config?.lead ?? "To be agreed",
      manwinwin: model === "CMSC" ? "Review & qualify" : "Enable & coordinate" },
    { activity: "Product demonstration & quotation", partner: config?.commercial ?? "To be agreed",
      manwinwin: model === "CMSC" ? "Responsible" : "Support as agreed" },
    { activity: "Implementation & customer enablement", partner: config?.delivery ?? "To be agreed",
      manwinwin: model === "CMSC" ? "Responsible" : "Guide / assess as agreed" },
  ];

  const sections: ProposalSection[] = [
    {
      heading: "01 | Partnership at a Glance",
      paragraphs: [
        "ManWinWin and " + prospect.company_name + " can explore a collaboration built around a shared customer need: " + objective,
        prospect.fit_summary?.trim()
          ? "Commercial opportunity identified by ManWinWin HQ: " + prospect.fit_summary.trim()
          : "The target market and commercial opportunity remain subject to joint confirmation.",
      ],
    },
    {
      heading: "02 | Why This Partnership Could Create Value",
      paragraphs: [
        "ManWinWin supports maintenance teams in connecting asset information, preventive planning, work orders and execution history in one CMMS workflow.",
        "The potential value of this collaboration is not a larger catalogue of features: it is a clearer route from an identified customer problem to a practical maintenance-management outcome.",
      ],
      bullets: observations.length
        ? observations.map(x => x.finding)
        : ["Partner-specific supporting evidence is pending HQ verification."],
    },
    {
      heading: "03 | Proposed Collaboration Model",
      paragraphs: [
        config ? "Indicative model: " + config.title + ". " + config.partnerRole + ". ManWinWin would " + config.manwinwinRole.charAt(0).toLowerCase() + config.manwinwinRole.slice(1) + ". Subject to explicit HQ validation." : "The collaboration model will be determined jointly.",
        config ? "Enablement and readiness: " + config.enablement + ". These activities do not confer accreditation or rights until explicitly validated." : "Readiness and responsibilities must be agreed in writing.",
      ],
      bullets: [
        input.contactNames.length
          ? "Initial contact(s): " + input.contactNames.join(", ")
          : "Identify the primary relationship owner",
        "For each opportunity, record lead ownership, demonstration, quotation, closing, delivery and support responsibilities.",
      ],
    },
    {
      heading: "04 | From Introduction to Customer Value",
      paragraphs: [
        "A practical first engagement should start small, with a well-defined use case, a responsible contact on each side and an agreed follow-up.",
      ],
      bullets: [
        "Identify one relevant customer problem and confirm the decision-maker.",
        "Qualify the maintenance process, expected outcome and scope before proposing a demonstration.",
        "Assign responsibilities between " + prospect.company_name + " and ManWinWin for the next customer-facing step.",
      ],
    },
    {
      heading: "05 | Commercial Principles",
      paragraphs: [
        commercialTerms,
        "This is a non-binding discussion proposal. Commission eligibility, renewal treatment, territory, intellectual property and operational responsibilities must be formalized in the approved partnership agreement.",
      ],
    },
    {
      heading: "06 | Partner Enablement & Growth",
      paragraphs: [
        "After a signed agreement and internal authorization, access to PartnerOS and the appropriate Academy learning path can be arranged.",
        model === "CMSC"
          ? "A Strategic Connector can remain a referral-only partner; independent software demonstrations and implementation are not prerequisites for this role."
          : "Commercial and technical permissions depend on the corresponding HQ-validated competencies; attendance or course completion alone does not confer independent rights.",
      ],
    },
    {
      heading: "07 | Proposed Next Steps",
      paragraphs: [
        qualification?.recommended_next_action?.trim()
          || "Schedule an alignment discussion, confirm the collaboration scope and agree on the first concrete customer-related action.",
        prospect.interest_evidence?.trim()
          ? "Interest captured by HQ: " + prospect.interest_evidence.trim()
          : "Partner interest should be explicitly confirmed before moving toward an agreement.",
      ],
    },
  ];
  return {
    title: "ManWinWin × " + prospect.company_name + " | Strategic Partnership Proposal",
    subtitle: model ? model + " — " + config!.title : "Exploratory collaboration",
    prospect_name: prospect.company_name,
    country, model, objective, commercial_terms: commercialTerms,
    proposal_notice: "CONFIDENTIAL • DISCUSSION DOCUMENT • NOT A CONTRACT",
    language: "en", sections, evidence: observations,
    missing_inputs: readiness.missing, design_version: 2,
    executive_message: objective,
    value_pillars: pillars, responsibility_matrix: responsibilities,
    research_limitations: "Only HQ-verified source findings are presented as supporting evidence. Research summaries and discovery risks are internal working notes, not externally verified claims.",
  };
}
