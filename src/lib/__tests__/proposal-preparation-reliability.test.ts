import { describe, expect, it } from "vitest";
import { initialAdditionCommercial, initialAdditionSelection, calculateAddition, type AdditionBaseline } from "../commercial-additions";
import { additionPaymentText, upfrontAdditionPayment, PROPOSED_PAYMENT_REFERENCE } from "../commercial-addition-terms";
import { changeAdditionCalculation, additionFieldIssues, additionReviews } from "../addition-preparation-ux";
import { additionDocumentContent } from "../commercial-addition-documents";
import type { PricingRule } from "@/types/proposal";

const b: AdditionBaseline = {clientId:"c",clientName:"QA",partnerId:null,licenseId:"l",contractId:"k",family:"Business",model:"useit",plan:null,deployment:"saas",backoffice:1,web:1,owned:[],renewalDate:"2027-10-31",recordedAnnual:1000,priceTable:"QA",satActive:true};
const rule=(code:string,unit_price:number,unit_type="yearly",support_percentage:number|null=null):PricingRule=>({id:code,code,label:code,unit_price,unit_type,support_percentage,currency:"EUR",active:true,category:"software",notes:null});
const rules=[rule("BUS_USEIT_ADDITIONAL_BACKOFFICE",352),rule("BUS_KEEPIT_ADDITIONAL_BACKOFFICE",1850,"one-time"),rule("BUS_USEIT_FACTOR",0,"percentage",19),rule("BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE",10,"per-user-month")];
function selection() {const c=initialAdditionCommercial("2026-10-31");c.payment=upfrontAdditionPayment(c.payment);return {...initialAdditionSelection(b,"2026-10-31"),backoffice:1,monthPolicy:"complete" as const,pricingBasis:"direct" as const,offerBasis:"customer" as const,implementationReview:"not_needed" as const,priceReview:"QA approved",baselineAnnualConfirmed:true,commercial:c};}

describe("Proposal reliability after real audit findings",()=>{
  it("edits preset billing without exporting an obsolete 100% upfront claim in either language",()=>{
    const s=selection();s.commercial.payment={...s.commercial.payment,invoice:"split",awardPercent:50};
    for(const lang of ["PT","EN"] as const){const text=additionPaymentText(s.commercial.payment,lang);expect(text).toContain("50%");expect(text).not.toContain("100% upfront");}
    const legacy={...s.commercial.payment,reference:"Proposed terms: 100% upfront; activation after full payment"};
    expect(additionPaymentText(legacy,"PT")).not.toContain("100% upfront");
    expect(upfrontAdditionPayment({...legacy,reference:"Agreement CONTROL-42"}).reference).toBe("Agreement CONTROL-42");
    expect(upfrontAdditionPayment(legacy).reference).toBe(PROPOSED_PAYMENT_REFERENCE);
  });
  it("keeps percentage concessions and their justification attached to the same BackOffice",()=>{
    const s=selection();s.commercial.adjustments.BUS_USEIT_ADDITIONAL_BACKOFFICE={unitPrice:null,initialDiscountPct:5,renewalDiscountPct:10,reason:"Agreed concession"};
    const next=changeAdditionCalculation(b,s,rules,"derived");const q=calculateAddition(b,next,rules);
    expect(next.commercial!.adjustments.BUS_KEEPIT_ADDITIONAL_BACKOFFICE).toEqual(s.commercial.adjustments.BUS_USEIT_ADDITIONAL_BACKOFFICE);
    expect(next.commercial!.adjustments).not.toHaveProperty("BUS_USEIT_ADDITIONAL_BACKOFFICE");
    expect(q.blockers).toEqual([]);expect(q.lines[0].initialDiscountPct).toBe(5);expect(q.lines[0].annual).toBe(316.35);
  });
  it("supports an explicit choice to retain a negotiated annual tariff or return to catalogue",()=>{
    const s=selection();s.commercial.adjustments.BUS_USEIT_ADDITIONAL_BACKOFFICE={unitPrice:300,initialDiscountPct:5,renewalDiscountPct:0,reason:"Annual agreement"};
    expect(changeAdditionCalculation(b,s,rules,"derived","keep").commercial!.adjustments.BUS_KEEPIT_ADDITIONAL_BACKOFFICE.unitPrice).toBe(300);
    const reset=changeAdditionCalculation(b,s,rules,"derived","catalogue").commercial!.adjustments.BUS_KEEPIT_ADDITIONAL_BACKOFFICE;
    expect(reset.unitPrice).toBeNull();expect(reset.initialDiscountPct).toBe(5);expect(reset.reason).toBe("Annual agreement");
  });
  it("diagnoses invalid discounts at the field without inventing a contract review",()=>{
    const s=selection();s.commercial.adjustments.BUS_USEIT_ADDITIONAL_BACKOFFICE={unitPrice:null,initialDiscountPct:101,renewalDiscountPct:0,reason:""};
    const q=calculateAddition(b,s,rules),issues=additionFieldIssues(s,q.lines,100),reviews=additionReviews(q.blockers,true,issues);
    expect(issues.some(i=>i.target==="initial-discount-BUS_USEIT_ADDITIONAL_BACKOFFICE"&&i.message.includes("100%"))).toBe(true);
    expect(reviews.some(r=>r.owner==="HQ / contract owner")).toBe(false);
    expect(reviews.some(r=>r.target==="reason-BUS_USEIT_ADDITIONAL_BACKOFFICE")).toBe(true);
  });
  it("labels unsaved previews and numbered saved drafts without claiming an awarded increase",()=>{
    const s=selection(),draft={schema:"commercial_addition_v1" as const,action:"add_users" as const,baseline:b,selection:s,rules,quote:calculateAddition(b,s,rules)};
    const preview=additionDocumentContent({},draft);expect(preview.details.join()).toContain("não guardada");expect(preview.details.join()).not.toContain("vdraft");expect(preview.summary.join()).toContain("proposto");
    const saved=additionDocumentContent({id:"saved",version:3,status:"Draft"},draft);expect(saved.versionLabel).toContain("v3");expect(saved.details.join()).not.toContain("PRÉ-VISUALIZAÇÃO");
  });
});
