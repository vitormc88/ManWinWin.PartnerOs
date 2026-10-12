/**
 * Gate6C: execution of the EXISTING Business calculator inside Deno itself.
 * No Supabase credentials, database, HTTP requests or deployment.
 * Source-based parity smoke: this is NOT an authenticated TEST clone.
 */
import { computeServerBusinessComparison } from "../../src/lib/fin02-server-business-quote.ts";
import { DEFAULT_BUSINESS_CONFIG, computeBusinessOptions } from "../../src/lib/proposal-business-engine.ts";
import { requiredBusinessRuleCodes } from "../../src/lib/proposal-business-readiness.ts";
import { buildBusinessProposalItemRows, businessPersistedTotals } from "../../src/lib/proposal-business-persistence.ts";
import type { PricingRule } from "../../src/types/proposal.ts";

function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Gate6C Deno shared-engine mismatch: " + label);
  }
}

const cfg = {
  ...DEFAULT_BUSINESS_CONFIG,
  includeRequests: true,
  includeStock: true,
  includePurchase: true,
  pluginImport: true,
  pluginWorkflow: true,
  pluginSLA: true,
  pluginAdvancedReports: true,
  api: true,
  additionalBackoffice: 2,
  additionalWebUsers: 4,
  deployment: "saas" as const,
  discounts: {softwarePct: 8, webUsersPct: 3, webUsersRenews: true, apiPct: 4, servicesPct: 0},
  implementation: {...DEFAULT_BUSINESS_CONFIG.implementation, liveSessions: 2, customServices: []},
};
const required = new Set([
  ...requiredBusinessRuleCodes(cfg,["keepit","useit"]),
  "BUS_USEIT_FACTOR", "BUS_BASE_SAT_DAY", "BUS_BASE_DEFAULT_WEB",
]);
const rules: PricingRule[] = Array.from(required, code => ({
  id: "synthetic-" + code, code, label: code, category: "Business",
  unit_price: code === "BUS_USEIT_FACTOR" ? 37 : code === "BUS_KEEPIT_MAINTENANCE_MODULE" ? 1000 :
    code === "BUS_BASE_SAT_DAY" ? 490 : code === "BUS_BASE_DEFAULT_WEB" ? 240 : 75,
  ...(code === "BUS_USEIT_FACTOR" ? { support_percentage: 37 } : code === "BUS_KEEPIT_SAT" ? {support_percentage: 17} : {}),
  unit_type: "yearly", currency: "EUR", active: true, notes: null,
}));

Deno.test("Original Business prices, line discount and renewals match in actual Deno runtime", () => {
  const expected = computeBusinessOptions(rules, cfg, ["keepit", "useit"]);
  const result = computeServerBusinessComparison(cfg,{
    actorId:"00000000-0000-4000-8000-000000000301",
    dealId:"00000000-0000-4000-8000-000000000401",
    pricingRules:rules,verifiedLimits:{software:10,services:10},
  });
  for(const mode of ["keepit","useit"] as const){
    const source = expected[mode]!;
    const lines = buildBusinessProposalItemRows(source);
    const totals = businessPersistedTotals(lines);
    eq(result.options[mode].lines,lines,mode+" lines");
    eq([result.options[mode].year1,result.options[mode].recurring,result.options[mode].discount],
      [totals.year1,totals.year2Plus,totals.discount],mode+" amounts");
  }
  eq(result.officialApproval,false,"preview never authorizes");
  eq(result.frozen,false,"preview never freezes");
});

Deno.test("Actor discount violation fails closed before existing engine can clamp unauthorized percentage", () => {
  const forged = {...cfg, discounts: {...cfg.discounts, softwarePct: 15}};
  let blocked=false;
  try {
    computeServerBusinessComparison(forged,{
      actorId:"00000000-0000-4000-8000-000000000301",
      dealId:"00000000-0000-4000-8000-000000000401",
      pricingRules:rules,verifiedLimits:{software:10,services:10},
    });
  } catch(e) {blocked= e instanceof Error && e.message.includes("FIN02_DISCOUNT_ABOVE_AUTHORIZED_LIMIT");}
  eq(blocked,true,"discount cap");
});

Deno.test("Server rejects missing catalog rule rather than silently falling back to display defaults",()=>{
  let rejected=false;
  try {
    computeServerBusinessComparison(cfg,{
      actorId:"00000000-0000-4000-8000-000000000301",
      dealId:"00000000-0000-4000-8000-000000000401",
      pricingRules:rules.filter(r=>r.code!=="BUS_USEIT_FACTOR"),
      verifiedLimits:{software:10,services:10},
    });
  } catch(e){rejected=e instanceof Error && "code" in e && e.code === "FIN02_SERVER_PRICING_RULES_INVALID";}
  eq(rejected,true,"source rule required");
});
