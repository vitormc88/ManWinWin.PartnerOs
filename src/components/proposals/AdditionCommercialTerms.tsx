import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { AdditionCommercial, AdditionLine, AdditionAdjustment } from "@/lib/commercial-additions";

export function AdditionCommercialTerms({ value, lines, isHQ, maxDiscount, onChange }: {
  value: AdditionCommercial; lines: AdditionLine[]; isHQ: boolean; maxDiscount: number; onChange: (c: AdditionCommercial) => void;
}) {
  const payment = value.payment;
  const paymentField = <K extends keyof typeof payment>(key: K, v: typeof payment[K]) => onChange({ ...value, payment: { ...payment, [key]: v } });
  const adjust = (code: string, patch: Partial<AdditionAdjustment>) => onChange({ ...value, adjustments: { ...value.adjustments, [code]: { unitPrice: null, initialDiscountPct: 0, renewalDiscountPct: 0, reason: "", ...value.adjustments[code], ...patch } } });
  return <section className="space-y-4 border rounded-lg p-4" aria-label="Detailed commercial terms">
    <h3 className="font-semibold">Prices, discounts & payment</h3>
    <p className="text-xs text-muted-foreground">Initial discounts affect this purchase only. Renewal discounts affect the annual contractual increase. Negotiated tariffs and offers require justification; HQ authorizes tariff changes and credit activation.</p>
    <div className="grid sm:grid-cols-3 gap-3">
      <div><Label htmlFor="addition-language">Document language</Label><select id="addition-language" className="w-full h-10 border rounded px-2 bg-background" value={value.language} onChange={e=>onChange({...value,language:e.target.value as "PT"|"EN"})}><option value="PT">Português</option><option value="EN">English</option></select></div>
      <div><Label htmlFor="addition-proposal-date">Proposal date</Label><Input id="addition-proposal-date" type="date" value={value.proposalDate} onChange={e=>onChange({...value,proposalDate:e.target.value})}/></div>
      <div><Label htmlFor="addition-validity">Validity (days)</Label><Input id="addition-validity" type="number" min={1} max={365} value={value.validityDays} onChange={e=>onChange({...value,validityDays:Number(e.target.value)})}/></div>
    </div>
    {lines.map(l=>{
      const a=value.adjustments[l.code], recurring=(l.referenceAnnual??l.annual)>0;
      return <div className="rounded-md border p-3 space-y-2" key={l.code}>
        <p className="font-medium text-sm">{l.label} · {l.quantity} {l.unitPeriod === "month" ? "× €/unit/month" : l.unitPeriod === "once" ? "× €/unit once" : "× €/unit/year"}</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><Label htmlFor={`price-${l.code}`}>Negotiated unit price (€)</Label><Input id={`price-${l.code}`} type="number" min={0} step="0.01" disabled={!isHQ || l.kind==="sat"} placeholder={String(l.referenceUnitPrice??"")} value={a?.unitPrice??""} onChange={e=>adjust(l.code,{unitPrice:e.target.value===""?null:Number(e.target.value)})}/>{l.kind==="sat"?<p className="text-xs text-muted-foreground">S&AT follows the negotiated license tariff.</p>:null}</div>
          <div><Label htmlFor={`initial-discount-${l.code}`}>Initial discount (%)</Label><Input id={`initial-discount-${l.code}`} type="number" min={0} max={maxDiscount} step="0.01" value={a?.initialDiscountPct??0} onChange={e=>adjust(l.code,{initialDiscountPct:Number(e.target.value)})}/></div>
          <div><Label htmlFor={`renewal-discount-${l.code}`}>Renewal discount (%)</Label><Input id={`renewal-discount-${l.code}`} type="number" min={0} max={maxDiscount} step="0.01" disabled={!recurring} value={a?.renewalDiscountPct??0} onChange={e=>adjust(l.code,{renewalDiscountPct:Number(e.target.value)})}/></div>
        </div>
        {a?<div><Label htmlFor={`reason-${l.code}`}>Commercial justification / agreement</Label><Input id={`reason-${l.code}`} value={a.reason} onChange={e=>adjust(l.code,{reason:e.target.value})}/></div>:null}
        <div className="flex gap-2">{isHQ?<Button type="button" variant="outline" size="sm" onClick={()=>adjust(l.code,{initialDiscountPct:100,renewalDiscountPct:recurring?100:0})}>Offer this component</Button>:null}{a?<Button type="button" variant="ghost" size="sm" onClick={()=>{const next={...value.adjustments};delete next[l.code];onChange({...value,adjustments:next});}}>Reset to catalogue</Button>:null}</div>
      </div>;
    })}
    {Object.keys(value.adjustments).some(code=>!lines.some(l=>l.code===code))?<Button type="button" variant="outline" onClick={()=>onChange({...value,adjustments:Object.fromEntries(Object.entries(value.adjustments).filter(([code])=>lines.some(l=>l.code===code)))})}>Remove adjustments for unselected components</Button>:null}
    <div className="grid sm:grid-cols-2 gap-3">
      <div><Label htmlFor="addition-invoice">Invoice schedule</Label><select id="addition-invoice" className="w-full h-10 border rounded px-2 bg-background" value={payment.invoice} onChange={e=>onChange({...value,payment:{...payment,invoice:e.target.value as typeof payment.invoice,awardPercent:e.target.value==="award"?100:50}})}><option value="">Choose agreed schedule</option><option value="award">100% on award</option><option value="split">Award + installation</option></select></div>
      <div><Label htmlFor="addition-award-due">Award invoice due (days)</Label><Input id="addition-award-due" type="number" min={0} max={365} value={payment.awardDueDays} onChange={e=>paymentField("awardDueDays",Number(e.target.value))}/></div>
      {payment.invoice==="split"?<><div><Label htmlFor="addition-award-percent">Invoiced on award (%)</Label><Input id="addition-award-percent" type="number" min={0.01} max={99.99} step="0.01" value={payment.awardPercent} onChange={e=>paymentField("awardPercent",Number(e.target.value))}/></div><div><Label htmlFor="addition-installation-due">Installation invoice due (days)</Label><Input id="addition-installation-due" type="number" min={0} max={365} value={payment.installationDueDays} onChange={e=>paymentField("installationDueDays",Number(e.target.value))}/></div></>:null}
      <div><Label htmlFor="addition-activation-condition">Activation condition</Label><select id="addition-activation-condition" className="w-full h-10 border rounded px-2 bg-background" value={payment.activation} onChange={e=>paymentField("activation",e.target.value as typeof payment.activation)}><option value="">Choose agreed condition</option><option value="full_payment">Full payment received</option><option value="award_payment">Award invoice payment received</option>{isHQ||payment.activation==="on_award"?<option value="on_award">On adjudication — HQ credit authorization</option>:null}</select></div>
      <div><Label htmlFor="addition-payment-agreement">Payment / activation agreement reference</Label><Input id="addition-payment-agreement" value={payment.reference} onChange={e=>paymentField("reference",e.target.value)}/></div>
    </div>
  </section>;
}
