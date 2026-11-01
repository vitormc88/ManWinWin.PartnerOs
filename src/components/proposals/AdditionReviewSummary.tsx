import type { AdditionDraft } from "@/lib/commercial-additions";
import { additionScope, servicesSummary } from "@/lib/commercial-proposal-journey";
import { additionMoney } from "@/lib/commercial-addition-documents";
import { customerProposalTotals } from "@/lib/customer-proposal-editor";
export function AdditionReviewSummary({draft,terms,notes,change}:{draft:AdditionDraft;terms?:string;notes?:string;change?:(step:number)=>void}) {
  const q=draft.quote,ready=!q.blockers.length;
  if(draft.selection.editorVersion===3) {
    const totals=customerProposalTotals(q.lines);
    const valid=q.months!=null&&q.months>0&&!q.blockers.some(m=>/approved annual|catalogue rule|valid quantity|finite|supported range|already licensed/.test(m));
    return <section aria-label="Review proposal composition" className="border rounded-lg p-4 space-y-4 text-sm">
      <div className="flex justify-between gap-2"><h3 className="font-semibold">Software, services & investment</h3>{change?<button type="button" className="underline" onClick={()=>change(0)}>Edit software</button>:null}</div>
      <p>{additionScope(draft).join(" · ")}</p><p className="text-muted-foreground">{draft.selection.effectiveDate} → {draft.selection.renewalDate} · {q.months??"—"} billable months</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground border-b"><th className="py-2">Item</th><th>Qty.</th><th className="text-right">This purchase</th><th className="text-right">Annual increase</th></tr></thead><tbody>{q.lines.map(l=><tr key={l.code} className="border-b"><td className="py-2 pr-3">{l.label}{l.initialDiscountPct?<span className="block text-xs text-muted-foreground">Discount {l.initialDiscountPct}%</span>:null}</td><td>{l.quantity}</td><td className="text-right tabular-nums">{additionMoney(l.dueNow)}</td><td className="text-right tabular-nums">{l.annual?additionMoney(l.annual):"—"}</td></tr>)}</tbody></table></div>
      {servicesSummary(draft).length?<div><div className="flex justify-between"><strong>Services & expenses</strong>{change?<button className="underline" type="button" onClick={()=>change(1)}>Edit services</button>:null}</div>{servicesSummary(draft).map(line=><p key={line} className="text-muted-foreground mt-1">{line}</p>)}</div>:null}
      <div className="rounded-lg bg-muted/40 p-4 space-y-2"><p>Software: {valid?additionMoney(totals.software):"price / period required"} · Services: {additionMoney(totals.services)} · Expenses: {additionMoney(totals.expenses)}</p><p className="font-semibold text-lg">This purchase: {valid?additionMoney(q.dueNow):"Complete missing prices / period"}</p><p>Annual increase: {valid?additionMoney(q.annualIncrease):"—"} · New annual renewal: {valid&&q.renewalAnnual!=null?additionMoney(q.renewalAnnual):"baseline review required"}</p></div>
      {terms?<div><div className="flex justify-between"><strong>Payment conditions</strong>{change?<button className="underline" type="button" onClick={()=>change(2)}>Edit conditions</button>:null}</div><p className="whitespace-pre-wrap mt-2">{terms}</p></div>:null}{notes?<p className="whitespace-pre-wrap">{notes}</p>:null}
      <p className="text-xs text-muted-foreground">Amounts exclude tax. Services and expenses are one-time. ARR changes only after adjudication; the licensed configuration changes on activation under the accepted payment conditions.</p>
    </section>;
  }
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
