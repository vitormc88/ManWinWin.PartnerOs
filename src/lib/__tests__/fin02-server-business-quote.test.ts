import { describe,expect,it } from "vitest";
import type { PricingRule } from "../../types/proposal";
import {
  computeBusinessOptions, DEFAULT_BUSINESS_CONFIG,
  type BusinessConfig,
} from "../proposal-business-engine";
import { requiredBusinessRuleCodes } from "../proposal-business-readiness";
import { buildBusinessProposalItemRows,businessPersistedTotals } from "../proposal-business-persistence";
import {
  parseServerBusinessConfig,computeServerBusinessComparison,Fin02QuoteError,
} from "../fin02-server-business-quote";

const fullConfig=():BusinessConfig=>({
  ...DEFAULT_BUSINESS_CONFIG,
  discounts:{...DEFAULT_BUSINESS_CONFIG.discounts},
  implementation:{...DEFAULT_BUSINESS_CONFIG.implementation,customServices:[]},
});
const rule=(code:string):PricingRule=>{
  const isWeb=code==="BUS_WEB_MOBILE_USER";
  const isKeepBase=code==="BUS_KEEPIT_MAINTENANCE_MODULE";
  const factor=code==="BUS_USEIT_FACTOR";
  const keepSat=code==="BUS_KEEPIT_SAT";
  return {id:code,code,label:code,category:"Business",
    unit_price:factor?37:isWeb?20:isKeepBase?1000:code==="BUS_BASE_SAT_DAY"?490:
      code==="BUS_BASE_DEFAULT_WEB"?240:code==="BUS_API"?600:
      code==="BUS_SAAS_HOSTING_BASE"?120:keepSat?0:50,
    unit_type:isWeb?"per-user-month":factor?"percentage":"yearly",
    billing_frequency:isWeb?"per-user-month":"yearly",
    currency:"EUR",active:true,notes:null,
    ...(factor?{support_percentage:37}:keepSat?{support_percentage:17}:{}),
  };
};
const catalog=(cfg:BusinessConfig):PricingRule[]=>{
  const codes=new Set([...requiredBusinessRuleCodes(cfg,["keepit","useit"]),
   "BUS_USEIT_FACTOR","BUS_BASE_SAT_DAY","BUS_BASE_DEFAULT_WEB"]);
  return [...codes].map(rule);
};
const ctx=(rules:PricingRule[],limits={software:10,services:10})=>({
  actorId:"00000000-0000-4000-8000-000000000301",
  dealId:"00000000-0000-4000-8000-000000000401",
  pricingRules:rules,verifiedLimits:limits,
});
describe("FIN02 Gate6B authoritative server runtime shares whole existing Business engine",()=>{
  it("reproduces complete both-model source engine on modules/plugins, web, API, hosting and RCI",()=>{
    const cfg=fullConfig();
    Object.assign(cfg,{
      includeRequests:true,includeStock:true,includePurchase:true,pluginImport:true,
      pluginWorkflow:true,pluginAdvancedReports:true,pluginSLA:true,api:true,
      additionalBackoffice:2,additionalWebUsers:3,deployment:"saas",
    });
    cfg.implementation={...cfg.implementation,liveSessions:2};
    cfg.discounts={softwarePct:8,webUsersPct:3,webUsersRenews:true,
      apiPct:4,servicesPct:5};
    const rules=catalog(cfg);
    const quoted=computeServerBusinessComparison(cfg,ctx(rules));
    const browserEngine=computeBusinessOptions(rules,cfg,["keepit","useit"]);
    for(const mode of ["keepit","useit"] as const){
      const option=browserEngine[mode]!;
      const original=buildBusinessProposalItemRows(option);
      const totals=businessPersistedTotals(original);
      expect(quoted.options[mode].lines).toEqual(original);
      expect(quoted.options[mode].year1).toBe(totals.year1);
      expect(quoted.options[mode].recurring).toBe(totals.year2Plus);
      expect(quoted.options[mode].discount).toBe(totals.discount);
    }
    expect(quoted.options.keepit.lines.some(l=>l.item_code==="BUS_KEEPIT_PLUGIN_SLA")).toBe(true);
    expect(quoted.options.useit.lines.some(l=>l.item_code==="BUS_USEIT_ANNUAL_LICENSE")).toBe(true);
    expect(quoted.options.keepit.lines.find(l=>l.item_code==="BUS_WEB_MOBILE_USER")?.apply_discount_to_renewal).toBe(true);
    expect(quoted.options.keepit.lines.find(l=>l.item_code==="BUS_KEEPIT_SAT")?.discount_amount).toBe(0);
    expect(quoted.kind).toBe("SERVER_RECALCULATED_PREVIEW");
    expect(quoted.officialApproval).toBe(false);
    expect(quoted.frozen).toBe(false);
    expect(quoted.approvalBlockers).toContain("SOURCE_CATALOG_NEEDS_IMMUTABLE_REVISION");
  });

  it("rejects missing factor/base catalog rather than silently using browser's 490/240/37 fallback",()=>{
    const cfg=fullConfig();
    const rules=catalog(cfg).filter(r=>!["BUS_USEIT_FACTOR","BUS_BASE_DEFAULT_WEB"].includes(r.code));
    expect(()=>computeServerBusinessComparison(cfg,ctx(rules))).toThrowError(
      expect.objectContaining({code:"FIN02_SERVER_PRICING_RULES_INVALID"}));
  });

  it("rejects an unapproved reseller percentage even though browser's engine would silently clamp it",()=>{
    const cfg=fullConfig();
    cfg.discounts.softwarePct=15;
    expect(()=>computeServerBusinessComparison(cfg,ctx(catalog(cfg)))).toThrowError(
      expect.objectContaining({code:"FIN02_DISCOUNT_ABOVE_AUTHORIZED_LIMIT"}));
    expect(()=>computeServerBusinessComparison(cfg,ctx(catalog(cfg),
      {software:0,services:10}))).toThrow(Fin02QuoteError);
  });

  it("rejects malicious NaN, negative, over 100, flags and injected commercial approval fields",()=>{
    const cfg=fullConfig() as unknown as Record<string,unknown>;
    cfg.discounts={...fullConfig().discounts,softwarePct:-1};
    expect(()=>parseServerBusinessConfig(cfg)).toThrowError(
      expect.objectContaining({code:"FIN02_INVALID_DISCOUNT"}));
    cfg.discounts={...fullConfig().discounts,softwarePct:Number.NaN};
    expect(()=>parseServerBusinessConfig(cfg)).toThrow();
    cfg.discounts={...fullConfig().discounts,softwarePct:101};
    expect(()=>parseServerBusinessConfig(cfg)).toThrow();
    cfg.discounts={...fullConfig().discounts};
    cfg.approved=true;
    expect(()=>parseServerBusinessConfig(cfg)).toThrowError(
      expect.objectContaining({code:"FIN02_UNRECOGNIZED_FIELD"}));
    delete cfg.approved;
    cfg.includeStock="true";
    expect(()=>parseServerBusinessConfig(cfg)).toThrowError(
      expect.objectContaining({code:"FIN02_INVALID_BUSINESS_FLAG"}));
  });

  it("preserves special Onsite/custom totals for review without approving a noncatalog rate",()=>{
    const cfg=fullConfig();
    cfg.deployment="on_premise";
    cfg.implementation={type:"Onsite",liveSessions:0,customServices:[
      {label:"Client migration",price:150},{label:"Data onboarding",price:250},
    ],onsiteRegion:"Western Europe",onsiteClientDays:2,onsiteBackofficeDays:1};
    const quoted=computeServerBusinessComparison(cfg,ctx(catalog(cfg)));
    expect(quoted.options.keepit.lines.filter(l=>l.item_code==="custom")).toHaveLength(2);
    expect(quoted.approvalBlockers).toContain("SOURCE_ONSITE_RATE_NEEDS_VERSION");
    expect(quoted.approvalBlockers).toContain("SOURCE_CUSTOM_PRICE_NEEDS_APPROVAL");
    expect(quoted.officialApproval).toBe(false);
  });

  it("rejects duplicate trusted active price rule IDs, malformed source and unknown actors",()=>{
    const cfg=fullConfig();
    const original=catalog(cfg);
    const duplicate=[...original,{...original[0],id:"duplicate"}];
    expect(()=>computeServerBusinessComparison(cfg,ctx(duplicate))).toThrowError(
      expect.objectContaining({code:"FIN02_SERVER_PRICING_RULES_INVALID"}));
    expect(()=>computeServerBusinessComparison(cfg,{...ctx(original),actorId:""})).toThrowError(
      expect.objectContaining({code:"FIN02_SERVER_CONTEXT_UNVERIFIED"}));
  });
});
