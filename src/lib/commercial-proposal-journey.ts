import type { Proposal } from "@/types/proposal";
import { ADDITION_PRODUCTS, type AdditionDraft, type AdditionLine } from "./commercial-additions";

/** Operational service request, not a priced offer or an acceptance of services. */
export interface ServiceReview {
  id?: string; updatedAt?: string; owner: string; scope: string;
  modality: "online" | "onsite" | "compare"; quantity: number; unit: "days" | "hours";
  requestedDiscount: number; expenses: string;
  status: "requested" | "in_review" | "quoted" | "cancelled";
  quoteReference: string; nextDate: string;
}
export const newServiceReview = (): ServiceReview => ({owner:"",scope:"",modality:"online",quantity:1,unit:"days",requestedDiscount:0,expenses:"",status:"requested",quoteReference:"",nextDate:""});
export const serviceReference=(id:string)=>`SB-${id.replace(/-/g,"").slice(0,8).toUpperCase()}`;
export function serviceReviewErrors(s?: ServiceReview): string[] {
  if (!s) return ["Create or link the services budget request."];
  return [!s.owner.trim() && "Assign a services budget owner.", !s.scope.trim() && "Describe the training / implementation scope.",
    (!Number.isFinite(s.quantity)||s.quantity<=0||s.quantity>1000) && "Enter a service quantity greater than zero (maximum 1000).",
    (!Number.isFinite(s.requestedDiscount)||s.requestedDiscount<0||s.requestedDiscount>100) && "Requested service discount must be between 0% and 100%.",
    s.modality!=="online"&&!s.expenses.trim() && "Record how onsite travel and accommodation will be quoted.",
    s.status==="quoted"&&!s.quoteReference.trim() && "Enter the separate services quotation reference.",
    !s.nextDate && "Choose the next services review date."].filter((x):x is string=>!!x);
}
export function proposalIdentity(p: Partial<Proposal> & {journey?: unknown}): string {
  const journey = ((p.business_config as unknown as {commercial_journey?:{rootId?:string;revision?:number}})?.commercial_journey ?? p.journey) as {rootId?:string;revision?:number}|undefined;
  const root = journey?.rootId || p.id;
  if (!root) return "Unsaved preview";
  return `MWW-${root.replace(/-/g,"").slice(0,8).toUpperCase()} · r${journey?.revision || 1} · v${p.version || 1}`;
}
export function proposalJourney(p: Proposal) {
  return (p.business_config as unknown as {commercial_journey?:{rootId:string;revision:number;revisionOf:string}})?.commercial_journey;
}
export function revisionPayload(p: Proposal, draft: AdditionDraft, today: string) {
  const journey=proposalJourney(p);
  const selection={...draft.selection,...(draft.selection.commercial?{commercial:{...draft.selection.commercial,proposalDate:today}}:{})};
  return {...p,proposal_date:today,business_config:{...(p.business_config as unknown as Record<string,unknown>),commercial_addition:{...draft,selection},commercial_journey:{rootId:journey?.rootId||p.id,revision:(journey?.revision||1)+1,revisionOf:p.id}}};
}
export function groupAdditionLines(lines: AdditionLine[]) {
  const groups=new Map<string,AdditionLine[]>();
  for (const line of lines) {
    const key=line.code?.replace(/_SAT$/, "") || line.label.replace(/ — incremental S&AT.*$/, "");
    const rows=groups.get(key)||[];rows.push(line);groups.set(key,rows);
  }
  return [...groups.values()];
}
export function additionScope(d: AdditionDraft) {
  return [`BackOffice: ${d.baseline.backoffice} → ${d.quote.afterBackoffice}`,`WEB: ${d.baseline.web} → ${d.quote.afterWeb}`,
    ...d.selection.products.map(id=>ADDITION_PRODUCTS.find(p=>p.id===id)?.label||id)];
}
export function servicesSummary(d: AdditionDraft, pt=false): string[] {
  if(d.selection.implementationReview!=="separate") return [pt?"Sem serviços nesta proposta.":"No services in this proposal."];
  const s=d.selection.serviceReview;
  return [pt?"SOFTWARE APENAS — serviços e despesas excluídos dos totais; orçamento separado.":"SOFTWARE ONLY — services and expenses excluded from totals; separately quoted.",
    ...(s?[`${pt?"Pedido de serviços":"Services request"}: ${s.id ? serviceReference(s.id) : (pt?"por guardar":"not saved")} · ${pt?({requested:"pedido",in_review:"em revisão",quoted:"orçamentado em separado",cancelled:"cancelado"}[s.status]):s.status} · ${pt?"Responsável":"Owner"}: ${s.owner}`,
      `${pt?({online:"Online",onsite:"Presencial",compare:"Comparar online / presencial"}[s.modality]):s.modality} · ${s.quantity} ${pt?(s.unit==="days"?"dias":"horas"):s.unit} · ${pt?"desconto solicitado (não aprovado)":"requested discount (not approved)"}: ${s.requestedDiscount}%`,
      `${pt?"Âmbito":"Scope"}: ${s.scope}`,s.expenses?`${pt?"Despesas":"Expenses"}: ${s.expenses}`:"",s.quoteReference?`${pt?"Orçamento separado":"Separate quote"}: ${s.quoteReference}`:pt?"Orçamento de serviços pendente; este documento não adjudica serviços.":"Services quote pending; this document does not adjudicate services."].filter(Boolean):[pt?"Pedido de orçamento de serviços pendente.":"Services budget request pending."])];
}
