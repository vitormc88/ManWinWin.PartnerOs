import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, FileCheck2, FileWarning, GraduationCap, LockKeyhole, Rocket, ShieldCheck, Target } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { PartnerConversionPanel } from "@/components/partner-growth/PartnerConversionPanel";
import { firstValueTaskIssue } from "@/lib/partner-activation-task";
import { useProspectContacts, useProspectTasks, useCreateProspectTask, type PartnerProspect } from "@/hooks/usePartnerGrowth";
import {
  useActivationPlan, useApproveActivationHandoff, useApproveLegalReview, useCapabilityPlans,
  useSaveActivationPlan, useSaveCapabilityPlan,
  type ActivationInput, type Pathway, type PreparationStatus,
} from "@/hooks/usePartnerActivation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const initial: ActivationInput = {
  target_model: null, hq_activation_owner: null, kickoff_objective: "",
  first_value_milestone: "", enablement_plan: "", commercial_handoff_notes: "",
  legal_review_reference: null,
};
const roleNames: Record<string,string> = {
  CMSC: "Strategic Connector", CMAR: "Reseller / Commercial Capability",
  CMAI: "Implementer / Technical Capability", "Strategic Alliance": "Strategic Alliance",
};
const readiness: { id: PreparationStatus; name: string }[] = [
  { id: "not_started", name: "Not started" }, { id: "planned", name: "Enablement planned" },
  { id: "learning", name: "Learning / orientation" }, { id: "assessment_needed", name: "Needs HQ assessment" },
];
const roles: { pathway: Pathway; label: string; intent: string }[] = [
  { pathway: "CMSC", label: "Strategic Connector", intent: "Referral qualification, lead registration and joint follow-up. Demo accreditation is not required." },
  { pathway: "CMAR", label: "Accredited Reseller", intent: "Commercial enablement and assessed ability to position, demonstrate and sell ManWinWin." },
  { pathway: "CMAI", label: "Accredited Implementer", intent: "Supervised project execution and HQ practical validation before independent implementation." },
];
const err = (error: unknown) => toast.error(error instanceof Error ? error.message : "Operation failed");

export function PartnerActivationReadiness({ prospect, canEdit, isAdmin }: {
  prospect: PartnerProspect; canEdit: boolean; isAdmin: boolean;
}) {
  const { user } = useAuth();
  const { data: plan, isLoading, isError } = useActivationPlan(prospect.id);
  const { data: capabilityPlans = [] } = useCapabilityPlans(prospect.id);
  const { data: contacts = [] } = useProspectContacts(prospect.id);
  const { data: prospectTasks = [], isLoading: tasksLoading } = useProspectTasks(prospect.id);
  const save = useSaveActivationPlan(prospect.id);
  const reviewLegal = useApproveLegalReview(prospect.id);
  const approveHandoff = useApproveActivationHandoff(prospect.id);
  const savePathway = useSaveCapabilityPlan(prospect.id);
  const createTask = useCreateProspectTask(prospect.id);
  const [values, setValues] = useState<ActivationInput>(initial);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [handoffConfirmed, setHandoffConfirmed] = useState(false);
  const [firstValueDueDate, setFirstValueDueDate] = useState("");
  const [pathStates, setPathStates] = useState<Record<Pathway, PreparationStatus>>({
    CMSC: "not_started", CMAR: "not_started", CMAI: "not_started",
  });
  const [pathNotes, setPathNotes] = useState<Record<Pathway,string>>({ CMSC: "", CMAR: "", CMAI: "" });
  useEffect(() => {
    setValues({
      target_model: plan?.target_model ?? prospect.proposed_partner_type,
      hq_activation_owner: plan?.hq_activation_owner ?? null,
      kickoff_objective: plan?.kickoff_objective ?? "",
      first_value_milestone: plan?.first_value_milestone ?? "",
      enablement_plan: plan?.enablement_plan ?? "",
      commercial_handoff_notes: plan?.commercial_handoff_notes ?? "",
      legal_review_reference: plan?.legal_review_reference ?? null,
    });
    setReviewConfirmed(false);
    setHandoffConfirmed(false);
    setFirstValueDueDate("");
  }, [plan, prospect.id, prospect.proposed_partner_type]);
  useEffect(() => {
    const nextStates: Record<Pathway,PreparationStatus> = { CMSC:"not_started",CMAR:"not_started",CMAI:"not_started" };
    const nextNotes: Record<Pathway,string> = { CMSC:"",CMAR:"",CMAI:"" };
    capabilityPlans.forEach(p => { nextStates[p.pathway]=p.preparation_status; nextNotes[p.pathway]=p.readiness_notes; });
    setPathStates(nextStates);
    setPathNotes(nextNotes);
  }, [capabilityPlans]);
  const signed = prospect.recruitment_stage === "Signed"
    && !!prospect.signed_verified_by && !!prospect.signed_verified_at
    && !!prospect.agreement_signed_on && !!prospect.agreement_reference;
  const reviewed = plan?.legal_review_status === "approved";
  const ready = plan?.readiness_status === "ready_for_handoff";
  const planComplete = !!plan && !!plan.target_model && plan.target_model === prospect.proposed_partner_type
    && !!plan.hq_activation_owner && plan.kickoff_objective.trim().length >= 5
    && plan.first_value_milestone.trim().length >= 5;
  const taskIssue = firstValueTaskIssue(values.first_value_milestone, firstValueDueDate, prospectTasks);
  const savePlan = async () => {
    try {
      await save.mutateAsync({ values, exists: !!plan });
      toast.success("Activation planning saved in TEST");
    } catch(e) { err(e); }
  };
  const approveLegal = async () => {
    if (!isAdmin || !reviewConfirmed || !values.legal_review_reference?.trim()) return;
    try {
      if (!plan) { toast.error("Save the activation plan first"); return; }
      await reviewLegal.mutateAsync(values.legal_review_reference.trim());
      toast.success("HQ legal review recorded — no contract was generated or signed");
    } catch(e) { err(e); }
  };
  const approve = async () => {
    if (!isAdmin || !plan || !handoffConfirmed || !signed || !reviewed) return;
    try {
      await approveHandoff.mutateAsync();
      toast.success("Handoff readiness approved; no partner account or rights created");
      setHandoffConfirmed(false);
    } catch(e) { err(e); }
  };
  const saveCapability = async (pathway: Pathway) => {
    try {
      await savePathway.mutateAsync({
        pathway, preparation_status:pathStates[pathway], readiness_notes:pathNotes[pathway],
      });
      toast.success(pathway + " preparation recorded");
    } catch(e) { err(e); }
  };
  const makeTask = async () => {
    if (tasksLoading || taskIssue) {
      toast.error(taskIssue || "Wait for existing tasks to load before creating a new one");
      return;
    }
    try {
      await createTask.mutateAsync({
        title: "Partner activation: " + values.first_value_milestone.trim(),
        due_date: firstValueDueDate,
      });
      toast.success("Dated first-value task added to existing Tasks");
    } catch(e) { err(e); }
  };
  const primaryRole = roles.find(r=>r.pathway===prospect.proposed_partner_type);
  const otherRoles = roles.filter(r=>r.pathway!==prospect.proposed_partner_type);
  const roleEditor = (r: typeof roles[number]) => (
    <div className="rounded-xl border p-3 space-y-2" key={r.pathway}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{r.pathway} — {r.label}</p>
        {prospect.proposed_partner_type===r.pathway && <Badge variant="secondary">Proposed path</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{r.intent}</p>
      <Select disabled={!canEdit} value={pathStates[r.pathway]}
        onValueChange={v=>setPathStates(st=>({...st,[r.pathway]:v as PreparationStatus}))}>
        <SelectTrigger aria-label={r.pathway+" preparation status"}><SelectValue/></SelectTrigger>
        <SelectContent>{readiness.map(st=><SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>)}</SelectContent>
      </Select>
      <Input disabled={!canEdit} value={pathNotes[r.pathway]}
        onChange={e=>setPathNotes(st=>({...st,[r.pathway]:e.target.value}))}
        placeholder="Evidence or next assessment requirement…"/>
      {canEdit && <Button size="sm" variant="outline" disabled={savePathway.isPending}
        onClick={()=>saveCapability(r.pathway)}>Save {r.pathway} preparation</Button>}
    </div>
  );
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading activation planning…</p>;
  if (isError) return <p className="text-sm text-destructive" role="alert">Unable to load activation planning.</p>;
  return <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Rocket className="h-5 w-5"/>Partner Activation Readiness</CardTitle>
        <p className="text-sm text-muted-foreground">
          Prepare the post-signature handoff without granting operational access, certification or additional commercial rights.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm font-medium">{signed?<CheckCircle2 className="h-4 w-4 text-emerald-600"/>:<FileWarning className="h-4 w-4 text-amber-600"/>}Executed agreement</div>
            <p className="mt-2 text-xs text-muted-foreground">{signed?"Signed and HQ-verified in Recruitment":"Missing signed / verified reference in Overview"}</p></div>
          <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm font-medium">{reviewed?<CheckCircle2 className="h-4 w-4 text-emerald-600"/>:<FileWarning className="h-4 w-4 text-amber-600"/>}Legal review</div>
            <p className="mt-2 text-xs text-muted-foreground">{reviewed?"Approved by HQ Admin":"Not approved — draft source is not executable"}</p></div>
          <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm font-medium">{ready?<CheckCircle2 className="h-4 w-4 text-emerald-600"/>:<LockKeyhole className="h-4 w-4 text-muted-foreground"/>}Operational handoff</div>
            <p className="mt-2 text-xs text-muted-foreground">{ready?"HQ approved for a later controlled handoff":"Planning only — no partner created"}</p></div>
        </div>
        {signed && <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p className="font-semibold">Signed agreement reference</p>
          <p className="break-words text-muted-foreground">{prospect.agreement_reference} · {prospect.agreement_signed_on}</p>
          <p className="mt-1 text-xs text-muted-foreground">Reference and HQ verification are recorded in the recruitment record. Original file custody is not automated yet.</p>
        </div>}
        <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-200">
          The available 2026 Partnership & Representation Agreement is a <strong>draft</strong>, not a legally approved template. This screen does not emit an NDA or binding partnership contract, and the signed original must be validated separately.
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-base">Activation blueprint</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1"><Label>Proposed partnership model</Label>
          <p className="text-sm text-muted-foreground">{prospect.proposed_partner_type ? roleNames[prospect.proposed_partner_type] : "No model defined in qualification"}</p>
          <p className="text-xs text-muted-foreground">The activation model must match the qualified model. After Signed, changes require a formal contractual review.</p>
        </div>
        <div className="space-y-1"><Label>HQ activation owner</Label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{values.hq_activation_owner
              ? values.hq_activation_owner === user?.id ? "Assigned to you" : "Assigned to another HQ member"
              : "Not assigned"}</span>
            {canEdit && <Button variant="outline" size="sm" disabled={ready||!user?.id}
              onClick={()=>setValues(v=>({...v,hq_activation_owner:user?.id??null}))}>Assign to me</Button>}
          </div>
        </div>
        <div className="space-y-1"><Label>First kickoff objective</Label>
          <Textarea disabled={!canEdit||ready} rows={2} value={values.kickoff_objective}
            onChange={e=>setValues(v=>({...v,kickoff_objective:e.target.value}))}
            placeholder="e.g. Joint discovery of first industrial maintenance opportunity"/></div>
        <div className="space-y-1"><Label>First commercial value milestone</Label>
          <Input disabled={!canEdit||ready} value={values.first_value_milestone}
            onChange={e=>setValues(v=>({...v,first_value_milestone:e.target.value}))}
            placeholder="e.g. First qualified customer introduction"/></div>
        <div className="space-y-1"><Label>Enablement & Partner Academy plan</Label>
          <Textarea disabled={!canEdit} rows={3} value={values.enablement_plan}
            onChange={e=>setValues(v=>({...v,enablement_plan:e.target.value}))}
            placeholder="Training path and HQ validation needed; Academy enrolment will happen after authorized access"/></div>
        <div className="space-y-1"><Label>Commercial handoff notes</Label>
          <Textarea disabled={!canEdit} rows={2} value={values.commercial_handoff_notes}
            onChange={e=>setValues(v=>({...v,commercial_handoff_notes:e.target.value}))}
            placeholder="Who follows the first lead, demonstrates, quotes and supports the customer?"/></div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button disabled={save.isPending} onClick={savePlan}>Save activation plan</Button>}
        </div>
        {canEdit && <div className="rounded-lg border p-3 space-y-2">
          <Label htmlFor="first-value-task-date">First-value task due date</Label>
          <Input id="first-value-task-date" type="date" value={firstValueDueDate}
            onChange={e=>setFirstValueDueDate(e.target.value)} className="max-w-xs"/>
          <Button variant="outline" disabled={createTask.isPending || tasksLoading || !!taskIssue} onClick={makeTask}>
            <Target className="mr-2 h-4 w-4"/>Create first-value task</Button>
          {taskIssue && <p className="text-xs text-muted-foreground" role="status">{taskIssue}</p>}
        </div>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="h-5 w-5"/>Progressive capability preparation</CardTitle>
        <p className="text-sm text-muted-foreground">These are planning markers, <strong>not</strong> Academy completions, skill certificates or granted rights.</p></CardHeader>
      <CardContent className="space-y-3">
        {primaryRole ? roleEditor(primaryRole) :
          <p className="text-sm text-muted-foreground">This partnership does not currently have a standard CMSC/CMAR/CMAI pathway. A Strategic Alliance requires a separately approved plan.</p>}
        <Accordion type="single" collapsible>
          <AccordionItem value="other" className="rounded-lg border px-3">
            <AccordionTrigger className="text-sm">
              Other pathways ({otherRoles.length}) — optional future development
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              {otherRoles.map(roleEditor)}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <p className="text-xs text-muted-foreground">After authorized partner conversion, use existing PartnerOS Academy and real certification records. No parallel training engine has been created.</p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="h-5 w-5"/>Legal review & controlled handoff</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1"><Label>Legal review reference</Label>
          <Input disabled={!canEdit||reviewed} value={values.legal_review_reference??""}
            onChange={e=>setValues(v=>({...v,legal_review_reference:e.target.value||null}))}
            placeholder="Approved legal document/version or internal legal authorization ID"/></div>
        <p className="text-xs text-muted-foreground">This reference must identify real approval; it cannot be used to declare the March 2026 draft approved without that approval having occurred.</p>
        {isAdmin && !reviewed && <div className="space-y-2 border-t pt-3">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1"
            checked={reviewConfirmed} onChange={e=>setReviewConfirmed(e.target.checked)}/>
            I have independently verified the legal review and the exact agreement/version for this partner.
          </label>
          <Button variant="outline" disabled={!plan||!reviewConfirmed||!values.legal_review_reference?.trim()||reviewLegal.isPending}
            onClick={approveLegal}><ShieldCheck className="mr-2 h-4 w-4"/>Record HQ legal review</Button>
        </div>}
        {reviewed && <p className="text-sm text-emerald-700"><CheckCircle2 className="mr-1 inline h-4 w-4"/>HQ Admin review recorded, not a signed document by itself.</p>}
        <div className="border-t pt-3 space-y-2">
          <p className="text-sm font-semibold">Handoff gate</p>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>{signed?"✓":"○"} Executed agreement verified</p>
            <p>{reviewed?"✓":"○"} Legal review approved</p>
            <p>{planComplete?"✓":"○"} HQ owner and first-value plan</p>
            <p>{contacts.length?"✓":"○"} Named prospect contact</p>
          </div>
          <p className="text-xs text-muted-foreground">Even after approval, an HQ-controlled conversion is required to create a real partner and assign Academy/access rights. That operation is deliberately not part of this release.</p>
          {isAdmin && !ready && <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={handoffConfirmed}
              onChange={e=>setHandoffConfirmed(e.target.checked)}/>
            I authorize preparation for operational handoff; I am not creating a partner or certifying any skill.
          </label>}
          {isAdmin && !ready && <Button disabled={!plan||!signed||!reviewed||!planComplete||!contacts.length||!handoffConfirmed||approveHandoff.isPending}
            onClick={approve}><ClipboardCheck className="mr-2 h-4 w-4"/>Approve handoff readiness</Button>}
          {ready && <div className="rounded-lg bg-muted p-3 text-sm font-semibold">Approved for handoff — awaiting controlled operational conversion.</div>}
        </div>
      </CardContent>
    </Card>
    <PartnerConversionPanel prospect={prospect} plan={plan} isAdmin={isAdmin} contactsCount={contacts.length}/>
  </div>;
}
