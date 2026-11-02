import { calculateAddition, initialAdditionSelection, initialAdditionCommercial, type AdditionBaseline, type AdditionSelection, type AdditionLine, type AdditionService } from "./commercial-additions";
import { upfrontAdditionPayment } from "./commercial-addition-terms";
import type { PricingRule } from "@/types/proposal";

export function newCustomerProposal(b: AdditionBaseline, today: string): AdditionSelection {
  const commercial = initialAdditionCommercial(today);
  return {...initialAdditionSelection(b,today),editorVersion:3,services:[],professionalPrices:{},
    offerBasis:"customer",pricingBasis:"direct",priceReview:"Current active catalogue; customer prices",
    monthPolicy:"complete",implementationReview:"not_needed",commercial:{...commercial,payment:upfrontAdditionPayment(commercial.payment)}};
}
export function setSoftwareDiscount(s: AdditionSelection, lines: AdditionLine[], pct: number, renews: boolean): AdditionSelection {
  if (!s.commercial) return s;
  const adjustments = {...s.commercial.adjustments};
  for (const l of lines.filter(l=>!["sat","hosting","service","expense"].includes(l.kind))) {
    const current = adjustments[l.code];
    if (!pct && current?.unitPrice == null) delete adjustments[l.code];
    else adjustments[l.code]={unitPrice:current?.unitPrice??null,initialDiscountPct:pct,renewalDiscountPct:renews&&l.annual>0?pct:0,reason:current?.reason||"Proposed software discount"};
  }
  return {...s,commercial:{...s.commercial,adjustments}};
}
export function setServicesDiscount(s: AdditionSelection, pct: number): AdditionSelection {
  if (!s.commercial) return s;
  const adjustments={...s.commercial.adjustments};
  for (const l of s.services??[]) {
    if (l.expense) continue;
    const code=`SERVICE_${l.id}`;
    if (!pct) delete adjustments[code];
    else adjustments[code]={unitPrice:null,initialDiscountPct:pct,renewalDiscountPct:0,reason:"Proposed services discount"};
  }
  return {...s,commercial:{...s.commercial,adjustments}};
}
export function removeService(s: AdditionSelection,id:string): AdditionSelection {
  const adjustments={...s.commercial?.adjustments};delete adjustments[`SERVICE_${id}`];
  return {...s,services:s.services?.filter(l=>l.id!==id),...(s.commercial?{commercial:{...s.commercial,adjustments}}:{})};
}
/** A changed service scope must never retain the approval for a catalogue session. */
export function updateProposalService(s: AdditionSelection, id: string, patch: Partial<AdditionService>): AdditionSelection {
  return {...s, services:s.services?.map(line=>{
    if(line.id!==id)return line;
    const changed = line.ruleCode && ((patch.unit!=null&&patch.unit!==line.unit)||(patch.modality!=null&&patch.modality!==line.modality));
    return {...line,...patch,...(changed?{ruleCode:null,unitPrice:null,reference:""}: {})};
  })};
}
export function serviceFromCatalogue(rules:PricingRule[],code:string,label:string,modality:AdditionService["modality"],unit:AdditionService["unit"]):AdditionService {
  const rule=rules.find(r=>r.active&&r.code===code&&r.currency==="EUR"&&r.unit_type==="one-time"&&Number(r.unit_price)>0);
  return {id:crypto.randomUUID(),label,modality,unit,quantity:1,unitPrice:rule?Number(rule.unit_price):null,ruleCode:rule?code:null,reference:rule?`Active catalogue: ${code}`:"",expense:false};
}
export function customerProposalTotals(lines:AdditionLine[]) {
  const amount=(predicate:(l:AdditionLine)=>boolean)=>Math.round(lines.filter(predicate).reduce((n,l)=>n+l.dueNow,0)*100)/100;
  return {software:amount(l=>!["service","expense"].includes(l.kind)),services:amount(l=>l.kind==="service"),expenses:amount(l=>l.kind==="expense")};
}
/** Reapply a simple section discount to newly selected components, not hosting/S&AT. */
export function reconcileCustomerBasket(b:AdditionBaseline,previous:AdditionSelection,next:AdditionSelection,rules:PricingRule[]) {
  const oldLines=calculateAddition(b,previous,rules).lines.filter(l=>!["sat","hosting","service","expense"].includes(l.kind));
  const values=oldLines.map(l=>previous.commercial?.adjustments[l.code]);
  const first=values[0];
  return first&&values.every(v=>v?.initialDiscountPct===first.initialDiscountPct&&v?.renewalDiscountPct===first.renewalDiscountPct)
    ?setSoftwareDiscount(next,calculateAddition(b,next,rules).lines,first.initialDiscountPct,first.renewalDiscountPct>0):next;
}
