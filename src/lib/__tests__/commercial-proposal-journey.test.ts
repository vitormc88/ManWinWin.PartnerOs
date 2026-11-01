import { describe,it,expect } from "vitest";
import { newServiceReview,serviceReviewErrors,proposalIdentity,revisionPayload,groupAdditionLines,servicesSummary } from "../commercial-proposal-journey";
import { additionDocumentContent } from "../commercial-addition-documents";
import type { Proposal } from "@/types/proposal";
import type { AdditionDraft,AdditionLine } from "../commercial-additions";
const services={...newServiceReview(),id:"services-1",owner:"Rita",scope:"Training stock and purchases",modality:"compare" as const,quantity:2,requestedDiscount:25,expenses:"Travel quoted separately",nextDate:"2026-11-03"};
const draft={schema:"commercial_addition_v1",action:"add_users",baseline:{clientId:"c",clientName:"QA",backoffice:1,web:1},selection:{backoffice:2,web:1,products:["stock"],implementationReview:"separate",serviceReview:services,commercial:{language:"EN",proposalDate:"2026-10-29",validityDays:30}},rules:[],quote:{blockers:[],lines:[],dueNow:100,annualIncrease:20,renewalAnnual:120,afterBackoffice:3,afterWeb:2}} as unknown as AdditionDraft;
describe("Commercial proposal identity and linked services",()=>{
 it("retains original issued snapshot and creates an explicit independent revision payload",()=>{
   const original={id:"aaaa-bbbb",version:2,status:"Sent",business_config:{commercial_addition:draft},payment_terms:"100% upfront"} as unknown as Proposal;
   const next=revisionPayload(original,draft,"2026-11-01");expect(next.business_config.commercial_journey).toEqual({rootId:"aaaa-bbbb",revision:2,revisionOf:"aaaa-bbbb"});
   expect(original.status).toBe("Sent");expect(draft.selection.commercial!.proposalDate).toBe("2026-10-29");expect(next.business_config.commercial_addition.selection.commercial!.proposalDate).toBe("2026-11-01");expect(next.business_config.commercial_addition.quote).toEqual(draft.quote);
   expect(proposalIdentity({...next,id:"cccc",version:3} as unknown as Proposal)).toBe("MWW-AAAABBBB · r2 · v3");
 });
 it("does not imply independent proposals are revisions of one another",()=>{expect(proposalIdentity({id:"1111",version:1})).not.toBe(proposalIdentity({id:"2222",version:2}));});
 it("requires scope, owner, next date and explicit onsite expenses",()=>{expect(serviceReviewErrors(newServiceReview()).length).toBeGreaterThan(0);expect(serviceReviewErrors(services)).toEqual([]);expect(serviceReviewErrors({...services,expenses:""})).toContain("Record how onsite travel and accommodation will be quoted.");});
 it("requires a real separate quotation reference before its budget is marked quoted",()=>{expect(serviceReviewErrors({...services,status:"quoted"})).toContain("Enter the separate services quotation reference.");expect(serviceReviewErrors({...services,status:"quoted",quoteReference:"SERV-42"})).toEqual([]);});
 it("rejects invalid discounts and service quantities",()=>{expect(serviceReviewErrors({...services,requestedDiscount:101,quantity:-1})).toHaveLength(2);});
 it("labels the 25% as requested and keeps services out of software purchase and ARR",()=>{const c=additionDocumentContent({},draft);expect(c.services.join()).toContain("25%");expect(c.services.join()).toContain("not approved");expect(c.services.join()).toContain("excluded from totals");expect(draft.quote.dueNow).toBe(100);expect(draft.quote.annualIncrease).toBe(20);});
 it("groups an acquisition with its support but never merges unrelated concessions",()=>{
   const lines=[{code:"BUS_KEEPIT_STOCK_MODULE",dueNow:100},{code:"BUS_KEEPIT_STOCK_MODULE_SAT",dueNow:10},{code:"BUS_WEB_MOBILE_USER",dueNow:20}] as AdditionLine[];
   const groups=groupAdditionLines(lines);expect(groups.map(g=>g.length)).toEqual([2,1]);expect(groups[0].reduce((s,l)=>s+l.dueNow,0)).toBe(110);
 });
 it("makes cancelled service budgets remain an explicit exclusion, never a priced service",()=>{expect(servicesSummary({...draft,selection:{...draft.selection,serviceReview:{...services,status:"cancelled"}}}).join()).toContain("SOFTWARE ONLY");});
});
