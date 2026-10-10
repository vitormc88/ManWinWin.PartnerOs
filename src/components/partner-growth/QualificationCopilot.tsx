import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, ExternalLink, FileCheck2, FilePlus2, Flag, Save, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildDiscoveryQuestions, EMPTY_QUALIFICATION, FIT_DIMENSIONS,
  getQualificationSummary, useAddResearchSource, useProspectQualification, useResearchSources,
  useSaveProspectQualification, useVerifyResearchSource,
  type EvidenceAnswer, type QualificationDraft, type ResearchSource,
} from "@/hooks/usePartnerQualification";
import { useCreateProspectTask, useUpdateProspect, type PartnerModel, type PartnerProspect } from "@/hooks/usePartnerGrowth";

const answerChoices: EvidenceAnswer[] = ["yes", "unknown", "no"];
const modelNames: Record<PartnerModel, string> = {
  CMSC: "Strategic Connector", CMAR: "Accredited Reseller",
  CMAI: "Accredited Implementer", "Strategic Alliance": "Strategic Alliance",
};
const showError = (e: unknown) => toast.error(e instanceof Error ? e.message : "Operation failed");

function AnswerField({ title, help, value, disabled, onChange }: {
  title: string; help?: string; value: EvidenceAnswer; disabled: boolean;
  onChange: (v: EvidenceAnswer) => void;
}) {
  return <div className="space-y-1.5">
    <Label>{title}</Label>
    {help && <p className="text-xs text-muted-foreground">{help}</p>}
    <Select value={value} disabled={disabled} onValueChange={(v) => onChange(v as EvidenceAnswer)}>
      <SelectTrigger aria-label={title}><SelectValue /></SelectTrigger>
      <SelectContent>{answerChoices.map((a) =>
        <SelectItem key={a} value={a}>{a === "unknown" ? "Unknown / Not assessed" : a === "yes" ? "Yes — evidence available" : "No / Concern"}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

export function QualificationCopilot({ prospect, canEdit }: { prospect: PartnerProspect; canEdit: boolean }) {
  const { data: stored, isLoading: qualificationLoading, isError: qualificationError } = useProspectQualification(prospect.id);
  const { data: sources = [], isLoading: sourcesLoading } = useResearchSources(prospect.id);
  const saveQualification = useSaveProspectQualification(prospect.id);
  const addSource = useAddResearchSource(prospect.id);
  const verifySource = useVerifyResearchSource(prospect.id);
  const updateProspect = useUpdateProspect(prospect.id);
  const createTask = useCreateProspectTask(prospect.id);

  const [step, setStep] = useState("research");
  const [draft, setDraft] = useState<QualificationDraft>(EMPTY_QUALIFICATION);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceKind, setSourceKind] = useState<ResearchSource["source_kind"]>("website");
  const [sourceFinding, setSourceFinding] = useState("");
  const [fit, setFit] = useState("");
  const [interest, setInterest] = useState("");
  const [selectedModel, setSelectedModel] = useState<PartnerModel | "">("");
  const [acknowledge, setAcknowledge] = useState(false);

  useEffect(() => {
    setDraft(stored ? {
      research_summary: stored.research_summary,
      market_fit: stored.market_fit, commercial_reach: stored.commercial_reach,
      complementary_value: stored.complementary_value, commitment: stored.commitment,
      business_viability: stored.business_viability,
      can_introduce: stored.can_introduce, can_sell: stored.can_sell,
      can_implement: stored.can_implement, discovery_notes: stored.discovery_notes,
      risks_and_gaps: stored.risks_and_gaps, recommended_next_action: stored.recommended_next_action,
    } : { ...EMPTY_QUALIFICATION });
  }, [stored, prospect.id]);
  useEffect(() => {
    setFit(prospect.fit_summary ?? "");
    setInterest(prospect.interest_evidence ?? "");
    setSelectedModel(prospect.proposed_partner_type ?? "");
    setAcknowledge(false);
  }, [prospect.id, prospect.fit_summary, prospect.interest_evidence, prospect.proposed_partner_type]);

  const summary = useMemo(() => getQualificationSummary(draft), [draft]);
  const questions = useMemo(() => buildDiscoveryQuestions(draft, prospect.company_name), [draft, prospect.company_name]);
  const setAnswer = (key: keyof QualificationDraft, value: EvidenceAnswer) => setDraft((p) => ({ ...p, [key]: value }));
  const saveStep = async () => {
    try {
      await saveQualification.mutateAsync(draft);
      toast.success("Qualification saved");
    } catch (e) { showError(e); }
  };
  const saveAndMove = async (next: string) => {
    if (!canEdit) { setStep(next); return; }
    try {
      await saveQualification.mutateAsync(draft);
      setStep(next);
    } catch (e) { showError(e); }
  };
  const recordEvidence = async () => {
    if (sourceTitle.trim().length < 2 || sourceFinding.trim().length < 5) {
      toast.error("Add a source name and its specific finding"); return;
    }
    const url = sourceUrl.trim();
    if (url && (!url.startsWith("https://") || /\s/.test(url))) {
      toast.error("Use an HTTPS source URL, or leave it blank"); return;
    }
    try {
      await addSource.mutateAsync({ title: sourceTitle.trim(), source_url: url || null,
        source_kind: sourceKind, finding: sourceFinding.trim() });
      setSourceTitle(""); setSourceUrl(""); setSourceFinding("");
      toast.success("Source recorded — initially unverified");
    } catch (e) { showError(e); }
  };
  const saveDecision = async () => {
    if (!acknowledge) { toast.error("Confirm this is a recommendation, not an HQ approval"); return; }
    try {
      await saveQualification.mutateAsync(draft);
      await updateProspect.mutateAsync({
        fit_summary: fit.trim() || null,
        interest_evidence: interest.trim() || null,
        proposed_partner_type: selectedModel || null,
      });
      toast.success("Recommendation and factual evidence saved — stage remains unchanged");
    } catch (e) { showError(e); }
  };
  const createSuggestedTask = async () => {
    if (!summary.next.trim()) return;
    try { await createTask.mutateAsync({ title: summary.next.trim() }); toast.success("Follow-up added to PartnerOS tasks"); }
    catch (e) { showError(e); }
  };

  if (qualificationLoading || sourcesLoading) return <p className="text-sm text-muted-foreground">Loading qualification…</p>;
  if (qualificationError) return <p role="alert" className="text-destructive">Qualification could not be loaded. Please check HQ permissions.</p>;

  return <Card>
    <CardHeader className="space-y-2">
      <CardTitle className="flex items-center gap-2 text-lg"><BrainCircuit className="h-5 w-5" />Qualification Copilot</CardTitle>
      <p className="text-sm text-muted-foreground">Company evidence → guided meeting → explained recommendation. HQ makes all stage decisions.</p>
    </CardHeader>
    <CardContent className="space-y-5">
      <Tabs value={step} onValueChange={setStep}>
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="research" className="px-2">1. Research</TabsTrigger>
          <TabsTrigger value="discovery" className="px-2">2. Discovery</TabsTrigger>
          <TabsTrigger value="decision" className="px-2">3. Decision</TabsTrigger>
        </TabsList>
        <TabsContent value="research" className="mt-4 space-y-4">
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm">Research is <strong>source-based and HQ-entered</strong> in this release. No website was automatically researched and no AI-generated facts are presented as verified.</p>
            </div>
          </div>
          <div className="space-y-1"><Label>Company intelligence brief</Label>
            <Textarea rows={4} disabled={!canEdit} value={draft.research_summary} onChange={(e) => setDraft({ ...draft, research_summary: e.target.value })}
              placeholder="What does the company do? Which customers/markets does it serve? Separate confirmed facts and hypotheses…" /></div>
          <div className="space-y-3">
            <h3 className="font-semibold">Supporting evidence ({sources.length})</h3>
            {sources.length === 0 && <p className="text-sm text-muted-foreground">No evidence recorded yet. Add at least one source before drawing firm conclusions.</p>}
            {sources.map((s) => <div key={s.id} className="rounded-lg border p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-medium">{s.title}</p><p className="text-xs text-muted-foreground">{s.source_kind.replace("_", " ")}</p></div>
                <Badge variant={s.evidence_state === "verified_by_hq" ? "default" : "outline"}>
                  {s.evidence_state === "verified_by_hq" ? "HQ verified" : "Unverified"}
                </Badge>
              </div>
              <p className="whitespace-pre-wrap text-sm">{s.finding}</p>
              {s.source_url && <a href={s.source_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs underline underline-offset-2">
                Open source <ExternalLink className="h-3 w-3" /></a>}
              {canEdit && <Button size="sm" variant="outline" disabled={verifySource.isPending}
                onClick={async () => { try { await verifySource.mutateAsync({ id: s.id, verified: s.evidence_state !== "verified_by_hq" }); } catch (e) { showError(e); } }}>
                <FileCheck2 className="mr-1 h-3.5 w-3.5" />
                {s.evidence_state === "verified_by_hq" ? "Mark unverified" : "I have checked this evidence"}
              </Button>}
            </div>)}
          </div>
          {canEdit && <div className="rounded-lg bg-muted/40 p-3 space-y-3">
            <h3 className="font-semibold text-sm">Add source or verified meeting fact</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} placeholder="Source title *" aria-label="Source title" />
              <Select value={sourceKind} onValueChange={(v) => setSourceKind(v as ResearchSource["source_kind"])}>
                <SelectTrigger aria-label="Evidence type"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="website">Company website</SelectItem><SelectItem value="public_source">Public source</SelectItem>
                  <SelectItem value="meeting">Meeting / call</SelectItem><SelectItem value="internal">Internal document</SelectItem></SelectContent></Select>
            </div>
            <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://… (optional)" aria-label="Source URL" />
            <Textarea rows={2} value={sourceFinding} onChange={(e) => setSourceFinding(e.target.value)} placeholder="Specific fact or claim supported by this source *" />
            <Button size="sm" variant="outline" disabled={addSource.isPending} onClick={recordEvidence}><FilePlus2 className="mr-2 h-4 w-4" />Record evidence</Button>
          </div>}
          <div className="flex flex-wrap gap-2">
            {canEdit && <Button variant="outline" disabled={saveQualification.isPending} onClick={saveStep}><Save className="mr-2 h-4 w-4" />Save research</Button>}
            <Button onClick={() => saveAndMove("discovery")}>Prepare Discovery</Button>
          </div>
        </TabsContent>
        <TabsContent value="discovery" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">Define how this partner intends to contribute. A capability indication is <strong>not</strong> an accreditation.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <AnswerField title="Introduces qualified clients?" help="Referral / connector capability" value={draft.can_introduce} disabled={!canEdit} onChange={(v) => setAnswer("can_introduce", v)} />
            <AnswerField title="Leads commercial cycle?" help="Demonstrations, proposals, negotiation" value={draft.can_sell} disabled={!canEdit} onChange={(v) => setAnswer("can_sell", v)} />
            <AnswerField title="Can implement software?" help="Practical delivery capability" value={draft.can_implement} disabled={!canEdit} onChange={(v) => setAnswer("can_implement", v)} />
          </div>
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" />Suggested discovery questions</div>
            <ol className="list-decimal space-y-2 pl-5 text-sm">{questions.map((q) => <li key={q}>{q}</li>)}</ol>
            <p className="text-xs text-muted-foreground">Questions are adapted from the selected answers and the partner's name, not generated from an unverified online profile.</p>
          </div>
          <div className="space-y-1"><Label>Discovery meeting notes</Label>
            <Textarea disabled={!canEdit} rows={5} value={draft.discovery_notes} onChange={(e) => setDraft({ ...draft, discovery_notes: e.target.value })}
              placeholder="What did the company say? Who committed to what? What remains unknown?" /></div>
          <div className="flex flex-wrap gap-2">
            {canEdit && <Button variant="outline" disabled={saveQualification.isPending} onClick={saveStep}><Save className="mr-2 h-4 w-4" />Save discovery</Button>}
            <Button onClick={() => saveAndMove("decision")}>Evaluate Partner Fit</Button>
          </div>
        </TabsContent>
        <TabsContent value="decision" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">Use Unknown if there is no evidence. Distinguish market opportunity from current readiness and HQ accreditation.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {FIT_DIMENSIONS.map((d) => <AnswerField key={d.field} title={d.name} help={d.help}
              value={draft[d.field]} disabled={!canEdit} onChange={(v) => setAnswer(d.field, v)} />)}
          </div>
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="font-semibold flex gap-2 items-center"><BrainCircuit className="h-4 w-4" />Copilot recommendation</h3>
            <p className="text-sm"><strong>Proposed model:</strong> {summary.model ? summary.model + " — " + modelNames[summary.model] : "Not enough evidence"}</p>
            <p className="text-sm"><strong>Partner potential:</strong> {summary.positives}/5 positive, {summary.gaps} unknown, {summary.concerns} concerns</p>
            <p className="text-sm"><strong>Current readiness:</strong> {summary.readiness}</p>
            <p className="text-sm"><strong>Assessment:</strong> {summary.assessment}</p>
            <p className="text-xs text-muted-foreground">Rule-based recommendation; no automated approval, rights, signature or promotion to Qualified.</p>
          </div>
          <div className="space-y-1"><Label>Risks, uncertainties and missing evidence</Label>
            <Textarea disabled={!canEdit} rows={3} value={draft.risks_and_gaps} onChange={(e) => setDraft({ ...draft, risks_and_gaps: e.target.value })} /></div>
          <div className="space-y-1"><Label>Recommended next action</Label>
            <Input disabled={!canEdit} value={draft.recommended_next_action} onChange={(e) => setDraft({ ...draft, recommended_next_action: e.target.value })}
              placeholder={summary.next} /></div>
          <div className="rounded-lg bg-muted/40 p-3 space-y-3">
            <h3 className="font-semibold text-sm">HQ factual assessment — used by Qualified stage gate</h3>
            <div className="space-y-1"><Label>Confirmed commercial fit</Label>
              <Textarea disabled={!canEdit} rows={2} value={fit} onChange={(e) => setFit(e.target.value)} placeholder="Concrete fit based on sourced facts" /></div>
            <div className="space-y-1"><Label>Evidence of partner interest</Label>
              <Textarea disabled={!canEdit} rows={2} value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="Specific discussion, request or commitment" /></div>
            <div className="space-y-1"><Label>HQ proposed partner type</Label>
              <Select disabled={!canEdit} value={selectedModel || "undecided"} onValueChange={(v) => setSelectedModel(v === "undecided" ? "" : v as PartnerModel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="undecided">To be determined</SelectItem>
                  {Object.entries(modelNames).map(([id, name]) => <SelectItem value={id} key={id}>{id} — {name}</SelectItem>)}</SelectContent>
              </Select>
              {summary.model && <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setSelectedModel(summary.model!)}>Use suggested {summary.model}</Button>}
            </div>
            {canEdit && <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={acknowledge} onChange={(e) => setAcknowledge(e.target.checked)} />
              <span>I confirm this is a recorded <strong>recommendation</strong>, not an HQ approval or certification.</span>
            </label>}
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && <Button disabled={!acknowledge || saveQualification.isPending || updateProspect.isPending} onClick={saveDecision}>
              <Save className="mr-2 h-4 w-4" />Save recommendation</Button>}
            {canEdit && <Button variant="outline" disabled={createTask.isPending} onClick={createSuggestedTask}>
              <Flag className="mr-2 h-4 w-4" />Create next-action task</Button>}
          </div>
        </TabsContent>
      </Tabs>
    </CardContent>
  </Card>;
}
