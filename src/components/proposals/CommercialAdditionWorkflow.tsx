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

interface Fulfillment { activated_at: string | null; accepted_at: string; annual_before: number; annual_increase: number; annual_after: number; payment_reference: string | null }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
export function CommercialAdditionWorkflow({ proposal, canManage, savedCurrent, onUpdated }: { proposal: Proposal; canManage: boolean; savedCurrent: boolean; onUpdated: (p: Proposal) => void }) {
  const { isHQ } = useAuth();
  const qc = useQueryClient();
  const [operation, setOperation] = useState<AdditionOperation | null>(null);
  const [date, setDate] = useState(today);
  const [evidence, setEvidence] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState(false);
  const [busy, setBusy] = useState(false);
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
    const { data,error } = await supabase.from("proposal_status_events").select("id,action,from_status,to_status,created_at").eq("proposal_id",proposal.id).order("created_at",{ascending:false}).limit(20);
    if(error) throw error; return data || [];
  } });
  const canProceed = canManage && savedCurrent && !busy && !fulfillment.isLoading && !fulfillment.isError;
  const execute = async (action: AdditionOperation) => {
    if (!canProceed) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("commercial_addition_action" as never, { _proposal_id: proposal.id, _action: action, _details: { date, evidence_type: evidence, reference, note, payment_confirmed: payment } } as never);
      if (error) throw error;
      const { data: updated, error: readError } = await supabase.from("proposals").select("*").eq("id",proposal.id).single();
      if (readError) throw readError;
      onUpdated(updated as unknown as Proposal);
      await Promise.all(["proposals","proposal","commercial-addition-fulfillment","commercial-addition-events","licenses","licensed_modules","contracts","contract-lines","clients","client","client-aggregates","renewals","renewal_baseline","client-commercial-intelligence","commercial-intelligence-summary","analytics","dashboard","lifecycle-events"].map(key => qc.invalidateQueries({ queryKey: [key] })));
      setOperation(null); setReference(""); setNote(""); setPayment(false); setEvidence("");
      toast.success(action === "accept" ? "Adjudicated. ARR updated once; license activation is pending payment confirmation." : action === "activate" ? "Awarded additions activated. ARR was not charged again." : "Proposal workflow updated.");
    } catch (error) { toast.error(workflowErrorMessages(error).join(" · ")); }
    finally { setBusy(false); }
  };
  const formValid = operation === "sent" ? !!date : operation === "accept" ? !!date && !!evidence && (evidence === "internal_note" ? isHQ && !!note.trim() : !!reference.trim())
    : operation === "activate" ? payment && !!reference.trim() : !!note.trim();
  const choose = (action: AdditionOperation) => { setOperation(action); setEvidence(""); setReference(""); setNote(""); setPayment(false); setDate(today()); };
  return <section aria-label="Addition proposal workflow" className="border rounded-lg p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Proposal follow-up</h3><strong>{proposal.status === "Lost" ? "Rejected" : proposal.status === "Accepted" ? "Adjudicated" : proposal.status}{fulfillment.data?.activated_at ? " · License updated" : proposal.status === "Accepted" ? " · Activation pending" : ""}</strong></div>
    <p className="text-sm text-muted-foreground">Draft → Ready → Sent → Adjudicated → License activated. Draft, Ready, Sent and Rejected do not change ARR or licenses. Adjudication records the annual increase once; activation applies only the awarded entitlements after the required payment is confirmed.</p>
    {fulfillment.data ? <p className="text-sm">Adjudicated annual increase: €{Number(fulfillment.data.annual_increase).toFixed(2)} · Annual total: €{Number(fulfillment.data.annual_after).toFixed(2)}{fulfillment.data.activated_at ? ` · Activated ${fulfillment.data.activated_at.slice(0,10)} · Payment reference: ${fulfillment.data.payment_reference}` : " · Current license remains unchanged until activation."}</p> : null}
    {fulfillment.isError ? <p role="alert">Workflow history could not be loaded. Actions remain blocked; reload before proceeding.</p> : null}
    {!savedCurrent ? <p role="status">Save the current draft before performing a workflow action.</p> : null}
    {canManage ? <div className="flex flex-wrap gap-2">{actions.map(action => <Button key={action} type="button" variant={action === "reject" ? "outline" : "secondary"} disabled={!canProceed} onClick={() => action === "validate" ? execute(action) : choose(action)}>{additionOperationLabels[action]}</Button>)}</div> : null}
    {operation ? <form aria-label={additionOperationLabels[operation]} className="border-t pt-3 space-y-3" onSubmit={e => { e.preventDefault(); execute(operation); }}>
      <h4 className="font-semibold">{additionOperationLabels[operation]}</h4>
      {operation === "sent" ? <p className="text-sm">Record an actual external send. This action does not email the proposal.</p> : operation === "accept" ? <p className="text-sm">Confirm the customer's adjudication and its evidence. This commits the annual increase to ARR and the next contract renewal; access activation remains a separate action.</p> : operation === "activate" ? <p className="text-sm">Apply only the accesses/components in this adjudicated proposal. Confirm the required payment has been received. This does not add ARR again.</p> : null}
      {operation === "sent" || operation === "accept" ? <div><Label htmlFor="addition-workflow-date">{operation === "sent" ? "Date sent" : "Adjudication date"}</Label><Input id="addition-workflow-date" type="date" max={today()} value={date} onChange={e=>setDate(e.target.value)} required /></div> : null}
      {operation === "accept" ? <div><Label htmlFor="addition-evidence">Adjudication evidence</Label><select id="addition-evidence" className="w-full h-10 rounded border bg-background px-2" value={evidence} onChange={e=>setEvidence(e.target.value)} required><option value="">Choose evidence</option><option value="purchase_order">Purchase order</option><option value="signed_proposal">Signed proposal</option><option value="acceptance_email">Acceptance email</option>{isHQ ? <option value="internal_note">HQ documented exception</option> : null}</select></div> : null}
      {operation === "accept" || operation === "activate" ? <div><Label htmlFor="addition-workflow-reference">{operation === "activate" ? "Payment / receipt reference" : "PO number, signed document or email reference"}</Label><Input id="addition-workflow-reference" value={reference} onChange={e=>setReference(e.target.value)} required={evidence !== "internal_note"} /></div> : null}
      {operation === "activate" ? <label className="flex gap-2 text-sm"><input type="checkbox" checked={payment} onChange={e=>setPayment(e.target.checked)} />The required payment has been received and activation is authorized under the agreed terms.</label> : null}
      <div><Label htmlFor="addition-workflow-note">{operation === "reject" || operation === "revise" ? "Reason (required)" : "Notes"}</Label><Textarea id="addition-workflow-note" value={note} onChange={e=>setNote(e.target.value)} /></div>
      <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>setOperation(null)}>Cancel</Button><Button type="submit" disabled={!canProceed || !formValid}>{busy ? "Applying…" : `Confirm ${additionOperationLabels[operation]}`}</Button></div>
    </form> : null}
    {events.isError ? <p role="alert">The audit history could not be loaded.</p> : events.data?.length ? <details><summary className="cursor-pointer text-sm font-medium">Workflow history</summary><ul className="text-xs text-muted-foreground mt-2 space-y-1">{events.data.map(event=><li key={event.id}>{new Date(event.created_at).toLocaleString("en-GB")} · {event.action.replace(/_/g," ")} · {event.from_status || "New"} → {event.to_status}</li>)}</ul></details> : null}
  </section>;
}
