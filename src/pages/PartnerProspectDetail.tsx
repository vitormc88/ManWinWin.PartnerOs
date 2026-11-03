import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Plus, Clock3, MapPin, CheckCircle2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import {
  usePartnerProspect, useProspectContacts, useProspectActivities, useProspectTasks,
  useUpdateProspect, useAddProspectContact, useAddProspectActivity, useCreateProspectTask,
  ALL_STAGES, type PartnerModel, type RecruitmentStage,
} from "@/hooks/usePartnerGrowth";
import { COUNTRY_NAME_BY_CODE } from "@/data/iso-countries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const models: PartnerModel[] = ["CMSC", "CMAR", "CMAI", "Strategic Alliance"];
type FormState = {
  company_name: string; website: string; description: string; source: string;
  proposed_partner_type: PartnerModel | ""; fit_summary: string; interest_evidence: string;
  agreement_reference: string; agreement_signed_on: string;
};
const initial: FormState = { company_name: "", website: "", description: "", source: "",
  proposed_partner_type: "", fit_summary: "", interest_evidence: "", agreement_reference: "", agreement_signed_on: "" };
const showError = (e: unknown) => toast.error(e instanceof Error ? e.message : "Action failed");
const str = (v?: string | null) => v ?? "";

export default function PartnerProspectDetail() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const access = useModuleAccess();
  const canEdit = access.canEdit("partner_growth");
  const { data: prospect, isLoading, isError } = usePartnerProspect(id);
  const { data: contacts = [] } = useProspectContacts(id);
  const { data: activities = [] } = useProspectActivities(id);
  const { data: tasks = [] } = useProspectTasks(id);
  const update = useUpdateProspect(id ?? "");
  const addContact = useAddProspectContact(id ?? "");
  const addActivity = useAddProspectActivity(id ?? "");
  const addTask = useCreateProspectTask(id ?? "");
  const [tab, setTab] = useState("overview");
  const [form, setForm] = useState<FormState>(initial);
  const [stage, setStage] = useState<RecruitmentStage>("Identified");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [noteKind, setNoteKind] = useState<"note" | "meeting" | "interaction">("note");
  const [note, setNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [decisionAcknowledged, setDecisionAcknowledged] = useState(false);

  useEffect(() => {
    if (!prospect) return;
    setForm({
      company_name: prospect.company_name, website: str(prospect.website),
      description: str(prospect.description), source: str(prospect.source),
      proposed_partner_type: prospect.proposed_partner_type ?? "",
      fit_summary: str(prospect.fit_summary), interest_evidence: str(prospect.interest_evidence),
      agreement_reference: str(prospect.agreement_reference),
      agreement_signed_on: str(prospect.agreement_signed_on),
    });
    setStage(prospect.recruitment_stage);
    setDecisionAcknowledged(false);
  }, [prospect]);

  const saveProfile = async () => {
    if (!prospect || !canEdit) return;
    try {
      await update.mutateAsync({
        company_name: form.company_name.trim(), website: form.website.trim() || null,
        description: form.description.trim() || null, source: form.source.trim() || null,
        proposed_partner_type: form.proposed_partner_type || null,
        fit_summary: form.fit_summary.trim() || null,
        interest_evidence: form.interest_evidence.trim() || null,
      });
      toast.success("Prospect details saved");
    } catch (e) { showError(e); }
  };

  const advanceStage = async () => {
    if (!prospect || !canEdit || stage === prospect.recruitment_stage) return;
    const needsQualification = ["Qualified", "Agreement Pending", "Signed"].includes(stage);
    if (needsQualification && (contacts.length === 0 || !form.proposed_partner_type ||
        form.fit_summary.trim().length < 5 || form.interest_evidence.trim().length < 5)) {
      toast.error("Add a contact, partner model, market fit and evidence of interest first"); return;
    }
    if (stage === "Signed" && !isAdmin) { toast.error("Only an HQ Admin may verify Signed"); return; }
    if (stage === "Signed" && (!form.agreement_reference.trim() || !form.agreement_signed_on)) {
      toast.error("A verified signed agreement reference and date are required"); return;
    }
    if (stage === "Qualified" && !decisionAcknowledged) {
      toast.error("Confirm the explicit HQ Proceed decision first"); return;
    }
    try {
      await update.mutateAsync({
        recruitment_stage: stage,
        proposed_partner_type: form.proposed_partner_type || null,
        fit_summary: form.fit_summary.trim() || null,
        interest_evidence: form.interest_evidence.trim() || null,
        ...(stage === "Qualified" ? { qualification_decision: "Proceed" as const } : {}),
        ...(stage === "Signed" ? {
          agreement_reference: form.agreement_reference.trim(),
          agreement_signed_on: form.agreement_signed_on,
        } : {}),
      });
      setDecisionAcknowledged(false);
      toast.success("Recruitment stage updated");
    } catch (e) { showError(e); }
  };

  const saveContact = async () => {
    if (!contactName.trim()) return;
    try {
      await addContact.mutateAsync({ name: contactName, email: contactEmail, job_title: contactRole });
      setContactName(""); setContactEmail(""); setContactRole("");
      toast.success("Contact added");
    } catch (e) { showError(e); }
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    try {
      await addActivity.mutateAsync({ content: note.trim(), kind: noteKind });
      setNote(""); toast.success("Activity saved");
    } catch (e) { showError(e); }
  };

  const saveTask = async () => {
    if (!taskTitle.trim()) return;
    try {
      await addTask.mutateAsync({ title: taskTitle, due_date: taskDate || undefined });
      setTaskTitle(""); setTaskDate(""); toast.success("Follow-up created");
    } catch (e) { showError(e); }
  };

  if (isLoading) return <p className="text-muted-foreground">Loading prospect…</p>;
  if (isError || !prospect) return <div role="alert" className="text-destructive">Prospect not found or access restricted.</div>;
  const countryName = COUNTRY_NAME_BY_CODE[prospect.country] ?? prospect.country;
  const qualified = ["Qualified", "Agreement Pending", "Signed"].includes(prospect.recruitment_stage);
  return (
    <div className="space-y-5 pb-10">
      <Link to="/partner-growth" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Recruitment Pipeline</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{prospect.company_name}</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{countryName} ({prospect.country})</p>
        </div>
        <Badge variant="secondary">{prospect.recruitment_stage}</Badge>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-4">
          <TabsTrigger value="overview" className="px-1 text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="qualification" className="px-1 text-xs sm:text-sm">Fit</TabsTrigger>
          <TabsTrigger value="documents" className="px-1 text-xs sm:text-sm">Docs</TabsTrigger>
          <TabsTrigger value="activity" className="px-1 text-xs sm:text-sm">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Recruitment status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Label>Current stage</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as RecruitmentStage)} disabled={!canEdit || prospect.recruitment_stage === "Signed"}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ALL_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              {stage === "Qualified" && prospect.recruitment_stage !== "Qualified" && <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={decisionAcknowledged} onChange={(e) => setDecisionAcknowledged(e.target.checked)} />
                I have reviewed this candidate and explicitly approve qualification as HQ.
              </label>}
              <p className="text-xs text-muted-foreground">Qualified requires contact, fit, interest, partner type and HQ decision. Signed requires an executed agreement verified by HQ Admin.</p>
              {canEdit && <Button size="sm" disabled={update.isPending || stage === prospect.recruitment_stage || (stage === "Signed" && !isAdmin)} onClick={advanceStage}>Update stage</Button>}
            </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Company profile</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Company</Label><Input disabled={!canEdit} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Website</Label><Input disabled={!canEdit} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Source</Label><Input disabled={!canEdit} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="LinkedIn, referral, conference…" /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Partnership opportunity</Label><Textarea disabled={!canEdit} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              {canEdit && <div className="sm:col-span-2"><Button disabled={update.isPending} onClick={saveProfile}>Save changes</Button></div>}
            </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Next actions</CardTitle></CardHeader><CardContent className="space-y-3">
            {tasks.filter((t) => t.task_status !== "Completed").map((t) => <div key={t.id} className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">{t.title}</p><span className="text-xs text-muted-foreground">{t.due_date ? new Date(t.due_date).toLocaleDateString() : "No date"}</span></div>)}
            {tasks.length === 0 && <p className="text-sm text-muted-foreground">No follow-ups assigned yet.</p>}
            {canEdit && <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
              <Input aria-label="New follow-up" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Next action…" />
              <Input type="date" aria-label="Due date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} />
              <Button disabled={!taskTitle.trim() || addTask.isPending} onClick={saveTask}><Plus className="mr-1 h-4 w-4" />Add</Button>
            </div>}
            <p className="text-xs text-muted-foreground">Tasks are stored in the existing PartnerOS task system.</p>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="qualification" className="mt-4 space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Partner qualification</CardTitle></CardHeader><CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Record observed facts. Advanced Research / Discovery Copilot arrives in Sprint 2.</p>
            <div className="space-y-1"><Label>Proposed partnership model</Label>
              <Select disabled={!canEdit} value={form.proposed_partner_type || "undecided"} onValueChange={(v) => setForm({ ...form, proposed_partner_type: v === "undecided" ? "" : v as PartnerModel })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="undecided">To be determined</SelectItem>{models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Why does this company fit?</Label><Textarea disabled={!canEdit} rows={3} value={form.fit_summary} onChange={(e) => setForm({ ...form, fit_summary: e.target.value })} placeholder="Relevant market, customer access, technical/commercial value…" /></div>
            <div className="space-y-1"><Label>Evidence of interest</Label><Textarea disabled={!canEdit} rows={3} value={form.interest_evidence} onChange={(e) => setForm({ ...form, interest_evidence: e.target.value })} placeholder="What did they actually say or agree to?" /></div>
            {canEdit && <Button disabled={update.isPending} onClick={saveProfile}>Save qualification</Button>}
            {qualified && <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Qualified by HQ — {prospect.qualified_at ? new Date(prospect.qualified_at).toLocaleDateString() : "recorded"}</div>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Contacts ({contacts.length})</CardTitle></CardHeader><CardContent className="space-y-3">
            {contacts.map((c) => <div className="rounded-lg border p-3" key={c.id}><p className="font-medium">{c.name}</p><p className="text-sm text-muted-foreground">{[c.job_title, c.email, c.phone].filter(Boolean).join(" · ")}</p></div>)}
            {canEdit && <div className="grid gap-2 sm:grid-cols-2">
              <Input aria-label="Contact name" value={contactName} placeholder="Contact name *" onChange={(e) => setContactName(e.target.value)} />
              <Input aria-label="Contact title" value={contactRole} placeholder="Role / title" onChange={(e) => setContactRole(e.target.value)} />
              <Input aria-label="Contact email" type="email" value={contactEmail} placeholder="Email" onChange={(e) => setContactEmail(e.target.value)} />
              <Button disabled={!contactName.trim() || addContact.isPending} onClick={saveContact}>Add contact</Button>
            </div>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="documents" className="mt-4 space-y-4">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-5 w-5" />Documents & Agreements</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Sprint 1 stores only the reference and verification metadata. Confidential documents are not uploaded to the global library.</p>
              <div className="space-y-1"><Label>Signed agreement reference</Label><Input disabled={!canEdit} value={form.agreement_reference} onChange={(e) => setForm({ ...form, agreement_reference: e.target.value })} placeholder="Verified reference in an authorized repository" /></div>
              <div className="space-y-1"><Label>Execution date</Label><Input disabled={!canEdit} type="date" value={form.agreement_signed_on} onChange={(e) => setForm({ ...form, agreement_signed_on: e.target.value })} /></div>
              {prospect.recruitment_stage === "Signed" ? <div className="flex gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Verified by HQ Admin</div>
                : <div className="flex gap-2 text-sm text-muted-foreground"><ShieldAlert className="h-4 w-4" />Not yet a verified executed agreement</div>}
              <p className="text-xs text-muted-foreground">To verify a signature, choose Signed in Overview. An HQ Admin must confirm the document reference and date. Document generation arrives in Sprint 3.</p>
            </CardContent></Card>
        </TabsContent>
        <TabsContent value="activity" className="mt-4 space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Relationship history</CardTitle></CardHeader><CardContent className="space-y-3">
            {activities.length === 0 && <p className="text-sm text-muted-foreground">No activity recorded.</p>}
            {activities.map((a) => <div key={a.id} className="border-b pb-3 last:border-0"><div className="flex items-center justify-between gap-2">
              <Badge variant="secondary">{a.kind}</Badge><span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" />{new Date(a.occurred_at).toLocaleString()}</span></div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{a.content}</p></div>)}
            {canEdit && <div className="space-y-2 pt-2">
              <Select value={noteKind} onValueChange={(v) => setNoteKind(v as typeof noteKind)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="note">Note</SelectItem><SelectItem value="meeting">Meeting</SelectItem><SelectItem value="interaction">Interaction</SelectItem></SelectContent></Select>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? What is the next step?" rows={3} />
              <Button disabled={!note.trim() || addActivity.isPending} onClick={saveNote}>Save activity</Button></div>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
