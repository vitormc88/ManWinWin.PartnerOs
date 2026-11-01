import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdditionBaseline } from "@/lib/commercial-additions";
import { newServiceReview, serviceReviewErrors, serviceReference, type ServiceReview } from "@/lib/commercial-proposal-journey";
import type { PreparationDraft } from "@/lib/proposal-preparation";

export function LinkedServicesReview({baseline,value,onChange,onDirtyChange,onVerifiedChange,proposalId,readOnly=false}:{baseline:AdditionBaseline;value?:ServiceReview;onChange?:(v:ServiceReview)=>void;onDirtyChange?:(dirty:boolean)=>void;onVerifiedChange?:(verified:boolean)=>void;proposalId?:string;readOnly?:boolean}) {
  const [form,setForm]=useState(value||newServiceReview),[row,setRow]=useState<PreparationDraft|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  const qc=useQueryClient();
  useEffect(()=>{onVerifiedChange?.(false);if(!value?.id)return;let alive=true;setFailed(false);
    void (async()=>{try{const {data,error}=await supabase.from("proposal_preparations" as never).select("*").eq("id",value.id!).single();if(error)throw error;const record=data as unknown as PreparationDraft;if(!record||record.kind!=="request"||record.client_id!==baseline.clientId||record.license_id!==baseline.licenseId||record.contract_id!==baseline.contractId||!record.body.services)throw new Error("Invalid services link");if(alive){setRow(record);onVerifiedChange?.(true);}}catch{if(alive){setFailed(true);onVerifiedChange?.(false);}}})();
    return()=>{alive=false;};
  },[value?.id,baseline.clientId,baseline.licenseId,baseline.contractId,onVerifiedChange]);
  const change=<K extends keyof ServiceReview>(key:K,v:ServiceReview[K])=>setForm(s=>({...s,[key]:v}));
  const errors=serviceReviewErrors(form), changed=JSON.stringify(form)!==JSON.stringify(value||newServiceReview());
  useEffect(()=>{onDirtyChange?.(changed);return()=>onDirtyChange?.(false);},[changed,onDirtyChange]);
  const save=async()=>{
    if(readOnly||errors.length||busy||failed||(value?.id&&!row))return;setBusy(true);
    try {
      const {data,error}=await supabase.rpc("save_proposal_preparation" as never,{_id:row?.id||null,_expected_updated_at:row?.updated_at||null,
        _client_id:baseline.clientId,_license_id:baseline.licenseId,_contract_id:baseline.contractId,_kind:"request",_proposal_id:null,_proposal_updated_at:null,
        _body:{request:{mode:"other",target:`Services budget — ${form.modality} — ${form.scope}`,serviceBaseline:baseline,linkedProposalId:proposalId||null},services:form,notes:`Owner: ${form.owner} · ${form.status} · Next review: ${form.nextDate}\n${form.scope}\nRequested discount: ${form.requestedDiscount}% (not approved)\n${form.expenses}\nQuote: ${form.quoteReference}`}} as never);
      if(error)throw error;const saved=data as unknown as PreparationDraft;
      const linked={...form,id:saved.id,updatedAt:saved.updated_at};setRow(saved);setForm(linked);onChange?.(linked);
      await qc.invalidateQueries({queryKey:["proposal-preparations"]});toast.success("Services budget request saved and linked. Save the software preparation to retain this link. Services are not priced or adjudicated here.");
    }catch(error){toast.error(error instanceof Error?error.message:"Unable to save the services request. Your entered scope is retained.");}finally{setBusy(false);}
  };
  return <section id="addition-services" tabIndex={-1} className="rounded-lg border p-4 space-y-3" aria-label="Linked services budget">
    <h4 className="font-semibold">Services budget · separate from software</h4>
    <p className="text-sm text-muted-foreground">Online / onsite training is quoted separately while the service pricing rules are reviewed. Discounts below are requests, not approved prices. Services and expenses do not enter this software total or ARR.</p>
    {value?.id?<p className="text-xs">Linked request: {serviceReference(value.id)} · {value.status} · Owner: {value.owner}</p>:null}
    {failed?<p role="alert">The linked request could not be loaded. Reopen before editing; no new duplicate request will be created.</p>:null}
    <fieldset disabled={readOnly||busy} className="grid sm:grid-cols-2 gap-3">
      <div><Label htmlFor="services-owner">Services budget owner</Label><Input id="services-owner" value={form.owner} onChange={e=>change("owner",e.target.value)}/></div>
      <div><Label htmlFor="services-modality">Training delivery</Label><select id="services-modality" className="w-full h-10 border rounded bg-background px-2" value={form.modality} onChange={e=>change("modality",e.target.value as ServiceReview["modality"])}><option value="online">Online</option><option value="onsite">Onsite</option><option value="compare">Compare online / onsite</option></select></div>
      <div><Label htmlFor="services-quantity">Service quantity</Label><Input id="services-quantity" type="number" min={0.25} max={1000} step={0.25} value={form.quantity} onChange={e=>change("quantity",Number(e.target.value))}/></div>
      <div><Label htmlFor="services-unit">Service unit</Label><select id="services-unit" className="w-full h-10 border rounded bg-background px-2" value={form.unit} onChange={e=>change("unit",e.target.value as ServiceReview["unit"])}><option value="days">Days</option><option value="hours">Hours</option></select></div>
      <div><Label htmlFor="services-discount">Requested services discount (%)</Label><Input id="services-discount" type="number" min={0} max={100} step={0.01} value={form.requestedDiscount} onChange={e=>change("requestedDiscount",Number(e.target.value))}/></div>
      <div><Label htmlFor="services-status">Services budget status</Label><select id="services-status" className="w-full h-10 border rounded bg-background px-2" value={form.status} onChange={e=>change("status",e.target.value as ServiceReview["status"])}><option value="requested">Requested</option><option value="in_review">In review</option><option value="quoted">Separately quoted</option><option value="cancelled">Cancelled</option></select></div>
      <div className="sm:col-span-2"><Label htmlFor="services-scope">Training / implementation scope</Label><Textarea id="services-scope" value={form.scope} onChange={e=>change("scope",e.target.value)}/></div>
      <div className="sm:col-span-2"><Label htmlFor="services-expenses">Travel / accommodation conditions</Label><Input id="services-expenses" value={form.expenses} onChange={e=>change("expenses",e.target.value)} placeholder="Separate travel estimate, included, or not applicable"/></div>
      <div><Label htmlFor="services-reference">Separate services quotation reference</Label><Input id="services-reference" value={form.quoteReference} onChange={e=>change("quoteReference",e.target.value)}/></div>
      <div><Label htmlFor="services-next-date">Next services review date</Label><Input id="services-next-date" type="date" value={form.nextDate} onChange={e=>change("nextDate",e.target.value)}/></div>
    </fieldset>
    {!readOnly?<><ul className="text-sm text-amber-900">{errors.map(error=><li key={error}>{error}</li>)}</ul><Button type="button" variant="outline" disabled={busy||!!errors.length||failed||!!value?.id&&!row} onClick={save}>{busy?"Saving services request…":value?.id?"Save linked services review":"Create linked services request"}</Button>{changed?<p role="status" className="text-sm text-amber-900">Save this services request before leaving or saving the software proposal.</p>:null}</>:null}
  </section>;
}
