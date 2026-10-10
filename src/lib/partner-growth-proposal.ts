import type { PartnerProspect, PartnerModel } from "@/hooks/usePartnerGrowth";
import type { ProspectQualification, ResearchSource } from "@/hooks/usePartnerQualification";

export type ProposalSection = { heading: string; paragraphs: string[]; bullets?: string[] };
export type ProposalReference = { title: string; url: string | null; finding: string; verified_at: string | null };
export interface StrategicProposalSnapshot {
  title: string; subtitle: string; prospect_name: string; country: string;
  model: PartnerModel | null; objective: string; commercial_terms: string;
  proposal_notice: string; language: "en";
  sections: ProposalSection[]; evidence: ProposalReference[];
  missing_inputs: string[]; research_limitations: string;
}
export interface ProposalInput {
  prospect: PartnerProspect; qualification: ProspectQualification | null;
  verifiedSources: ResearchSource[]; contactNames: string[];
  model: PartnerModel | null; objective?: string; commercialTerms?: string;
}

const notices: Record<string, string> = {
  CMSC: "Proposed Strategic Connector: the partner introduces and registers qualified prospects; ManWinWin normally handles product demonstrations, offers, closing, delivery and ongoing customer support, subject to agreement.",
  CMAR: "Proposed Accredited Reseller pathway: increasing sales responsibility is subject to demonstrated competence, an agreed division of responsibilities and explicit HQ validation.",
  CMAI: "Proposed Accredited Implementer pathway: independent implementation remains conditional on technical training, a supervised delivery assessment and written HQ accreditation.",
  "Strategic Alliance": "Potential strategic or technical alliance: collaboration, commercial rights, integration responsibilities and scope require separate agreement.",
};
export function getProposalReadiness(input: ProposalInput) {
  const missing: string[] = [];
  if (!input.model) missing.push("Choose an appropriate proposed partnership model");
  if (input.model && input.prospect.proposed_partner_type !== input.model) missing.push("Confirm this partnership model in Prospect 360° before HQ approval");
  if (!input.prospect.fit_summary?.trim()) missing.push("Confirm and record commercial fit in Prospect 360°");
  if (!input.prospect.interest_evidence?.trim()) missing.push("Record evidence of actual partner interest");
  if (!input.contactNames.length) missing.push("Identify at least one contact");
  if (!input.verifiedSources.length) missing.push("Verify at least one cited source or meeting fact");
  if (!input.objective?.trim() && !input.prospect.description?.trim()) missing.push("Describe a concrete partnership opportunity");
  return { readyForHQApproval: missing.length === 0, missing };
}
export function buildStrategicProposalSnapshot(input: ProposalInput): StrategicProposalSnapshot {
  const { prospect, qualification, verifiedSources, model } = input;
  const readiness = getProposalReadiness(input);
  const objective = input.objective?.trim() || prospect.description?.trim()
    || "Collaboration opportunity not yet documented — HQ to complete.";
  const commercialTerms = input.commercialTerms?.trim()
    || "Commercial conditions, commission eligibility and financial treatment will be confirmed only in an approved agreement. No commission or renewal entitlement is established by this discussion document.";
  const framework = model ? notices[model] : "Partnership model requires HQ assessment.";
  const observations = verifiedSources.map(x => ({
    title: x.title, url: x.source_url,
    finding: x.finding, verified_at: x.verified_at,
  }));
  const sections: ProposalSection[] = [
    {
      heading: "01 | Partnership Opportunity",
      paragraphs: [
        objective,
        prospect.fit_summary?.trim()
          ? "HQ commercial fit assessment (subject to final review): " + prospect.fit_summary.trim()
          : "The business fit is still being qualified and must not be assumed.",
      ],
    },
    {
      heading: "02 | What ManWinWin Brings",
      paragraphs: [
        "ManWinWin is a computerised maintenance management system (CMMS) supporting structured asset management, preventive maintenance planning, work order execution and maintenance history.",
        "The proposed value lies in translating relevant customer needs into an agreed maintenance-management workflow, rather than presenting a generic list of software features.",
      ],
    },
    {
      heading: "03 | Partner Contribution & Collaboration",
      paragraphs: [
        framework,
        qualification?.research_summary?.trim()
          ? "Internal research context — for HQ verification: " + qualification.research_summary.trim()
          : "Company intelligence remains under review.",
      ],
      bullets: [
        input.contactNames.length
          ? "Current contact(s): " + input.contactNames.join(", ")
          : "Identify a named counterpart and executive sponsor",
        model === "CMSC" ? "ManWinWin retains technical demonstrations and customer delivery unless explicitly agreed otherwise"
          : "Record who owns demonstrations, quotations, delivery and customer follow-up for each opportunity",
      ],
    },
    {
      heading: "04 | Relevant Evidence & Opportunities",
      paragraphs: observations.length
        ? ["Only the following findings have been explicitly verified by HQ and can support this draft:"]
        : ["No supporting findings have yet been verified. Do not present inferred market claims as confirmed."],
      bullets: observations.map(x => x.finding),
    },
    {
      heading: "05 | Commercial Framework",
      paragraphs: [commercialTerms, "Any referral commission, reseller margin, territory, training or accreditation rights require separate written approval. This proposal does not constitute an executed contract."],
    },
    {
      heading: "06 | Activation & Operating Model",
      paragraphs: [
        "Following an executed agreement, the applicable PartnerOS account and Academy learning path may be provided under the approved access and competency policy.",
        "Strategic Connector, Accredited Reseller and Accredited Implementer responsibilities are distinct. Training completion alone does not grant independent demonstration or implementation rights.",
      ],
    },
    {
      heading: "07 | Proposed Next Steps",
      paragraphs: [
        qualification?.recommended_next_action?.trim()
          ? qualification.recommended_next_action.trim()
          : "Arrange an HQ discussion to confirm business scope, a named counterpart and first concrete joint action.",
        prospect.interest_evidence?.trim()
          ? "Recorded expression of interest (HQ assessment): " + prospect.interest_evidence.trim()
          : "The prospect's interest has not yet been evidenced.",
      ],
    },
  ];
  return {
    title: "ManWinWin × " + prospect.company_name + " | Strategic Partnership Proposal",
    subtitle: model ? model + " — " + (model === "CMSC" ? "Strategic Connector" : model === "CMAR" ? "Accredited Reseller" : model === "CMAI" ? "Accredited Implementer" : "Strategic Alliance") : "Exploratory collaboration",
    prospect_name: prospect.company_name, country: prospect.country,
    model, objective, commercial_terms: commercialTerms,
    proposal_notice: "CONFIDENTIAL • DISCUSSION DOCUMENT • NOT A CONTRACT",
    language: "en", sections, evidence: observations,
    missing_inputs: readiness.missing,
    research_limitations: "Source findings are based on HQ-verified records. Other research notes are internal context and are not independently verified by the document generator.",
  };
}
