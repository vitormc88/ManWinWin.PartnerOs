import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Download, FileCheck, FileClock, FilePlus2, FileText, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProspectContacts, type PartnerModel, type PartnerProspect } from "@/hooks/usePartnerGrowth";
import { useProspectQualification, useResearchSources } from "@/hooks/usePartnerQualification";
import { useApprovePartnerDocument, usePartnerDocuments, useSavePartnerDocument, type PartnerDocument } from "@/hooks/usePartnerDocuments";
import { buildStrategicProposalSnapshot, getProposalReadiness, type StrategicProposalSnapshot } from "@/lib/partner-growth-proposal";
import { exportStrategicProposalDocx, exportStrategicProposalPdf } from "@/lib/partner-growth-proposal-export";
import logoUrl from "@/assets/manwinwin-logo.png";

const modelLabels: Record<PartnerModel, string> = {
  CMSC: "Strategic Connector (CMSC)", CMAR: "Accredited Reseller (CMAR)",
  CMAI: "Accredited Implementer (CMAI)", "Strategic Alliance": "Strategic Alliance",
};
const documentTypes = [
  { id: "strategic_proposal", name: "Strategic Partnership Proposal", available: true, help: "HQ-reviewed discussion document personalised from the Prospect 360°" },
  { id: "nda", name: "Non-disclosure Agreement", available: false, help: "Awaiting HQ-approved NDA template and legal fields" },
  { id: "connector", name: "Strategic Connector Agreement", available: false, help: "Awaiting approved CMSC legal template" },
  { id: "progressive", name: "Progressive Partner Agreement", available: false, help: "Awaiting approved progressive legal template and annexes" },
] as const;
const errorText = (e: unknown) => e instanceof Error ? e.message : "Operation failed";

export function PartnerDocumentStudio({ prospect, canEdit, isAdmin }: {
  prospect: PartnerProspect; canEdit: boolean; isAdmin: boolean;
}) {
  const { data: docs = [], isLoading: loadingDocs, isError: docsError } = usePartnerDocuments(prospect.id);
  const { data: contacts = [] } = useProspectContacts(prospect.id);
  const { data: qualifications } = useProspectQualification(prospect.id);
  const { data: sources = [] } = useResearchSources(prospect.id);
  const saveDocument = useSavePartnerDocument(prospect.id);
  const approveDocument = useApprovePartnerDocument(prospect.id);
  const [step, setStep] = useState("type");
  const [view, setView] = useState<"studio" | "register">("studio");
  const [model, setModel] = useState<PartnerModel | "">("");
  const [objective, setObjective] = useState("");
  const [commercialTerms, setCommercialTerms] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [approvedReview, setApprovedReview] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    setModel(prospect.proposed_partner_type ?? "");
    setObjective(prospect.description ?? "");
    setCommercialTerms("");
    setSelectedId("");
    setStep("type");
    setView("studio");
    setApprovedReview(false);
  }, [prospect.id]);
  const verified = sources.filter(s => s.evidence_state === "verified_by_hq");
  const input = useMemo(() => ({
    prospect, qualification: qualifications ?? null, verifiedSources: verified,
    contactNames: contacts.map(c => c.name), model: model || null,
    objective, commercialTerms,
  }), [prospect, qualifications, sources, contacts, model, objective, commercialTerms]);
  const preflight = getProposalReadiness(input);
  const preview = useMemo(() => buildStrategicProposalSnapshot(input), [input]);
  const selected = docs.find(d => d.id === selectedId);
  const snapshot: StrategicProposalSnapshot = selected?.content_snapshot ?? preview;
  const activeVersion = selected?.version ?? 1;
  const canApprove = isAdmin && canEdit && !!selected && selected.status === "draft"
    && snapshot.missing_inputs.length === 0 && approvedReview;
  const latest = docs.length ? [...docs].sort((a,b) => b.version-a.version || b.created_at.localeCompare(a.created_at))[0] : null;
  const saveDraft = async () => {
    try {
      const d = await saveDocument.mutateAsync({ snapshot: preview, previous: latest });
      setSelectedId(d.id); setStep("review"); setApprovedReview(false);
      toast.success("Versioned proposal draft registered in TEST");
    } catch (e) { toast.error(errorText(e)); }
  };
  const approve = async () => {
    if (!selected || !canApprove) return;
    try {
      await approveDocument.mutateAsync(selected.id);
      toast.success("Proposal approved by HQ — no agreement signed and no partner activated");
      setApprovedReview(false);
    } catch (e) { toast.error(errorText(e)); }
  };
  const exportDoc = async (kind: "pdf"|"docx", doc?: PartnerDocument | null) => {
    const item = doc ?? selected;
    const payload = item?.content_snapshot ?? preview;
    try {
      setExportBusy(true);
      if (kind === "pdf") await exportStrategicProposalPdf(payload, item?.version ?? 1, item?.status === "approved");
      else await exportStrategicProposalDocx(payload, item?.version ?? 1, item?.status === "approved");
    } catch (e) { toast.error("File generation failed: " + errorText(e)); }
    finally { setExportBusy(false); }
  };

  if (loadingDocs) return <p className="text-sm text-muted-foreground">Loading documents…</p>;
  if (docsError) return <p role="alert" className="text-destructive">Document access is restricted or unavailable.</p>;

  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5"/>Agreement & Document Studio</CardTitle>
      <p className="text-sm text-muted-foreground">Prepare an almost-ready, company-specific proposal. HQ review remains mandatory; contracts require approved templates.</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={view==="studio"?"default":"outline"} onClick={()=>setView("studio")}><FilePlus2 className="mr-2 h-4 w-4"/>Create</Button>
        <Button size="sm" variant={view==="register"?"default":"outline"} onClick={()=>setView("register")}><FileClock className="mr-2 h-4 w-4"/>Register ({docs.length})</Button>
      </div>
      {view==="register" ? <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Every generated version is immutable. New changes are new drafts.</p>
        {docs.length===0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No strategic proposals recorded yet.</p>}
        {docs.map(d=><div key={d.id} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div><p className="font-semibold">{d.title}</p>
              <p className="text-xs text-muted-foreground">Version {d.version} · {new Date(d.created_at).toLocaleString()}</p></div>
            <Badge variant={d.status==="approved"?"default":"outline"}>{d.status==="approved"?"HQ approved":"Draft"}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={()=>{setSelectedId(d.id);setView("studio");setStep("review");setApprovedReview(false);}}>Review version</Button>
            <Button size="sm" variant="outline" disabled={exportBusy} onClick={()=>exportDoc("docx",d)}>DOCX</Button>
            <Button size="sm" variant="outline" disabled={exportBusy} onClick={()=>exportDoc("pdf",d)}>PDF</Button>
          </div>
        </div>)}
      </div> : <Tabs value={step} onValueChange={setStep}>
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="type">1. Type</TabsTrigger>
          <TabsTrigger value="details">2. Details</TabsTrigger>
          <TabsTrigger value="review">3. Review</TabsTrigger>
        </TabsList>
        <TabsContent value="type" className="mt-4 space-y-3">
          <p className="text-sm font-medium">What would you like to prepare?</p>
          {documentTypes.map(dt=><div key={dt.id} className={"rounded-lg border p-3 "+(!dt.available?"opacity-65":"border-primary")}>
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-semibold">{dt.name}</p><p className="text-xs text-muted-foreground">{dt.help}</p></div>
              {dt.available?<Badge>Available</Badge>:<LockKeyhole className="h-4 w-4 text-muted-foreground"/>}
            </div>
          </div>)}
          <p className="text-xs text-muted-foreground">The Strategic Proposal is a commercial discussion document, not a signed agreement, NDA or authorization to represent ManWinWin.</p>
          <Button onClick={()=>{setSelectedId("");setStep("details");}}>Continue to Details</Button>
        </TabsContent>
        <TabsContent value="details" className="mt-4 space-y-4">
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4"/><strong>Automatic preparation</strong></div>
            <p className="text-sm text-muted-foreground">Using HQ prospect data, qualification notes and verified research sources. No fabricated market facts, unapproved commissions or automatic legal clauses.</p>
          </div>
          <div className="space-y-1"><Label>Proposed partnership model</Label>
            <Select disabled={!canEdit} value={model||"undecided"} onValueChange={v=>setModel(v==="undecided"?"":v as PartnerModel)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="undecided">To be determined</SelectItem>
                {Object.entries(modelLabels).map(([k,v])=><SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Proposed partnership objective</Label>
            <Textarea disabled={!canEdit} rows={4} value={objective} onChange={e=>setObjective(e.target.value)}
              placeholder="What customer opportunity or complementary capability connects the two companies?"/>
            <p className="text-xs text-muted-foreground">Pre-filled from the prospect profile; edit only if necessary.</p>
          </div>
          <div className="space-y-1"><Label>Indicative commercial conditions (optional)</Label>
            <Textarea disabled={!canEdit} rows={3} value={commercialTerms} onChange={e=>setCommercialTerms(e.target.value)}
              placeholder="Leave blank to state that commercial conditions require separate agreement."/>
            <p className="text-xs text-muted-foreground">Any amounts, commissions or territorial rights entered here remain proposed until HQ approval and a signed contract.</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 space-y-2">
            <strong className="text-sm">Document preflight</strong>
            <p className="text-xs text-muted-foreground">{verified.length} HQ-verified sources · {contacts.length} contact(s)</p>
            {preflight.missing.length===0
              ? <div className="flex items-center gap-2 text-sm"><FileCheck className="h-4 w-4 text-emerald-600"/>Ready for HQ review</div>
              : preflight.missing.map(s=><p key={s} className="text-xs text-muted-foreground">• {s}</p>)}
          </div>
          <Button disabled={!canEdit} onClick={()=>{setSelectedId("");setStep("review");setApprovedReview(false);}}>Prepare Document Preview</Button>
        </TabsContent>
        <TabsContent value="review" className="mt-4 space-y-4">
          <div className="mx-auto max-w-[820px] space-y-4">
            <div className="overflow-hidden border bg-white px-5 pb-8 pt-7 text-slate-800 shadow-md sm:px-10 sm:pb-10 sm:pt-9">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-600">Strategic Partnership Proposition</p>
              <div className="mb-6 mt-4 h-0.5 w-full bg-red-600"/>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="flex min-h-[85px] items-center justify-center bg-slate-100 p-3">
                  <img src={logoUrl} alt="ManWinWin Software" className="max-h-14 w-full object-contain"/>
                </div>
                <span className="text-xl font-bold text-red-600">×</span>
                <div className="flex min-h-[85px] items-center justify-center bg-slate-800 p-3 text-center text-sm font-bold text-white">
                  {snapshot.prospect_name}
                </div>
              </div>
              <h2 className="mt-8 text-[clamp(1.5rem,5vw,2.25rem)] font-extrabold leading-tight tracking-tight text-slate-800">
                STRATEGIC PARTNERSHIP<br/>PROPOSAL
              </h2>
              <p className="mt-2 text-sm text-slate-500">{snapshot.subtitle} · {snapshot.country}</p>
              <div className="mt-7">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">The collaboration opportunity</p>
                <p className="mt-2 text-sm leading-relaxed">{snapshot.executive_message || snapshot.objective}</p>
              </div>
              <div className="mt-7 grid grid-cols-3 text-center text-[9px] font-extrabold uppercase sm:text-[11px]">
                <div className="flex min-h-[70px] items-center justify-center bg-red-600 p-2 text-white">Partner insight</div>
                <div className="flex min-h-[70px] items-center justify-center bg-slate-100 p-2 text-slate-600">Shared customer value</div>
                <div className="flex min-h-[70px] items-center justify-center bg-slate-800 p-2 text-white">Maintenance action</div>
              </div>
              <p className="mt-5 text-xs font-extrabold uppercase tracking-wide text-red-600">
                From customer opportunity to maintenance impact.
              </p>
              <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">
                {selected?.status==="approved" ? "HQ approved proposal" : "Discussion document · HQ review required"}
              </p>
              <div className="mt-10 grid grid-cols-3">
                {[
                  ["FOCUSED START","One meaningful first opportunity"],
                  ["CLEAR OWNERSHIP","Responsibilities agreed per case"],
                  ["ROOM TO EVOLVE","Competency-based progression"],
                ].map(([headline,caption],i)=><div key={headline}
                  className={"p-2.5 text-[10px] " +(i===0?"bg-slate-100 text-slate-700":i===1?"bg-slate-800 text-white":"bg-red-600 text-white")}>
                  <p className="font-bold">{headline}</p><p className="mt-1 opacity-85">{caption}</p>
                </div>)}
              </div>
              <p className="mt-7 text-[10px] font-semibold uppercase tracking-wide text-red-600">Confidential · Not a contract</p>
            </div>
            <div className="border bg-white p-5 text-slate-800 shadow-sm sm:p-9">
              <div className="mb-6 flex items-center justify-between border-b border-red-600 pb-3">
                <img src={logoUrl} alt="ManWinWin" className="h-7 w-28 object-contain object-left"/>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Partnership proposal</span>
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-red-600">The partnership in context</p>
              <h3 className="mb-5 mt-2 text-xl font-extrabold text-slate-800">An opportunity worth exploring.</h3>
              {snapshot.sections.map(s=><section key={s.heading} className="mb-7 space-y-2">
                <h4 className="border-b border-red-500 pb-2 text-base font-extrabold text-slate-800">{s.heading}</h4>
                {s.paragraphs.map((p,i)=><p key={i} className="text-sm leading-relaxed text-slate-700">{p}</p>)}
                {!!s.bullets?.length && <div className="space-y-2">
                  {s.bullets.map((b,i)=><div key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="font-bold text-red-600">•</span><span>{b}</span>
                  </div>)}
                </div>}
                {s.heading.startsWith("03") && !!snapshot.responsibility_matrix?.length &&
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="w-full min-w-[420px] text-left text-xs">
                      <thead className="bg-slate-800 text-white">
                        <tr><th className="p-2">Activity</th><th className="p-2">{snapshot.prospect_name}</th><th className="p-2">ManWinWin</th></tr>
                      </thead>
                      <tbody>{snapshot.responsibility_matrix.map((r,i)=><tr key={i} className="border-t border-slate-200 bg-slate-50">
                        <td className="p-2 font-semibold">{r.activity}</td><td className="p-2">{r.partner}</td><td className="p-2">{r.manwinwin}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>}
              </section>)}
              {!!snapshot.evidence.length && <section className="space-y-2">
                <h4 className="border-b border-red-500 pb-2 text-base font-bold">Source register · HQ verified</h4>
                {snapshot.evidence.map((e,i)=><p key={i} className="text-xs text-slate-600">{i+1}. {e.title} — {e.finding}{e.url?" · "+e.url:""}</p>)}
              </section>}
              <p className="mt-8 border-t border-slate-200 pt-3 text-[10px] text-slate-400">
                ManWinWin · Confidential partnership discussion · Version {selected?.version||1}
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 space-y-2">
            <p className="font-semibold text-sm">Approval preflight</p>
            {snapshot.missing_inputs.length ? snapshot.missing_inputs.map(s=><p key={s} className="text-xs text-muted-foreground">• {s}</p>)
              : <p className="text-sm">All evidence prerequisites have been provided; HQ must still review the complete wording and commercial terms.</p>}
            {selected && <p className="text-xs text-muted-foreground">Version {selected.version} · {selected.status==="approved"?"Approved":"Draft pending review"}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {!selected && canEdit && <Button disabled={saveDocument.isPending} onClick={saveDraft}><FilePlus2 className="mr-2 h-4 w-4"/>Save Test Draft</Button>}
            {selected && <><Button size="sm" variant="outline" disabled={exportBusy} onClick={()=>exportDoc("docx")}><Download className="mr-2 h-4 w-4"/>DOCX</Button>
              <Button size="sm" variant="outline" disabled={exportBusy} onClick={()=>exportDoc("pdf")}><Download className="mr-2 h-4 w-4"/>PDF</Button></>}
            {selected && canEdit && <Button size="sm" variant="outline" onClick={()=>{setSelectedId("");setStep("details");}}>Prepare next version</Button>}
          </div>
          {selected?.status==="draft" && isAdmin && canEdit && <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-sm"><ShieldCheck className="h-4 w-4"/>HQ approval</div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={approvedReview} onChange={e=>setApprovedReview(e.target.checked)}/>
              <span>I have reviewed the content, checked the verified evidence and personally validated all proposed commercial conditions.</span>
            </label>
            <Button disabled={!canApprove||approveDocument.isPending} onClick={approve}><ClipboardCheck className="mr-2 h-4 w-4"/>Approve Proposal</Button>
            <p className="text-xs text-muted-foreground">HQ approval does not sign a contract, create a partner, or unlock PartnerOS access.</p>
          </div>}
          {!selected && <p className="text-xs text-muted-foreground">Save the versioned draft before export or HQ approval. Content cannot be silently overwritten.</p>}
        </TabsContent>
      </Tabs>}
    </CardContent>
  </Card>;
}
