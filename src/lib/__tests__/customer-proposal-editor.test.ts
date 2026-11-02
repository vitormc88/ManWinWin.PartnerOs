import { describe,it,expect } from "vitest";
import { calculateAddition,additionBaselineFromSnapshot,type AdditionBaseline,type AdditionSelection } from "../commercial-additions";
import { newCustomerProposal,setSoftwareDiscount,setServicesDiscount,removeService,reconcileCustomerBasket,updateProposalService } from "../customer-proposal-editor";
import { additionDocumentContent } from "../commercial-addition-documents";
import type {PricingRule} from "@/types/proposal";
const b:AdditionBaseline={clientId:"c",clientName:"Synthetic",licenseId:"l",contractId:"k",partnerId:null,family:"Business",model:"useit",plan:null,deployment:"saas",backoffice:10,web:11,owned:[],renewalDate:"2028-04-14",priceTable:"2023",recordedAnnual:14031,satActive:true};
const rule=(code:string,price:number,unit="yearly",pct:number|null=null)=>({id:code,code,label:code,unit_price:price,unit_type:unit,currency:"EUR",active:true,category:"business",notes:null,support_percentage:pct}) as PricingRule;
const rules=[rule("BUS_USEIT_ADDITIONAL_BACKOFFICE",352),rule("BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE",10,"per-user-month"),rule("BUS_WEB_MOBILE_USER",20,"per-user-month"),rule("web_user",20,"per-user-month"),rule("requests_module",600),rule("BUS_USEIT_STOCK_MODULE",648),rule("BUS_KEEPIT_STOCK_MODULE",1750,"one-time"),rule("BUS_KEEPIT_SAT",0,"yearly",17),rule("impl_session",360,"one-time")];
const selection=():AdditionSelection=>({...newCustomerProposal(b,"2026-10-29"),baselineAnnualConfirmed:true});
describe("Combined customer proposals",()=>{
 it("requires a new approved tariff when a catalogue session becomes an onsite day",()=>{
  const s={...selection(),services:[{id:"a",label:"Training",quantity:2,unit:"session" as const,modality:"online" as const,unitPrice:360,ruleCode:"impl_session",reference:"Catalogue",expense:false}]};
  const next=updateProposalService(s,"a",{unit:"day",modality:"onsite"});
  expect(next.services?.[0]).toMatchObject({quantity:2,unit:"day",modality:"onsite",unitPrice:null,ruleCode:null,reference:""});
  expect(calculateAddition(b,next,rules).blockers.join()).toContain("approved unit price");
  const forged={...s,services:[{...s.services[0],unit:"day" as const}]};
  expect(calculateAddition(b,forged,rules).blockers.join()).toContain("approved unit price");
 });
 it("quotes services near and after renewal with zero software months and no baseline confirmation",()=>{
  for(const day of ["2026-11-01","2026-12-01"]){
   const short={...b,renewalDate:"2026-11-21",recordedAnnual:null};
   const s={...newCustomerProposal(short,day),services:[{id:"a",label:"Training",quantity:2,unit:"session" as const,modality:"online" as const,unitPrice:360,ruleCode:"impl_session",reference:"Catalogue",expense:false}]};
   const q=calculateAddition(short,s,rules);expect(q.blockers).toEqual([]);expect(q.months).toBe(0);expect(q.dueNow).toBe(720);expect(q.annualIncrease).toBe(0);
   const content=additionDocumentContent({id:"p",version:1},{schema:"commercial_addition_v1",action:"add_users",baseline:short,selection:s,rules,quote:q});
   expect(content.summary.join()).toContain("Sem ativação de licença");expect(content.details.join()).not.toContain("Período cobrado:");expect(content.summary.join()).not.toContain("por confirmar");
  }
 });
 it("keeps Barcino proration and ARR separate from discounted one-time services",()=>{
  let s={...selection(),backoffice:1,services:[{id:"training",label:"Onsite training",modality:"onsite" as const,unit:"day" as const,quantity:2,unitPrice:695,ruleCode:null,reference:"Approved quote",expense:false},{id:"expenses",label:"Travel",modality:"onsite" as const,unit:"fixed" as const,quantity:1,unitPrice:250,ruleCode:null,reference:"Approved travel",expense:true}]};
  const before=structuredClone(b);s=setServicesDiscount(s,25) as typeof s;
  const q=calculateAddition(b,s,rules);
  expect(q.blockers).toEqual([]);expect(q.months).toBe(17);expect(q.annualIncrease).toBe(472);expect(q.dueNow).toBe(1961.17);expect(q.renewalAnnual).toBe(14503);
  expect(q.lines.find(l=>l.code==="SERVICE_training")?.dueNow).toBe(1042.5);expect(q.lines.find(l=>l.kind==="expense")?.dueNow).toBe(250);expect(b).toEqual(before);
 });
 it("makes all Professional modules selectable with explicit approved tariffs, without inventing a Business price",()=>{
  const pro={...b,family:"Professional" as const,model:null,plan:1};
  const s={...selection(),products:["stock","api"] as AdditionSelection["products"],professionalPrices:{stock:{annual:400,reference:"HQ approved tariff"},api:{annual:600,reference:"HQ approved tariff"}}};
  const q=calculateAddition(pro,s,rules);expect(q.blockers).toEqual([]);expect(q.annualIncrease).toBe(1000);expect(q.lines.map(l=>l.code)).toEqual(["PRO_ADDITION_STOCK","PRO_ADDITION_API"]);
  const missing=calculateAddition(pro,{...s,professionalPrices:{}},rules);expect(missing.blockers.join()).toContain("approved annual price");expect(missing.lines).toEqual([]);
 });
 it("recognizes plan inclusions consistently without charging an included plugin",()=>{
  const baseline=additionBaselineFromSnapshot({clientId:"c",license:{product:"Professional",edition:"Professional 3"}});
  expect(baseline.owned).toEqual(expect.arrayContaining(["stock","purchase","import","workflow","reports","sla","api"]));
 });
 it("does not apply software discounts to hosting, S&AT, services or expenses",()=>{
  let s={...selection(),backoffice:1};s=setSoftwareDiscount(s,calculateAddition(b,s,rules).lines,25,false);
  const q=calculateAddition(b,s,rules);expect(q.annualIncrease).toBe(472);expect(q.lines.find(l=>l.kind==="hosting")?.initialDiscountPct).toBe(0);expect(q.dueNow).toBe(544);
 });
 it("preserves a section discount when adding another component and removes deleted service adjustments",()=>{
  let s={...selection(),backoffice:1};s=setSoftwareDiscount(s,calculateAddition(b,s,rules).lines,10,true);
  const next=reconcileCustomerBasket(b,s,{...s,web:1},rules);expect(next.commercial?.adjustments.BUS_WEB_MOBILE_USER.initialDiscountPct).toBe(10);
  const services=setServicesDiscount({...s,services:[{id:"a",label:"Session",quantity:1,unit:"session",modality:"online",unitPrice:360,ruleCode:"impl_session",reference:"Catalogue",expense:false}]},25);
  expect(removeService(services,"a").commercial?.adjustments.SERVICE_a).toBeUndefined();
 });
 it("allows a service-only offer and never prorates it or adds it to renewal",()=>{
  const s={...selection(),services:[{id:"a",label:"Remote training",quantity:2,unit:"session" as const,modality:"online" as const,unitPrice:360,ruleCode:"impl_session",reference:"Catalogue",expense:false}]};
  const q=calculateAddition(b,s,rules);expect(q.blockers).toEqual([]);expect(q.dueNow).toBe(720);expect(q.annualIncrease).toBe(0);expect(q.renewalAnnual).toBe(14031);
  const c=additionDocumentContent({id:"p",version:1},{schema:"commercial_addition_v1",action:"add_modules",baseline:b,selection:s,rules,quote:q});expect(c.summary.join()).toContain("Serviços e despesas");expect(c.rows.some(row=>row[0].includes("Remote training"))).toBe(true);
 });
 it("blocks tampered catalogue services, expenses discounts and nonfinite prices",()=>{
  const s={...selection(),services:[{id:"a",label:"Training",quantity:1,unit:"session" as const,modality:"online" as const,unitPrice:1,ruleCode:"impl_session",reference:"Catalogue",expense:false}]};
  expect(calculateAddition(b,s,rules).blockers.join()).toContain("approved unit price");
  const expense={...s,services:[{...s.services[0],unitPrice:250,ruleCode:null,expense:true}],commercial:{...s.commercial!,adjustments:{SERVICE_a:{unitPrice:null,initialDiscountPct:25,renewalDiscountPct:0,reason:"test"}}}};
  expect(calculateAddition(b,expense,rules).blockers.join()).toContain("cannot be discounted");
 });
});
