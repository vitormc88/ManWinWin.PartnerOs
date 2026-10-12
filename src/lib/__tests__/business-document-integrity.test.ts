import { describe, expect, it } from "vitest";
import {
  businessDocumentHasUnsavedChanges,
  businessDocumentSnapshotBlocker,
  savedBusinessConfig,
} from "../business-document-integrity";
import { computeBusinessOption, DEFAULT_BUSINESS_CONFIG, DEFAULT_BUSINESS_DISCOUNTS } from "../proposal-business-engine";
import { buildBusinessProposalItemRows, businessPersistedTotals } from "../proposal-business-persistence";
import type { PricingRule } from "@/types/proposal";
const rule = (code: string, unit_price: number, frequency="one-time", support_percentage?:number): PricingRule => ({
  id:code,code,label:code,category:"business",unit_price,unit_type:frequency,
  currency:"EUR",active:true,notes:null,...(support_percentage===undefined?{}:{support_percentage})
});
const rules: PricingRule[]=[
  rule("BUS_KEEPIT_MAINTENANCE_MODULE",6800),
  rule("BUS_WEB_MOBILE_USER",20,"per-user-month"),
  rule("BUS_KEEPIT_SAT",0,"yearly",17),
  rule("BUS_BASE_SAT_DAY",490),
  rule("BUS_BASE_DEFAULT_WEB",240),
];
const cfg={
  ...DEFAULT_BUSINESS_CONFIG, deployment:"on_premise" as const,
  additionalWebUsers:10, discounts:{...DEFAULT_BUSINESS_DISCOUNTS,softwarePct:8,webUsersPct:3,webUsersRenews:true}
};
const priced=computeBusinessOption(rules,cfg,"keepit")!;
const rows=buildBusinessProposalItemRows(priced);
const totals=businessPersistedTotals(rows);
const proposal={
  product_family:"Business",proposal_mode:"keepit_only",
  business_config:cfg,total_year_1:totals.year1,
  total_recurring:totals.year2Plus,discount_amount:totals.discount,
};
describe("FIN03 proposal document source-of-truth gate",()=>{
  it("accepts exact persisted Business terms and mixed discounts",()=>{
    expect(businessDocumentSnapshotBlocker(proposal,rows,rules)).toBeNull();
  });
  it("rejects R1-like legacy gross persistence even if header looks discounted",()=>{
    const r1=rows.map(r=>({...r,net_total:r.gross_total,discount_amount:0,discount_value:0,discount_type:"none"}));
    expect(businessDocumentSnapshotBlocker(proposal,r1,rules)).toBe("FIN03_SAVED_LINES_DIVERGE_FROM_DOCUMENT");
  });
  it("rejects catalogue price drift after the proposal was validated",()=>{
    const drift=rules.map(r=>r.code==="BUS_WEB_MOBILE_USER"?{...r,unit_price:25}:r);
    expect(businessDocumentSnapshotBlocker(proposal,rows,drift)).toBe("FIN03_SAVED_LINES_DIVERGE_FROM_DOCUMENT");
  });
  it("rejects header amount inconsistencies",()=>{
    expect(businessDocumentSnapshotBlocker({...proposal,total_year_1:totals.year1+1},rows,rules))
      .toBe("FIN03_SAVED_HEADER_DIVERGES_FROM_DOCUMENT");
  });
  it("refuses a comparison DOCX without individually frozen alternatives",()=>{
    expect(businessDocumentSnapshotBlocker({...proposal,proposal_mode:"compare_keepit_useit"},rows,rules))
      .toBe("FIN03_COMPARISON_REQUIRES_FROZEN_OPTION_SNAPSHOTS");
  });
  it("flags an unsaved edit and accepts an unchanged saved draft",()=>{
    const saved={
      business_config:cfg,client_name:"Fictional Foods",project_name:"Plant Pilot",country:"TH",
      language:"EN",proposal_mode:"keepit_only",deployment:"on_premise",payment_terms:"30 days",notes:"test",
    };
    expect(businessDocumentHasUnsavedChanges(saved,{...saved,business_config:{...cfg,additionalWebUsers:11}})).toBe(true);
    expect(businessDocumentHasUnsavedChanges(saved,{...saved,business_config:savedBusinessConfig(cfg)})).toBe(false);
  });
});
