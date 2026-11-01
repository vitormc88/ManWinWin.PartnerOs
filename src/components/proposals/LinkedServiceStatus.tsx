import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {supabase} from "@/integrations/supabase/client";
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {LinkedServicesReview} from "./LinkedServicesReview";
import {ProposalLeaveGuard} from "./ProposalLeaveGuard";
import type {ServiceReview} from "@/lib/commercial-proposal-journey";
import type {AdditionBaseline} from "@/lib/commercial-additions";
export function LinkedServiceStatus({id,baseline,proposalId,canManage}:{id:string;baseline:AdditionBaseline;proposalId:string;canManage:boolean}) {
 const [open,setOpen]=useState(false),[dirty,setDirty]=useState(false),[leave,setLeave]=useState(false);const qc=useQueryClient();
 const q=useQuery({queryKey:["proposal-preparations","services",id],queryFn:async()=>{const {data,error}=await supabase.from("proposal_preparations" as never).select("*").eq("id",id).single();if(error)throw error;return data as unknown as {id:string;updated_at:string;body:{services:ServiceReview}};}});
 const value=q.data?.body.services?{...q.data.body.services,id,updatedAt:q.data.updated_at}:undefined;
 const close=(v:boolean)=>{if(!v&&dirty)setLeave(true);else setOpen(v);};
 return <section className="rounded-lg border p-3 text-sm space-y-2" aria-label="Current services budget status"><p className="font-medium">Linked services budget · live review status</p>{q.isLoading?<p>Loading services review…</p>:q.isError||!value?<p role="alert">Services status could not be loaded. Refresh before proceeding with the overall sale.</p>:<><p>{value.status} · Owner: {value.owner} · Next review: {value.nextDate}</p><p>{value.quoteReference?`Separate quotation: ${value.quoteReference}`:"Services quotation is pending; software totals exclude it."}</p><p className="text-xs text-muted-foreground">Changes here update the linked request, not the saved software document or ARR.</p><Button type="button" variant="outline" onClick={()=>setOpen(true)}>Open linked services budget</Button></>}
 <Dialog open={open} onOpenChange={close}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Services budget — {baseline.clientName}</DialogTitle></DialogHeader>{value?<LinkedServicesReview key={value.updatedAt} baseline={baseline} value={value} proposalId={proposalId} readOnly={!canManage} onDirtyChange={setDirty} onChange={()=>{setDirty(false);void qc.invalidateQueries({queryKey:["proposal-preparations"]});}}/>:null}<Button type="button" variant="outline" onClick={()=>close(false)}>Close services budget</Button></DialogContent></Dialog>
 <ProposalLeaveGuard open={leave} dirty={dirty} onKeep={()=>setLeave(false)} onDiscard={()=>{setLeave(false);setDirty(false);setOpen(false);}}/>
 </section>;
}
