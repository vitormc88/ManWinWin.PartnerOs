/**
 * Business pricing readiness validator.
 *
 * Derives the pricing rule codes required by the Business engine for a given
 * BusinessConfig + selected models, so the wizard and every export path can
 * fail *before* computing options (which returns null when pricing is absent).
 *
 * Pure/deterministic: no data fetching, no pricing values changed.
 */
import type { PricingRule, Proposal, ProposalLicenseModel, ProposalMode } from "@/types/proposal";
import type { BusinessConfig, BusinessEngineOutput } from "./proposal-business-engine";

/** Always required: both KeepIT and derived UseIT depend on the base license. */
export const BUSINESS_BASE_RULE_CODE = "BUS_KEEPIT_MAINTENANCE_MODULE";

/** Resolve the models a proposal renders, mirroring the export entry points. */
export function resolveBusinessModels(proposal: Partial<Proposal>): ProposalLicenseModel[] {
  const mode = (proposal?.proposal_mode as ProposalMode) || "compare_keepit_useit";
  if (mode === "keepit_only") return ["keepit"];
  if (mode === "useit_only") return ["useit"];
  if (mode === "compare_keepit_useit") return ["keepit", "useit"];
  if (proposal?.license_model) return [proposal.license_model as ProposalLicenseModel];
  return ["keepit", "useit"];
}

/**
 * Rule codes the engine needs for this configuration.
 * Codes with a documented numeric fallback in the engine (BUS_USEIT_FACTOR,
 * BUS_BASE_SAT_DAY, BUS_BASE_DEFAULT_WEB) are intentionally NOT required.
 */
export function requiredBusinessRuleCodes(
  cfg: BusinessConfig,
  models: ProposalLicenseModel[] = ["keepit", "useit"],
): string[] {
  const codes = new Set<string>([BUSINESS_BASE_RULE_CODE]);
  if (!cfg) return [...codes];

  // KeepIT license base — required for BOTH models (UseIT derives from it).
  if (cfg.includeRequests) codes.add("BUS_KEEPIT_REQUESTS_MODULE");
  if (cfg.includeStock) codes.add("BUS_KEEPIT_STOCK_MODULE");
  if (cfg.includePurchase) codes.add("BUS_KEEPIT_PURCHASE_MODULE");
  if (cfg.pluginImport) codes.add("BUS_KEEPIT_PLUGIN_IMPORT");
  if (cfg.pluginWorkflow) codes.add("BUS_KEEPIT_PLUGIN_WORKFLOW");
  if (cfg.pluginAdvancedReports) codes.add("BUS_KEEPIT_PLUGIN_ADVANCED_REPORTS");
  if (cfg.pluginSLA) codes.add("BUS_KEEPIT_PLUGIN_SLA");
  if ((cfg.additionalBackoffice || 0) > 0) codes.add("BUS_KEEPIT_ADDITIONAL_BACKOFFICE");

  // Add-ons
  if ((cfg.additionalWebUsers || 0) > 0) codes.add("BUS_WEB_MOBILE_USER");
  if (cfg.api) codes.add("BUS_API");

  // Hosting
  if (cfg.deployment === "saas") {
    codes.add("BUS_SAAS_HOSTING_BASE");
    if ((cfg.additionalBackoffice || 0) > 0) codes.add("BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE");
  }

  // Support & Assistance
  if (models.includes("keepit")) codes.add("BUS_KEEPIT_SAT");
  if (models.includes("useit")) codes.add("BUS_USEIT_SAT");

  // Services
  const impl = cfg.implementation;
  if (impl?.type === "RCI Business") {
    codes.add("BUS_RCI_BASE");
    if (cfg.includeStock) codes.add("BUS_RCI_STOCK");
    if (cfg.includeRequests) codes.add("BUS_RCI_REQUESTS");
    if (cfg.includePurchase) codes.add("BUS_RCI_PURCHASING");
    if ((cfg.additionalWebUsers || 0) > 0) codes.add("BUS_RCI_WEB");
    if (cfg.pluginWorkflow) codes.add("BUS_RCI_PLUGIN_WORKFLOW");
    if (cfg.pluginImport) codes.add("BUS_RCI_PLUGIN_IMPORT");
    if (cfg.pluginSLA) codes.add("BUS_RCI_PLUGIN_SLA");
    if (cfg.pluginAdvancedReports) codes.add("BUS_RCI_PLUGIN_ADVANCED_REPORTS");
    if ((impl.liveSessions || 0) > 0) codes.add("BUS_RCI_LIVE_SESSION");
  }

  return [...codes];
}

export interface BusinessPricingReadiness {
  ok: boolean;
  /** Required rule codes absent (or inactive) in the provided rule set. */
  missing: string[];
  /** True when the pricing query itself failed (distinct from missing data). */
  queryFailed: boolean;
  /** True while pricing is still loading. */
  loading: boolean;
  /** User-friendly message, empty when ok. */
  message: string;
}

export interface BusinessReadinessInput {
  rules: PricingRule[] | undefined | null;
  cfg: BusinessConfig;
  models?: ProposalLicenseModel[];
  /** Pricing query state (optional). */
  isLoading?: boolean;
  error?: unknown;
}

/** Validate that all pricing rules the engine needs are present and active. */
export function checkBusinessPricingReadiness({
  rules,
  cfg,
  models = ["keepit", "useit"],
  isLoading = false,
  error = null,
}: BusinessReadinessInput): BusinessPricingReadiness {
  if (isLoading) {
    return {
      ok: false,
      missing: [],
      queryFailed: false,
      loading: true,
      message: "Loading pricing configuration…",
    };
  }
  if (error) {
    return {
      ok: false,
      missing: [],
      queryFailed: true,
      loading: false,
      message:
        "Pricing configuration could not be loaded. This is a connection/permission problem, not missing data. Please retry.",
    };
  }

  const active = new Set(
    (rules || []).filter((r) => r && r.active !== false).map((r) => r.code),
  );
  const missing = requiredBusinessRuleCodes(cfg, models).filter((c) => !active.has(c));

  if (missing.length === 0) {
    return { ok: true, missing: [], queryFailed: false, loading: false, message: "" };
  }
  return {
    ok: false,
    missing,
    queryFailed: false,
    loading: false,
    message: `Pricing configuration is incomplete — this Business proposal cannot be calculated or generated. Missing pricing rule${
      missing.length > 1 ? "s" : ""
    }: ${missing.join(", ")}.`,
  };
}

/** Error thrown by export paths when no Business option can be computed. */
export class BusinessPricingError extends Error {
  readonly missing: string[];
  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = "BusinessPricingError";
    this.missing = missing;
  }
}

/**
 * Guard used by every Business export entry point. Throws a controlled,
 * descriptive error instead of letting callers dereference a null option.
 */
export function assertBusinessOptionsComputable(
  out: BusinessEngineOutput,
  ctx: { cfg: BusinessConfig; rules: PricingRule[]; models?: ProposalLicenseModel[] },
): void {
  if (out && (out.keepit || out.useit)) return;
  const readiness = checkBusinessPricingReadiness({
    rules: ctx.rules,
    cfg: ctx.cfg,
    models: ctx.models,
  });
  throw new BusinessPricingError(
    readiness.message ||
      "Business proposal cannot be generated: required pricing rules are missing.",
    readiness.missing,
  );
}
