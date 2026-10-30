import { describe,it,expect } from "vitest";
import { calculateAddition,initialAdditionCommercial,initialAdditionSelection,type AdditionBaseline } from "../commercial-additions";
import { additionPaymentText } from "../commercial-addition-terms";
import { additionDocumentContent } from "../commercial-addition-documents";
import type { PricingRule } from "@/types/proposal";

const b:AdditionBaseline={clientId:"qa",clientName:"QA",partnerId:null,licenseId:"l",contractId:"c",family:"Business",model:"useit",plan:null,deployment:"on_premise",backoffice:1,web:1,owned:[],renewalDate:"2027-06-01",priceTable:"QA",recordedAnnual:1000,satActive:true};
const rule=(code:string,unit_price:number,unit_type="yearly",support_percentage:number|null=null):PricingRule=>({id:code,code,label:code,category:"software",unit_price,unit_type,support_percentage,currency:"EUR",active:true,notes:null});
const rules=[rule("BUS_WEB_MOBILE_USER",20,"per-user-month"),rule("BUS_KEEPIT_ADDITIONAL_BACKOFFICE",950,"one-time"),rule("BUS_KEEPIT_SAT",0,"yearly",17)];
function selection() {
 const commercial=initialAdditionCommercial("2026-07-01");commercial.payment={invoice:"award",awardPercent:100,awardDueDays:30,installationDueDays:30,activation:"on_award",reference:"Signed commercial agreement QA"};
 return {...initialAdditionSelection(b,"2026-07-01"),web:3,pricingBasis:"direct" as const,priceReview:"Agreed catalogue",monthPolicy:"complete" as const,offerBasis:"customer" as const,implementationReview:"not_needed" as const,baselineAnnualConfirmed:true,commercial};
}
describe("Detailed addition terms — historical proposal patterns",()=>{
 it("DGC: initial discount ends at renewal without changing the contracted annual tariff",()=>{
  const s=selection();s.commercial.adjustments.BUS_WEB_MOBILE_USER={unitPrice:null,initialDiscountPct:10,renewalDiscountPct:0,reason:"First purchase concession"};
  const q=calculateAddition(b,s,rules);expect(q.blockers).toEqual([]);expect(q.months).toBe(11);expect(q.dueNow).toBe(594);expect(q.annualIncrease).toBe(720);expect(q.renewalAnnual).toBe(1720);
 });
 it("Frijobel: negotiated tariff continues at renewal",()=>{
  const s=selection();s.web=2;s.effectiveDate="2026-06-01";s.commercial.proposalDate="2026-06-01";
  s.commercial.adjustments.BUS_WEB_MOBILE_USER={unitPrice:15,initialDiscountPct:0,renewalDiscountPct:0,reason:"Existing contracted tariff"};
  const q=calculateAddition(b,s,rules);expect(q.blockers).toEqual([]);expect(q.dueNow).toBe(360);expect(q.annualIncrease).toBe(360);
 });
 it("a free component still grants the selected accesses and contributes zero ARR",()=>{
  const s=selection();s.commercial.adjustments.BUS_WEB_MOBILE_USER={unitPrice:null,initialDiscountPct:100,renewalDiscountPct:100,reason:"HQ approved permanent offer"};
  const q=calculateAddition(b,s,rules);expect(q.blockers).toEqual([]);expect(q.dueNow).toBe(0);expect(q.annualIncrease).toBe(0);expect(q.afterWeb).toBe(4);
 });
 it("keeps support linked to the negotiated KeepIT capital tariff",()=>{
  const s=selection();s.web=0;s.backoffice=1;s.commercial.adjustments.BUS_KEEPIT_ADDITIONAL_BACKOFFICE={unitPrice:1000,initialDiscountPct:0,renewalDiscountPct:0,reason:"Agreed capital price"};
  const q=calculateAddition({...b,model:"keepit"},s,rules);expect(q.blockers).toEqual([]);expect(q.lines[1].annual).toBe(170);expect(q.lines[1].unitPrice).toBe(170);expect(q.lines[1].dueNow).toBe(155.83);expect(q.dueNow).toBe(1155.83);
 });
 it("blocks non-finite/negative prices, unexplained discounts and stale adjustments",()=>{
  const s=selection();s.commercial.adjustments.BUS_WEB_MOBILE_USER={unitPrice:NaN,initialDiscountPct:0,renewalDiscountPct:0,reason:""};expect(calculateAddition(b,s,rules).blockers.length).toBeGreaterThan(0);
  s.commercial.adjustments={STALE:{unitPrice:15,initialDiscountPct:0,renewalDiscountPct:0,reason:"Old"}};expect(calculateAddition(b,s,rules).blockers.join()).toContain("unselected");
 });
 it("requires a payment agreement and a coherent proposal date",()=>{
  const s=selection();s.commercial.payment.activation="";expect(calculateAddition(b,s,rules).blockers.join()).toContain("activation");
  s.commercial.proposalDate="2027-01-01";expect(calculateAddition(b,s,rules).blockers.join()).toContain("precede");
 });
 it("renders split invoices with the exact advance-payment milestone",()=>{
  const p={...selection().commercial.payment,invoice:"split" as const,awardPercent:50,awardDueDays:0,activation:"award_payment" as const};
  const text=additionPaymentText(p,"PT");expect(text).toContain("50%");expect(text).toContain("pronto pagamento");expect(text).toContain("30 dias");expect(text).toContain("pagamento da fatura de adjudicação");
 });
 it("renders Portuguese periods, validity, discounts and payment in the document",()=>{
  const s=selection();s.commercial.adjustments.BUS_WEB_MOBILE_USER={unitPrice:null,initialDiscountPct:10,renewalDiscountPct:0,reason:"QA"};
  const draft={schema:"commercial_addition_v1" as const,action:"add_users" as const,baseline:b,selection:s,rules,quote:calculateAddition(b,s,rules)};
  const c=additionDocumentContent({payment_terms:additionPaymentText(s.commercial.payment,"PT")},draft);
  expect(c.pt).toBe(true);expect(c.details.join()).toContain("11 meses");expect(c.details.join()).toContain("31/07/2026");expect(c.rows[0][0]).toContain("Desconto inicial: 10%");expect(c.summary.join()).toContain("594,00");
 });
});
