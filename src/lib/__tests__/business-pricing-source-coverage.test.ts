import { describe, expect, it } from "vitest";
import { DEFAULT_BUSINESS_CONFIG, type BusinessConfig } from "../proposal-business-engine";
import { requiredBusinessRuleCodes } from "../proposal-business-readiness";
import {
  inspectBusinessPricingSourceCoverage,
  BUSINESS_AUTHORITY_DEFAULT_CODES,
  BUSINESS_USEIT_DERIVATION_CODE,
} from "../business-pricing-source-coverage";
import type { PricingRule } from "@/types/proposal";

const config = (): BusinessConfig => ({
  ...DEFAULT_BUSINESS_CONFIG,
  implementation: {...DEFAULT_BUSINESS_CONFIG.implementation,customServices:[]},
  discounts: {...DEFAULT_BUSINESS_CONFIG.discounts},
});

const rule = (code:string):PricingRule => ({
  id:code,code,label:code,category:"business",unit_price:code===BUSINESS_USEIT_DERIVATION_CODE?37:100,
  unit_type:"yearly",currency:"EUR",active:true,notes:null,
  ...(code===BUSINESS_USEIT_DERIVATION_CODE?{support_percentage:37}:{}),
});

const full = (cfg:BusinessConfig) =>
  [...new Set([
    ...requiredBusinessRuleCodes(cfg,["keepit","useit"]),
    ...BUSINESS_AUTHORITY_DEFAULT_CODES,
    BUSINESS_USEIT_DERIVATION_CODE,
  ])].map(rule);

describe("FIN02 Gate5D->6 source parity from actual Business pricing engine",()=>{
  it("enumerates ALL source codes needed for a complex compare quote without invented money",()=>{
    const cfg=config();
    Object.assign(cfg,{
      includeRequests:true,includeStock:true,includePurchase:true,
      pluginImport:true,pluginWorkflow:true,pluginAdvancedReports:true,pluginSLA:true,
      api:true,additionalBackoffice:2,additionalWebUsers:5,deployment:"saas",
    });
    cfg.implementation={...cfg.implementation,liveSessions:3};
    const codes=inspectBusinessPricingSourceCoverage(full(cfg),cfg).requiredCodes;
    for(const source of [
      "BUS_KEEPIT_MAINTENANCE_MODULE","BUS_KEEPIT_REQUESTS_MODULE",
      "BUS_KEEPIT_STOCK_MODULE","BUS_KEEPIT_PURCHASE_MODULE",
      "BUS_KEEPIT_PLUGIN_IMPORT","BUS_KEEPIT_PLUGIN_WORKFLOW",
      "BUS_KEEPIT_PLUGIN_ADVANCED_REPORTS","BUS_KEEPIT_PLUGIN_SLA",
      "BUS_KEEPIT_ADDITIONAL_BACKOFFICE","BUS_WEB_MOBILE_USER",
      "BUS_API","BUS_SAAS_HOSTING_BASE","BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE",
      "BUS_KEEPIT_SAT","BUS_USEIT_SAT","BUS_USEIT_FACTOR",
      "BUS_RCI_BASE","BUS_RCI_STOCK","BUS_RCI_REQUESTS","BUS_RCI_PURCHASING",
      "BUS_RCI_WEB","BUS_RCI_PLUGIN_WORKFLOW","BUS_RCI_PLUGIN_IMPORT",
      "BUS_RCI_PLUGIN_SLA","BUS_RCI_PLUGIN_ADVANCED_REPORTS",
      "BUS_RCI_LIVE_SESSION","BUS_BASE_SAT_DAY","BUS_BASE_DEFAULT_WEB",
    ]) expect(codes).toContain(source);
    const result=inspectBusinessPricingSourceCoverage(full(cfg),cfg);
    expect(result.shapeCompatible).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.commerciallyFrozen).toBe(false);
    expect(result.gaps).toEqual(["SOURCE_CATALOG_NEEDS_IMMUTABLE_REVISION"]);
  });

  it("requires the THREE existing engine numeric fallbacks explicitly before official server freeze",()=>{
    const cfg=config();
    const input=requiredBusinessRuleCodes(cfg).map(rule);
    // Old UI readiness has no requirement for the fallback rules.
    const candidate=inspectBusinessPricingSourceCoverage(input,cfg);
    expect(candidate.shapeCompatible).toBe(false);
    expect(candidate.missing).toContain("BUS_BASE_SAT_DAY");
    expect(candidate.missing).toContain("BUS_BASE_DEFAULT_WEB");
    expect(candidate.missing).toContain("BUS_USEIT_FACTOR");
  });

  it("rejects a duplicate active code and invalid or non-EUR pricing inputs",()=>{
    const cfg=config();
    const input=full(cfg);
    input.push({...rule(input[0].code),id:"duplicated"});
    input[1]={...input[1],currency:"USD"};
    const candidate=inspectBusinessPricingSourceCoverage(input,cfg);
    expect(candidate.duplicate).toContain(input[0].code);
    expect(candidate.invalid).toContain(input[1].code);
    expect(candidate.shapeCompatible).toBe(false);
  });

  it("onsite and custom service quotes require separately versioned approved price evidence",()=>{
    const onsite=config();
    onsite.implementation={...onsite.implementation,type:"Onsite",
      onsiteRegion:"Portugal",onsiteClientDays:2};
    const a=inspectBusinessPricingSourceCoverage(full(onsite),onsite);
    expect(a.gaps).toContain("SOURCE_ONSITE_RATE_NEEDS_VERSION");
    expect(a.shapeCompatible).toBe(false);
    const custom=config();
    custom.implementation={...custom.implementation,customServices:[
      {label:"Customer-specific migration",price:150},
    ]};
    const b=inspectBusinessPricingSourceCoverage(full(custom),custom);
    expect(b.gaps).toContain("SOURCE_CUSTOM_PRICE_NEEDS_APPROVAL");
    expect(b.shapeCompatible).toBe(false);
  });

  it("does not require UseIT factor for a KeepIT-only calculation",()=>{
    const cfg=config();
    const input=requiredBusinessRuleCodes(cfg,["keepit"]).map(rule).concat(
      BUSINESS_AUTHORITY_DEFAULT_CODES.map(rule),
    );
    const result=inspectBusinessPricingSourceCoverage(input,cfg,["keepit"]);
    expect(result.missing).toHaveLength(0);
    expect(result.requiredCodes).not.toContain("BUS_USEIT_FACTOR");
    expect(result.commerciallyFrozen).toBe(false);
  });
});
