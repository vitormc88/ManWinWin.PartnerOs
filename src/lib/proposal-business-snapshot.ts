import type { PricingRule, Proposal, ProposalMode } from "@/types/proposal";
import { computeBusinessOptions, type BusinessConfig } from "./proposal-business-engine";
import { assertBusinessOptionsComputable, resolveBusinessModels } from "./proposal-business-readiness";
import { commercialTermsChanged } from "./proposal-workflow";

export type BusinessDocumentState = Pick<Proposal,
  "language" | "client_name" | "project_name" | "country" | "proposal_date" |
  "validity_days" | "payment_terms" | "notes"
> & { proposal_mode: ProposalMode; business_config: BusinessConfig };

/** One current, non-mutating snapshot for PDF and Word, including license identity and totals. */
export function buildBusinessDocumentSnapshot(saved: Proposal, state: BusinessDocumentState, rules: PricingRule[]) {
  const cfg = state.business_config;
  const models = resolveBusinessModels({ proposal_mode: state.proposal_mode });
  const options = computeBusinessOptions(rules, cfg, models);
  assertBusinessOptionsComputable(options, { cfg, rules, models });
  const headline = options.keepit || options.useit!;
  return {
    ...saved,
    ...state,
    product_family: "Business" as const,
    license_model: models.length === 1 ? models[0] : null,
    deployment: cfg.deployment,
    hosting: cfg.deployment === "saas" ? "SaaS" as const : "On-Premise" as const,
    include_requests_module: cfg.includeRequests,
    web_users: cfg.additionalWebUsers,
    software_subtotal: headline.licenseSubtotal,
    services_subtotal: headline.services.reduce((sum, line) => sum + line.amount, 0),
    discount_amount: 0,
    total_year_1: headline.totalYear1,
    total_recurring: headline.totalYear2Plus,
  };
}

/** Never attach an unsaved download to a differently configured saved proposal. */
export function businessDocumentMatchesSaved(saved: Proposal, snapshot: Proposal): boolean {
  if (commercialTermsChanged(
    { proposal: { ...saved }, items: [] },
    { proposal: { ...snapshot }, items: [] },
  )) return false;
  const documentFields = ["language", "client_name", "project_name", "country", "proposal_date", "validity_days", "notes"] as const;
  return documentFields.every((key) => (saved[key] ?? "") === (snapshot[key] ?? ""));
}
