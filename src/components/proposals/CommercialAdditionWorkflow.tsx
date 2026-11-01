import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { workflowErrorMessages } from "@/lib/proposal-workflow";
import { additionOperations, additionOperationLabels, type AdditionOperation } from "@/lib/commercial-addition-workflow";
import type { Proposal } from "@/types/proposal";
import { readAdditionDraft } from "@/lib/commercial-additions";
import { proposalIdentity } from "@/lib/commercial-proposal-journey";
import { AdditionReviewSummary } from "./AdditionReviewSummary";
import { ProposalNextAction } from "./ProposalNextAction";

interface Fulfillment { activated_at: string | null; accepted_at: string; annual_before: number; annual_increase: number; annual_after: number; payment_reference: string | null }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
export function CommercialAdditionWorkflow({ proposal, canManage, savedCurrent, onUpdated }: { proposal: Proposal; canManage: boolean; savedCurrent: boolean; onUpdated: (p: Proposal) => void }) {
  const { isHQ } = useAuth();
  const addition = readAdditionDraft(proposal), condition = addition?.selection.commercial?.payment.activation;
  const authorizationOnly = !!addition?.selection.commercial && (condition === "on_award" || addition.quote.dueNow === 0);
  const qc = useQueryClient();
  const [operation, setOperation] = useState<AdditionOperation | null>(null);
  const [date, setDate] = useState(today);
  const [evidence, setEvidence] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [secondaryActions,setSecondaryActions]=useState(false);
  const [recipient,setRecipient]=useState(""),[channel,setChannel]=useState("email"),[acceptedDocument,setAcceptedDocument]=useState(false);
  const fulfillment = useQuery({
    queryKey: ["commercial-addition-fulfillment", proposal.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("commercial_addition_fulfillments" as never).select("accepted_at,activated_at,annual_before,annual_increase,annual_after,payment_reference").eq("proposal_id",proposal.id).maybeSingle();
      if (error) throw error;
      return data as Fulfillment | null;
    },
  });
  const actions = additionOperations(proposal.status, !!fulfillment.data?.activated_at);
  const events = useQuery({ queryKey: ["commercial-addition-events",proposal.id], queryFn: async () => {
    const { data,error } = await supabase.from("proposal_status_events").select("id,action,from_status,to_status,created_at,details").eq("proposal_id",proposal.id).order("created_at",{ascending:false}).limit(20);
    if(error) throw error; return data || [];
  } });
  const canProceed = canManage && savedCurrent && !busy && !fulfillment.isLoading && !fulfillment.isError;
  const execute = async (action: AdditionOperation) => {
    if (!canProceed) return;
    setBusy(true);
    try {
      const auditNote=action==="sent"?`Document: ${proposalIdentity(proposal)}\nRecipient: ${recipient}\nChannel: ${channel}\n${note}`:action==="accept"?`${note}\nAccepted document: ${proposalIdentity(proposal)} (${proposal.id}). ${addition?.selection.implementationReview==="separate"?"Software only; services quotation and acceptance are separate.":"No services included."}`:note;
      const { error } = await supabase.rpc("commercial_addition_action" as never, { _proposal_id: proposal.id, _action: action, _details: { date, evidence_type: evidence, reference, note:auditNote, payment_confirmed: !authorizationOnly && payment, activation_authorized: authorizationOnly && payment } } as never);
      if (error) throw error;
      const { data: updated, error: readError } = await supabase.from("proposals").select("*").eq("id",proposal.id).single();
      if (readError) throw readError;
      onUpdated(updated as unknown as Proposal);
      await Promise.all(["proposals","proposal","commercial-addition-fulfillment","commercial-addition-events","licenses","licensed_modules","contracts","contract-lines","clients","client","client-aggregates","renewals","renewal_baseline","client-commercial-intelligence","commercial-intelligence-summary","analytics","dashboard","lifecycle-events"].map(key => qc.invalidateQueries({ queryKey: [key] })));
      setOperation(null); setReference(""); setNote(""); setPayment(false); setEvidence("");
      toast.success(action === "accept" ? "Adjudicated. ARR updated once; activation follows the saved agreement." : action === "activate" ? "Awarded additions activated. ARR was not charged again." : "Proposal workflow updated.");
    } catch (error) { toast.error(workflowErrorMessages(error).join(" · ")); }
    finally { setBusy(false); }
  };
  const formValid = operation === "sent" ? !!date && !!recipient.trim() : operation === "accept" ? acceptedDocument && !!date && !!evidence && (evidence === "internal_note" ? isHQ && !!note.trim() : !!reference.trim())
    : operation === "activate" ? payment && !!reference.trim() : !!note.trim();
  const choose = (action: AdditionOperation) => { setOperation(action); setEvidence(""); setReference(""); setNote(""); setPayment(false);setAcceptedDocument(false);setRecipient(""); setDate(today()); };
  return <section aria-label="Addition proposal workflow" className="border rounded-lg p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Proposal follow-up</h3><strong>{proposal.status === "Lost" ? "Rejected" : proposal.status === "Accepted" ? "Adjudicated" : proposal.status}{fulfillment.data?.activated_at ? " · License updated" : proposal.status === "Accepted" ? " · Activation pending" : ""}</strong></div>
    <p className="text-sm text-muted-foreground">Draft → Ready → Sent → Adjudicated → License activated. Draft, Ready, Sent and Rejected do not change ARR or licenses. Adjudication records the annual contractual increase once; activation follows the conditions saved in the adjudicated proposal.</p>
    {fulfillment.data ? <p className="text-sm">Adjudicated annual increase: €{Number(fulfillment.data.annual_increase).toFixed(2)} · Annual total: €{Number(fulfillment.data.annual_after).toFixed(2)}{fulfillment.data.activated_at ? ` · Activated ${fulfillment.data.activated_at.slice(0,10)} · Payment reference: ${fulfillment.data.payment_reference}` : " · Current license remains unchanged until activation."}</p> : null}
    {fulfillment.isError ? <p role="alert">Workflow history could not be loaded. Actions remain blocked; reload before proceeding.</p> : null}
    {!savedCurrent ? <p role="status">This document has unsaved edits or incomplete preparation. Open Edit draft to review the specific tasks, then save before validation.</p> : null}
    <p className="text-sm font-medium">{proposal.status==="Draft"?"Next: validate the saved proposal before sending.":proposal.status==="Ready"?"Next: download and send externally, then record the actual send.":proposal.status==="Sent"?"Next: record the customer's decision with evidence.":proposal.status==="Accepted"&&!fulfillment.data?.activated_at?"Next: activate only when the saved payment / authorization conditions are met.":"No further commercial action is pending."}</p>
    {canManage ? <div className="flex flex-wrap gap-2">{actions.filter(action=>action!=="revise"&&(secondaryActions||action!=="reject")).map(action => <Button key={action} type="button" variant={action === "reject" ? "outline" : "secondary"} disabled={!canProceed} onClick={() => action === "validate" ? execute(action) : choose(action)}>{additionOperationLabels[action]}</Button>)}{actions.includes("reject")?<Button type="button" variant="ghost" onClick={()=>setSecondaryActions(value=>!value)}>{secondaryActions?"Hide other actions":"Other actions"}</Button>:null}</div> : null}
    {canManage&&["Ready","Sent"].includes(proposal.status)?<ProposalNextAction proposal={proposal}/>:null}
    {events.data?.find(e=>e.action==="sent")?<details className="rounded border p-3 text-sm"><summary className="cursor-pointer">Recorded send · recipient and channel</summary><p className="whitespace-pre-wrap mt-2">{String((events.data.find(e=>e.action==="sent")?.details as {note?:string}|null)?.note||"Legacy send record; recipient and channel were not recorded.")}</p></details>:null}
    {operation ? <form aria-label={additionOperationLabels[operation]} className="border-t pt-3 space-y-3" onSubmit={e => { e.preventDefault(); execute(operation); }}>
      <h4 className="font-semibold">{additionOperationLabels[operation]}</h4>
      {operation === "sent" ? <p className="text-sm">Record an actual external send. This action does not email the proposal.</p> : operation === "accept" ? <p className="text-sm">Confirm the customer's adjudication and its evidence. This commits the annual increase to ARR and the next contract renewal; access activation remains a separate action.</p> : operation === "activate" ? <p className="text-sm">Apply only the accesses/components in this adjudicated proposal. {authorizationOnly ? "The saved agreement permits activation without advance payment; confirm its authorization." : condition === "award_payment" ? "Confirm the award invoice payment has been received." : "Confirm the required full payment has been received."} This does not add ARR again.</p> : null}
      {operation === "sent" || operation === "accept" ? <div><Label htmlFor="addition-workflow-date">{operation === "sent" ? "Date sent" : "Adjudication date"}</Label><Input id="addition-workflow-date" type="date" max={today()} value={date} onChange={e=>setDate(e.target.value)} required /></div> : null}
      {operation==="sent"?<div className="grid sm:grid-cols-2 gap-3"><div><Label htmlFor="addition-send-recipient">Sent to (name / email)</Label><Input id="addition-send-recipient" required value={recipient} onChange={e=>setRecipient(e.target.value)}/></div><div><Label htmlFor="addition-send-channel">Send channel</Label><select id="addition-send-channel" className="w-full h-10 border rounded px-2 bg-background" value={channel} onChange={e=>setChannel(e.target.value)}><option value="email">Email</option><option value="meeting">Meeting</option><option value="portal">Customer portal</option><option value="other">Other</option></select></div><p className="sm:col-span-2 text-sm">Document sent: {proposalIdentity(proposal)}. Recording this does not send a message.</p></div>:null}
      {operation==="accept"?<>{addition?<AdditionReviewSummary draft={addition} terms={proposal.payment_terms||""}/>:null}<label className="flex gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={acceptedDocument} onChange={e=>setAcceptedDocument(e.target.checked)}/>I checked the accepted document: {proposalIdentity(proposal)}. The scope and amounts above match the customer’s evidence, including any separate services exclusion.</label></>:null}
      {operation === "accept" ? <div><Label htmlFor="addition-evidence">Adjudication evidence</Label><select id="addition-evidence" className="w-full h-10 rounded border bg-background px-2" value={evidence} onChange={e=>setEvidence(e.target.value)} required><option value="">Choose evidence</option><option value="purchase_order">Purchase order</option><option value="signed_proposal">Signed proposal</option><option value="acceptance_email">Acceptance email</option>{isHQ ? <option value="internal_note">HQ documented exception</option> : null}</select></div> : null}
      {operation === "accept" || operation === "activate" ? <div><Label htmlFor="addition-workflow-reference">{operation === "activate" ? authorizationOnly ? "Activation authorization reference" : "Payment / receipt reference" : "PO number, signed document or email reference"}</Label><Input id="addition-workflow-reference" value={reference} onChange={e=>setReference(e.target.value)} required={evidence !== "internal_note"} /></div> : null}
      {operation === "activate" ? <label className="flex gap-2 text-sm"><input type="checkbox" checked={payment} onChange={e=>setPayment(e.target.checked)} />{authorizationOnly ? "Activation is authorized under the saved agreement; no advance payment is being declared." : condition === "award_payment" ? "The award invoice payment has been received and activation is authorized." : "The required payment has been received and activation is authorized under the agreed terms."}</label> : null}
      <div><Label htmlFor="addition-workflow-note">{operation === "reject" || operation === "revise" ? "Reason (required)" : "Notes"}</Label><Textarea id="addition-workflow-note" value={note} onChange={e=>setNote(e.target.value)} /></div>
      <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>setOperation(null)}>Cancel</Button><Button type="submit" disabled={!canProceed || !formValid}>{busy ? "Applying…" : `Confirm ${additionOperationLabels[operation]}`}</Button></div>
    </form> : null}
    {events.isError ? <p role="alert">The audit history could not be loaded.</p> : events.data?.length ? <details><summary className="cursor-pointer text-sm font-medium">Workflow history</summary><ul className="text-xs text-muted-foreground mt-2 space-y-1">{events.data.map(event=><li key={event.id}>{new Date(event.created_at).toLocaleString("en-GB")} · {event.action.replace(/_/g," ")} · {event.from_status || "New"} → {event.to_status}</li>)}</ul></details> : null}
  </section>;
}
