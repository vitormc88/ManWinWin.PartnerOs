import type { AdditionDraft } from "@/lib/commercial-additions";
import { additionScope, servicesSummary } from "@/lib/commercial-proposal-journey";
import { additionMoney } from "@/lib/commercial-addition-documents";
export function AdditionReviewSummary({draft,terms,notes,change}:{draft:AdditionDraft;terms?:string;notes?:string;change?:(step:number)=>void}) {
  const q=draft.quote,ready=!q.blockers.length;
  return <section aria-label="Review proposal composition" className="rounded-lg border p-4 space-y-3 text-sm">
    <div className="flex justify-between gap-2"><h3 className="font-semibold">Check the proposal before continuing</h3>{change?<button type="button" className="underline" onClick={()=>change(0)}>Change items / services</button>:null}</div>
    <p>{additionScope(draft).join(" · ")}</p>
    <p>Effective {draft.selection.effectiveDate} · Renewal unchanged: {draft.selection.renewalDate} · {q.months??"—"} billable months</p>
    <div className="rounded-md bg-muted/40 p-3"><p className="font-medium">{draft.selection.implementationReview==="separate"?"Software only · services separately quoted":"Software · no services included"}</p><p>Purchase: {ready?additionMoney(q.dueNow):"Complete the preparation first"} · Annual increase: {ready?additionMoney(q.annualIncrease):"Pending"}</p><p>Annual renewal: {additionMoney(draft.baseline.recordedAnnual||0)} → {ready&&q.renewalAnnual!=null?additionMoney(q.renewalAnnual):"Pending"}</p></div>
    <ul className="space-y-1">{servicesSummary(draft).map(line=><li key={line}>{line}</li>)}</ul>
    {change?<button type="button" className="underline" onClick={()=>change(1)}>Change prices / period</button>:null}
    {terms?<details><summary className="cursor-pointer">Payment and activation conditions</summary><p className="whitespace-pre-wrap mt-2">{terms}</p></details>:null}
    {notes?<p className="whitespace-pre-wrap">{notes}</p>:null}
    <p className="text-xs text-muted-foreground">Saving, downloading and sending do not change ARR. Adjudication changes the software annual commitment once; access activation is separate. Services require their separate quotation and acceptance.</p>
  </section>;
}
