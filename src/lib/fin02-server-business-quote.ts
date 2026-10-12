/**
 * FIN02 Gate6B — PURE trusted-runtime pricing orchestration.
 * Called ONLY after an authenticated server adapter has checked the actor,
 * source Deal, discount caps, and loaded active pricing rules independently.
 *
 * Uses the SAME full existing Business engine as the browser.
 * Outputs PREVIEW only; no contract, no price approval, no freeze, no write.
 */
import type { PricingRule } from "../types/proposal.ts";
import { computeBusinessOptions, type BusinessConfig } from "./proposal-business-engine.ts";
import { buildBusinessProposalItemRows, businessPersistedTotals,
  assertBusinessProposalTotals } from "./proposal-business-persistence.ts";
import { inspectBusinessPricingSourceCoverage } from "./business-pricing-source-coverage.ts";
import { validateBusinessDiscounts, type DiscountLimits } from "./proposal-discount-policy.ts";

export class Fin02QuoteError extends Error {
  constructor(readonly code: string, message = code) { super(message); this.name = "Fin02QuoteError"; }
}

type JsonRecord = Record<string, unknown>;
const record = (v: unknown): v is JsonRecord =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function exactKeys(v: JsonRecord, allowed: readonly string[], where: string) {
  if (Object.keys(v).some(k => !allowed.includes(k)))
    throw new Fin02QuoteError("FIN02_UNRECOGNIZED_FIELD", where);
}
function bool(v: unknown): v is boolean { return typeof v === "boolean"; }
function finite(v: unknown, min: number, max: number, integer = false): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    && (!integer || Number.isInteger(v));
}
const MODELS = ["keepit", "useit"] as const;

/** Reject intentionally malformed payloads BEFORE the existing engine's
 * display-oriented default values/clamping can mask an unauthorized discount.
 */
export function parseServerBusinessConfig(value: unknown): BusinessConfig {
  if (!record(value)) throw new Fin02QuoteError("FIN02_INVALID_BUSINESS_CONFIG");
  exactKeys(value, ["includeRequests","includeStock","includePurchase","pluginImport",
    "pluginWorkflow","pluginAdvancedReports","pluginSLA","api",
    "additionalBackoffice","additionalWebUsers","deployment",
    "implementation","discounts"], "config");
  for (const name of ["includeRequests","includeStock","includePurchase","pluginImport",
    "pluginWorkflow","pluginAdvancedReports","pluginSLA","api"]) {
    if (!bool(value[name])) throw new Fin02QuoteError("FIN02_INVALID_BUSINESS_FLAG",name);
  }
  if (!finite(value.additionalBackoffice,0,100000,true) ||
      !finite(value.additionalWebUsers,0,100000,true) ||
      (value.deployment !== "saas" && value.deployment !== "on_premise")) {
    throw new Fin02QuoteError("FIN02_INVALID_QUOTE_QUANTITY_OR_DEPLOYMENT");
  }
  const impl=value.implementation;
  if (!record(impl)) throw new Fin02QuoteError("FIN02_IMPLEMENTATION_MISSING");
  exactKeys(impl,["type","liveSessions","customServices","onsiteClientDays",
    "onsiteBackofficeDays","onsiteRegion"],"implementation");
  if (!["RCI Business","Onsite","Custom"].includes(String(impl.type)) ||
    !finite(impl.liveSessions,0,100000,true) ||
    (impl.onsiteClientDays !== undefined && !finite(impl.onsiteClientDays,0,100000,true)) ||
    (impl.onsiteBackofficeDays !== undefined && !finite(impl.onsiteBackofficeDays,0,100000,true)) ||
    (impl.onsiteRegion !== undefined &&
      !["Portugal","International","Western Europe"].includes(String(impl.onsiteRegion))) ||
    !Array.isArray(impl.customServices) || impl.customServices.length>100) {
    throw new Fin02QuoteError("FIN02_INVALID_IMPLEMENTATION");
  }
  for(const service of impl.customServices) {
    if (!record(service) ||
      Object.keys(service).some(k=>!["label","price"].includes(k)) ||
      typeof service.label!=="string" ||
      !service.label.trim() || service.label.length>250 ||
      !finite(service.price,0,100000000)) {
      throw new Fin02QuoteError("FIN02_INVALID_CUSTOM_SERVICE");
    }
  }
  const d=value.discounts;
  if (!record(d)) throw new Fin02QuoteError("FIN02_DISCOUNTS_MISSING");
  exactKeys(d,["softwarePct","webUsersPct","webUsersRenews","apiPct","servicesPct"],"discounts");
  for(const key of ["softwarePct","webUsersPct","apiPct","servicesPct"]) {
    if(!finite(d[key],0,100)) throw new Fin02QuoteError("FIN02_INVALID_DISCOUNT",key);
  }
  if (!bool(d.webUsersRenews)) throw new Fin02QuoteError("FIN02_INVALID_RENEWAL_POLICY");
  return value as unknown as BusinessConfig;
}

export interface ServerQuoteContext {
  actorId: string;
  dealId: string;
  /** Guaranteed exclusively by trusted DB role/Profile/source checks. */
  verifiedLimits: DiscountLimits;
  /** Loaded by authenticated server adapter; never accept browser rules. */
  pricingRules: PricingRule[];
}
export interface ServerOptionPreview {
  mode:"keepit"|"useit";
  year1:number;
  recurring:number;
  discount:number;
  lines:ReturnType<typeof buildBusinessProposalItemRows>;
}
export interface ServerBusinessPreview {
  readonly kind:"SERVER_RECALCULATED_PREVIEW";
  readonly actorId:string;
  readonly dealId:string;
  readonly options:{keepit:ServerOptionPreview;useit:ServerOptionPreview};
  readonly requiredRuleCodes:readonly string[];
  readonly approvalBlockers:readonly string[];
  readonly officialApproval:false;
  readonly frozen:false;
}

/** Server quote = full current Business engine; no new calculation formulas. */
export function computeServerBusinessComparison(
 cfg:BusinessConfig, ctx:ServerQuoteContext,
):ServerBusinessPreview {
  if(!ctx.actorId || !ctx.dealId || !Array.isArray(ctx.pricingRules) ||
     !ctx.verifiedLimits ||
     !finite(ctx.verifiedLimits.software,0,100) ||
     !finite(ctx.verifiedLimits.services,0,100)) {
    throw new Fin02QuoteError("FIN02_SERVER_CONTEXT_UNVERIFIED");
  }
  // Revalidate even if caller used parseServerBusinessConfig previously.
  const sourceConfig = parseServerBusinessConfig(cfg);
  const validation=validateBusinessDiscounts(
    sourceConfig.discounts as unknown as Record<string,unknown>,ctx.verifiedLimits);
  if(!validation.ok) throw new Fin02QuoteError("FIN02_DISCOUNT_ABOVE_AUTHORIZED_LIMIT");
  const coverage=inspectBusinessPricingSourceCoverage(ctx.pricingRules,sourceConfig,[...MODELS]);
  if(coverage.missing.length || coverage.duplicate.length || coverage.invalid.length) {
    throw new Fin02QuoteError("FIN02_SERVER_PRICING_RULES_INVALID",
      [...coverage.missing,...coverage.duplicate,...coverage.invalid].join(","));
  }
  const out=computeBusinessOptions(ctx.pricingRules,sourceConfig,[...MODELS]);
  if(!out.keepit || !out.useit) throw new Fin02QuoteError("FIN02_OPTION_MISSING");
  const make=(option:typeof out.keepit,mode:"keepit"|"useit"):ServerOptionPreview=>{
    if(!option || option.model!==mode) throw new Fin02QuoteError("FIN02_OPTION_WRONG_MODEL");
    const lines=buildBusinessProposalItemRows(option);
    assertBusinessProposalTotals(lines,option);
    const total=businessPersistedTotals(lines);
    if(!lines.length || !finite(total.year1,0,1e15) || !finite(total.year2Plus,0,1e15))
      throw new Fin02QuoteError("FIN02_OPTION_EMPTY_OR_NONFINITE");
    return {mode,year1:total.year1,recurring:total.year2Plus,discount:total.discount,lines};
  };
  return {
    kind:"SERVER_RECALCULATED_PREVIEW",
    actorId:ctx.actorId,dealId:ctx.dealId,
    options:{keepit:make(out.keepit,"keepit"),useit:make(out.useit,"useit")},
    requiredRuleCodes:coverage.requiredCodes,
    approvalBlockers:coverage.gaps,
    officialApproval:false,frozen:false,
  };
}
