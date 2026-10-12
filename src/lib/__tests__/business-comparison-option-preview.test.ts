import { describe, it, expect } from "vitest";
import type { BusinessLineItem, BusinessOptionTotals } from "../proposal-business-engine";
import { prepareBusinessComparisonPreview } from "../business-comparison-option-preview";

function line(
  code: string, gross: number, discount: number,
  recurring: boolean, discountRenews: boolean,
  category: BusinessLineItem["category"] = "module",
): BusinessLineItem {
  return {
    code,label:code,category,unitPrice:gross,qty:1,amount:gross,
    discountPct:gross>0?discount/gross*100:0,
    discountAmount:discount,netAmount:gross-discount,
    recurring,discountAppliesToRenewal:discountRenews,
    frequency:recurring?"yearly":"one-time",
  };
}
function option(model:"keepit"|"useit", renews=false):BusinessOptionTotals {
  const software=model==="keepit" ? [
    line("CORE",1000,0,false,false),
    line("WEB",400,12,true,renews,"web_user"),
  ] : [line("USEIT",400,20,true,false)];
  const sat=model==="keepit"?line("SAT",170,0,true,false,"support"):null;
  const services=model==="keepit"?[line("IMPL",50,0,false,false,"service")]:[];
  return {
    model,software,api:null,hosting:[],sat,services,
    licenseSubtotal:model==="keepit"?1000:0,
    satBreakdown:{satBase:1000,satPct:17,satPercentageAmount:170,baseSatDay:0,baseDefaultWeb:0},
    useItDerivation:null,
    totalYear1:model==="keepit"?1608:380,
    totalYear2Plus:model==="keepit"?(renews?558:570):400,
    totalFiveYears:0,hasDiscounts:true,
  };
}

describe("FIN02 Gate5C comparison display preparation (NOT a server pricing authorization)",()=>{
  it("prepares BOTH KeepIT and UseIT complete distinct per-line arrays with year1/renewal policy",()=>{
    const prepared=prepareBusinessComparisonPreview({
      keepit:option("keepit",true),useit:option("useit"),
    });
    expect(prepared.kind).toBe("compare_keepit_useit");
    expect(prepared.keepit.lines).toHaveLength(4);
    expect(prepared.useit.lines).toHaveLength(1);
    expect(prepared.keepit.total_year_1).toBe(1608);
    expect(prepared.keepit.total_recurring).toBe(558);
    expect(prepared.useit.total_year_1).toBe(380);
    expect(prepared.useit.total_recurring).toBe(400);
    expect(prepared.keepit.lines.find(l=>l.item_code==="WEB")).toMatchObject({
      gross_total:400,discount_amount:12,net_total:388,
      apply_discount_to_renewal:true,
    });
    expect(prepared.useit.lines[0]).toMatchObject({
      gross_total:400,discount_amount:20,net_total:380,
      apply_discount_to_renewal:false,
    });
    expect(Object.isFrozen(prepared.keepit.lines[0])).toBe(true);
  });

  it("expires promotional Web discount when chosen option says first-year-only",()=>{
    const result=prepareBusinessComparisonPreview({
      keepit:option("keepit",false),useit:option("useit"),
    });
    expect(result.keepit.total_year_1).toBe(1608);
    expect(result.keepit.total_recurring).toBe(570);
    expect(result.keepit.lines.find(l=>l.item_code==="WEB")?.apply_discount_to_renewal).toBe(false);
    expect(result.keepit.lines.find(l=>l.item_code==="SAT")?.gross_total).toBe(170);
  });

  it("fails closed when one alternative is missing or has wrong mode",()=>{
    expect(()=>prepareBusinessComparisonPreview({keepit:option("keepit"),useit:null}))
      .toThrow("FIN02_COMPARISON_REQUIRES_TWO_COMPLETE_OPTIONS");
    expect(()=>prepareBusinessComparisonPreview({keepit:option("useit"),useit:option("keepit")}))
      .toThrow("FIN02_WRONG_COMPARISON_OPTION");
  });

  it("does not present altered same-total gross/net line pricing as a verified option",()=>{
    const original=option("keepit",true);
    const modified={...original,software:original.software.map(l=>({...l}))};
    modified.software[0].netAmount+=100;
    modified.software[0].amount+=100;
    modified.software[1].netAmount-=100;
    modified.software[1].amount-=100;
    expect(()=>prepareBusinessComparisonPreview({keepit:modified,useit:option("useit")}))
      .toThrow(); // engine header unchanged; exact saved priced lines required.
  });

  it("rejects missing unique price line identifiers and invalid extra renewal flags",()=>{
    const dup=option("keepit",true);
    dup.software[1]={...dup.software[1],code:"CORE"};
    expect(()=>prepareBusinessComparisonPreview({keepit:dup,useit:option("useit")}))
      .toThrow("FIN02_DUPLICATE_OR_MISSING_PRICE_RULE");
    const wrong=option("keepit",true);
    wrong.services[0]={...wrong.services[0],discountAppliesToRenewal:true};
    expect(()=>prepareBusinessComparisonPreview({keepit:wrong,useit:option("useit")}))
      .toThrow("FIN02_INVALID_COMPARISON_LINE");
  });
});
