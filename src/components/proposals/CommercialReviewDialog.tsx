import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { toast } from "sonner";
import { ProposalLeaveGuard } from "./ProposalLeaveGuard";
import { readPreparation, type PreparationDraft } from "@/lib/proposal-preparation";
import type { CommercialContext } from "./CreateProposalDialog";
import type { Proposal } from "@/types/proposal";
import type { ProposalSource } from "@/lib/proposal-source";

/** A review request has no issuable document or financial values. */
export function CommercialReviewDialog({open,onOpenChange,commercialContext,editingProposal,proposalSource,canManageClient,readOnly=false}: {
  open:boolean; onOpenChange:(open:boolean)=>void; commercialContext?:CommercialContext|null;
  editingProposal?:Proposal|null; proposalSource?:ProposalSource|null; canManageClient?:boolean; readOnly?:boolean;
}) {
  const qc=useQueryClient(), {canEdit}=useModuleAccess();
  const initial=readPreparation(editingProposal);
  const [working,setWorking]=useState<PreparationDraft|null>(initial);
  const request=(initial?.body.request||{}) as {mode?:string; current?:CommercialContext["existingCustomer"]; target?:string};
  const mode=request.mode||commercialContext?.mode||"other", current=request.current||commercialContext?.existingCustomer;
  const [target,setTarget]=useState(request.target||"");
  const [notes,setNotes]=useState(String(initial?.body.notes||""));
  const [busy,setBusy]=useState(false), [leave,setLeave]=useState(false);
  const fingerprint=JSON.stringify({target,notes}), [committed,setCommitted]=useState(fingerprint);
  const dirty=fingerprint!==committed, canManage=canManageClient??(!readOnly&&canEdit("clients"));
  const label=mode==="upgrade_license"?"License upgrade":mode==="change_hosting"?"Hosting change":"Commercial / services request";
  const close=(value:boolean)=>{if(!value&&dirty)setLeave(true);else onOpenChange(value);};
  const save=async()=>{
    if(!canManage||busy||proposalSource?.source_type!=="client")return false;
    setBusy(true);
    try {
      const {data,error}=await supabase.rpc("save_proposal_preparation" as never,{
        _id:working?.id||null,_expected_updated_at:working?.updated_at||null,
        _client_id:proposalSource.client_id,_contract_id:proposalSource.contract_id,_license_id:proposalSource.license_id,
        _kind:"request",_body:{request:{mode,current,target},notes},_proposal_id:null,_proposal_updated_at:null,
      } as never);
      if(error)throw error;
      setWorking(data as unknown as PreparationDraft);setCommitted(fingerprint);
      await qc.invalidateQueries({queryKey:["proposal-preparations"]});
      toast.success("Review request saved. No commercial proposal, ARR or license change was created.");return true;
    }catch(error){toast.error(error instanceof Error?error.message:"Could not save the review request.");return false;}
    finally{setBusy(false);}
  };
  return <><Dialog open={open} onOpenChange={close}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{label} — review required</DialogTitle></DialogHeader>
    <p className="text-sm">{current?.clientName||editingProposal?.client_name}</p>
    <div className="rounded-lg border p-4 text-sm space-y-2"><p className="font-semibold">Existing configuration is preserved</p><p>{current?.licenseFamily} {current?.licenseVariant} · {current?.deployment}</p><p>{current?.backofficeUsers??"—"} BackOffice · {current?.webUsers??"—"} WEB · Renewal {current?.renewalDate||"not recorded"}</p></div>
    <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 text-amber-950 p-4 text-sm">{mode==="other"?"Record the exact scope and services requested. A new full license and implementation are not added automatically. Pricing and service terms require review before issue.":"The transition price, any unused-period credit, proportional charge and required services must be reviewed before issue. This request cannot generate a new-license quotation or change the existing configuration."}</p>
    <fieldset disabled={!canManage||busy} className="space-y-4"><div><Label htmlFor="commercial-request-target">Requested change / services</Label><Input id="commercial-request-target" value={target} onChange={e=>setTarget(e.target.value)} placeholder="Describe the intended configuration or service"/></div><div><Label htmlFor="commercial-request-notes">Scope, agreed conditions & questions to resolve</Label><Textarea id="commercial-request-notes" rows={5} value={notes} onChange={e=>setNotes(e.target.value)}/></div></fieldset>
    <p className="text-xs text-muted-foreground">Preparation only. No quote is issued and no ARR, contract or license is changed.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>close(false)}>Close</Button><Button disabled={!canManage||busy} onClick={save}>{busy?"Saving…":"Save review request"}</Button></div>
  </DialogContent></Dialog><ProposalLeaveGuard open={leave} dirty={dirty} busy={busy} onKeep={()=>setLeave(false)} onDiscard={()=>{setLeave(false);onOpenChange(false);}} onSave={canManage?async()=>{if(await save()){setLeave(false);onOpenChange(false);}}:undefined}/></>;
}
