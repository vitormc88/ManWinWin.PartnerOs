import { useParams, useNavigate } from "react-router-dom";
import { useIncomingLead, useUpdateIncomingLead, useDeleteIncomingLead } from "@/hooks/useIncomingLeads";
import { usePartners } from "@/hooks/usePartners";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  ArrowLeft, Building2, Trash2, Save, ArrowRight, CheckCircle2, XCircle,
  Plus, Sparkles, Clock, Wallet, Users, Lightbulb, AlertCircle,
  HelpCircle, Target, Mail, Phone, Globe, Briefcase, Compass, ShieldAlert, ShieldCheck,
  Wand2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { ConvertToOpportunityDialog } from "@/components/leads/ConvertToOpportunityDialog";
import { LeadTaskList } from "@/components/leads/LeadTaskList";
import { AddLeadTaskDialog } from "@/components/leads/AddLeadTaskDialog";
import { cn } from "@/lib/utils";
import {
  QUALIFICATION_STAGES, type QualificationStage,
  TIMD_CATEGORIES, CATEGORY_STATUSES, type CategoryStatus,
  resolvedStatus, autoStatusFromNotes,
  timdCompletion, fitScore, missingInformation, nextBestActions, topNextAction,
  suggestedQuestions, qualificationSignals, lastMeaningfulDiscovery, FIT_FACTORS,
  CURRENT_PROCESS_OPTIONS, MAIN_CHALLENGE_OPTIONS, EXISTING_SYSTEM_OPTIONS, DATA_VISIBILITY_OPTIONS,
  contextualGuidanceAll, discoveryInsights, positioningHelp, likelyRisks, knowledgeSnippets,
} from "@/lib/qualification";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, BookOpen, Megaphone, Search as SearchIcon } from "lucide-react";

const TIMD_ICONS = { Sparkles, Clock, Wallet, Users } as const;

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: lead, isLoading } = useIncomingLead(id);
  const { data: partners = [] } = usePartners();
  const updateLead = useUpdateIncomingLead();
  const deleteLead = useDeleteIncomingLead();
  const { isHQ, isAdmin } = useAuth();

  const isHQUser = isHQ || isAdmin;
  const activePartners = partners.filter((p) => p.is_active);

  const [draft, setDraft] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [openTimd, setOpenTimd] = useState<string>("");

  useEffect(() => {
    if (lead) {
      setDraft({ ...lead });
      setDirty(false);
    }
  }, [lead]);

  const set = (patch: Record<string, any>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const isConverted = !!draft?.converted_to_deal_id;
  const stage: QualificationStage = (draft.qualification_stage as QualificationStage) || "New";

  const timd = useMemo(() => timdCompletion(draft), [draft]);
  const fit = useMemo(() => fitScore(draft), [draft]);
  const signals = useMemo(() => qualificationSignals(draft), [draft]);
  const missing = useMemo(() => missingInformation(draft), [draft]);
  const actions = useMemo(() => nextBestActions(draft), [draft]);
  const topAction = useMemo(() => topNextAction(draft), [draft]);
  const discovery = useMemo(() => lastMeaningfulDiscovery(draft), [draft]);
  const questions = useMemo(() => suggestedQuestions(draft), [draft]);
  const guidance = useMemo(() => contextualGuidance(draft), [draft]);

  const handleSave = (extra: Record<string, any> = {}) => {
    if (!lead) return;
    const partnerId = draft.linked_partner_id === "__hq__" ? null : draft.linked_partner_id;
    const ownerType = partnerId ? "partner" : "HQ";
    const base: any = {
      id: lead.id,
      status: draft.status,
      qualification_stage: draft.qualification_stage,
      notes: draft.notes,
      interest_status: draft.interest_status,
      interest_notes: draft.interest_notes,
      timing_status: draft.timing_status,
      timing_notes: draft.timing_notes,
      budget_status: draft.budget_status,
      budget_notes: draft.budget_notes,
      decision_status: draft.decision_status,
      decision_notes: draft.decision_notes,
      current_process: draft.current_process,
      main_challenge: draft.main_challenge,
      existing_system: draft.existing_system,
      data_visibility: draft.data_visibility,
      disqualified_reason: draft.disqualified_reason,
      ...Object.fromEntries(FIT_FACTORS.map((f) => [f.key, !!draft[f.key]])),
      ...extra,
    };
    if (isHQUser) {
      base.linked_partner_id = partnerId;
      base.lead_owner_type = ownerType;
      base.routing_reason = draft.routing_reason;
    }
    updateLead.mutate(base, {
      onSuccess: () => {
        toast.success("Lead updated");
        setDirty(false);
      },
      onError: (e: any) => toast.error(e.message),
    });
  };

  const markQualified = () =>
    handleSave({ qualification_stage: "Qualified", status: "Qualified" });
  const markDisqualified = () =>
    handleSave({ qualification_stage: "Disqualified", status: "Rejected" });

  const handleDelete = () => {
    if (!lead) return;
    deleteLead.mutate(lead.id, {
      onSuccess: () => {
        toast.success("Lead deleted");
        navigate("/incoming-leads");
      },
      onError: (e: any) => toast.error(e.message),
    });
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading lead…</div>;
  if (!lead) return <div className="p-6 text-muted-foreground">Lead not found.</div>;

  const canConvert = stage === "Qualified" && !isConverted && isHQUser;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/incoming-leads")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{draft.company_name || "Unnamed Lead"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Created {format(new Date(lead.created_at), "dd MMM yyyy 'at' HH:mm")}
              {draft.contact_name ? ` · ${draft.contact_name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StageBadge stage={stage} />
          {draft.linked_partner_id && partners.find((p) => p.id === draft.linked_partner_id) ? (
            <Badge variant="secondary" className="gap-1">
              <Building2 className="h-3 w-3" />
              {partners.find((p) => p.id === draft.linked_partner_id)?.company_name}
            </Badge>
          ) : (
            <Badge variant="outline">HQ owned</Badge>
          )}
        </div>
      </div>

      {/* QUALIFICATION JOURNEY */}
      <QualificationJourney
        current={stage}
        onChange={(s) => set({ qualification_stage: s })}
        disabled={isConverted}
      />

      {/* TWO-COLUMN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        {/* MAIN */}
        <div className="space-y-5 min-w-0">
          {/* NEXT BEST ACTION — hero */}
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="rounded-md bg-primary/10 p-2.5 text-primary shrink-0">
                  <Target className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-primary mb-1">
                    Next best action
                  </div>
                  <div className="text-lg font-semibold leading-snug">{topAction.title}</div>
                  <p className="text-sm text-muted-foreground mt-1">{topAction.reason}</p>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Button size="sm" onClick={() => setShowAddTask(true)}>
                      <Plus className="h-3.5 w-3.5" /> Create task
                    </Button>
                    <Button
                      size="sm"
                      variant={canConvert ? "default" : "outline"}
                      onClick={() => setShowConvert(true)}
                      disabled={!isHQUser || isConverted}
                    >
                      <ArrowRight className="h-3.5 w-3.5" /> Convert to opportunity
                    </Button>
                    <Button size="sm" variant="outline" onClick={markQualified}
                      disabled={updateLead.isPending || isConverted || stage === "Qualified"}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark qualified
                    </Button>
                    <Button size="sm" variant="ghost" onClick={markDisqualified}
                      disabled={updateLead.isPending || isConverted}>
                      <XCircle className="h-3.5 w-3.5" /> Disqualify
                    </Button>
                    <div className="flex-1" />
                    <Button size="sm" variant="outline" onClick={() => handleSave()} disabled={!dirty || updateLead.isPending}>
                      <Save className="h-3.5 w-3.5" /> Save
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* LAST MEANINGFUL DISCOVERY */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Compass className="h-4 w-4 text-muted-foreground" />
                Last meaningful discovery
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">Built from captured data</span>
            </CardHeader>
            <CardContent className="pt-0">
              {discovery.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Nothing captured yet. Start a discovery call to surface the lead's real situation.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {discovery.map((d, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-foreground/40 shrink-0" />
                      <span className="leading-snug">{d}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* TABS */}
          <Tabs defaultValue="qualification" className="w-full">
            <TabsList>
              <TabsTrigger value="qualification">Qualification</TabsTrigger>
              <TabsTrigger value="situation">Situation</TabsTrigger>
              <TabsTrigger value="overview">Lead info</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="assignment">Assignment</TabsTrigger>
            </TabsList>

            {/* QUALIFICATION TAB */}
            <TabsContent value="qualification" className="space-y-5 mt-4">
              {/* TIMD ACCORDION */}
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Qualification checklist</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Interest · Timing · Budget · Decision
                    </p>
                  </div>
                  <div className="w-36">
                    <div className="text-[11px] text-muted-foreground mb-1 text-right">{timd.percent}% complete</div>
                    <Progress value={timd.percent} className="h-1.5" />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Accordion
                    type="single"
                    collapsible
                    value={openTimd}
                    onValueChange={setOpenTimd}
                    className="divide-y border-t"
                  >
                    {TIMD_CATEGORIES.map((c) => {
                      const Icon = TIMD_ICONS[c.icon as keyof typeof TIMD_ICONS];
                      const notes = draft[`${c.key}_notes`] || "";
                      const stored = draft[`${c.key}_status`];
                      const status = resolvedStatus(stored, notes);
                      const isAuto = !stored || stored === "missing"
                        ? autoStatusFromNotes(notes) === status && !stored
                        : false;
                      return (
                        <AccordionItem key={c.key} value={c.key} className="border-b-0 last:border-b-0">
                          <AccordionTrigger className="hover:no-underline py-3 px-1">
                            <div className="flex items-center justify-between gap-3 flex-1 pr-2">
                              <div className="flex items-center gap-2.5">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm">{c.label}</span>
                                {notes.trim() && (
                                  <span className="text-xs text-muted-foreground truncate max-w-[260px] hidden md:inline">
                                    — {notes.trim().slice(0, 60)}{notes.trim().length > 60 ? "…" : ""}
                                  </span>
                                )}
                              </div>
                              <StatusPill status={status} auto={isAuto} />
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-1 pb-4">
                            <Textarea
                              value={notes}
                              onChange={(e) => set({ [`${c.key}_notes`]: e.target.value })}
                              placeholder={c.prompt}
                              rows={2}
                              className="text-sm resize-none"
                            />
                            <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">
                                  Status
                                </span>
                                {CATEGORY_STATUSES.map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => set({ [`${c.key}_status`]: s })}
                                    className={cn(
                                      "px-2 py-0.5 rounded-full text-[11px] border transition capitalize",
                                      stored === s
                                        ? statusPillClass(s)
                                        : "border-transparent bg-muted text-muted-foreground hover:bg-muted/70",
                                    )}
                                  >
                                    {s}
                                  </button>
                                ))}
                                {stored && stored !== "missing" && (
                                  <button
                                    type="button"
                                    onClick={() => set({ [`${c.key}_status`]: null })}
                                    className="text-[11px] text-muted-foreground hover:text-foreground ml-1 inline-flex items-center gap-1"
                                    title="Use auto-detected status"
                                  >
                                    <Wand2 className="h-3 w-3" /> auto
                                  </button>
                                )}
                              </div>
                            </div>
                            {c.questions?.length ? (
                              <div className="mt-3 rounded-md bg-muted/40 p-2.5">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                                  Try asking
                                </div>
                                <ul className="space-y-1 text-xs text-muted-foreground">
                                  {c.questions.map((q, i) => (
                                    <li key={i}>“{q}”</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>

              {/* QUALIFICATION SIGNALS */}
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">Qualification signals</CardTitle>
                  <FitBadge label={fit.label} tone={fit.tone} score={fit.score} total={fit.total} />
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Positive signals */}
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-success font-semibold mb-2">
                      <ShieldCheck className="h-3.5 w-3.5" /> Positive signals
                    </div>
                    {signals.positive.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">None captured yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {signals.positive.map((s) => (
                          <li key={s.key} className="text-sm flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" /> {s.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {/* Risks */}
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-warning-foreground font-semibold mb-2">
                      <ShieldAlert className="h-3.5 w-3.5" /> Potential risks
                    </div>
                    {signals.risks.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No risks detected.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {signals.risks.slice(0, 6).map((s) => (
                          <li key={s.key} className="text-sm flex items-center gap-2 text-muted-foreground">
                            <AlertCircle className="h-3.5 w-3.5 text-warning-foreground shrink-0" /> {s.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
                <div className="px-6 pb-4 -mt-2">
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">Adjust signals manually</summary>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {FIT_FACTORS.map((f) => (
                        <label key={f.key} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-input"
                            checked={!!draft[f.key]}
                            onChange={(e) => set({ [f.key]: e.target.checked })}
                          />
                          <span>{f.label}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                </div>
              </Card>

              {stage === "Disqualified" && (
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-destructive">Disqualification reason</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={draft.disqualified_reason || ""}
                      onChange={(e) => set({ disqualified_reason: e.target.value })}
                      placeholder="Why was this lead disqualified?"
                      rows={3}
                    />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* SITUATION TAB */}
            <TabsContent value="situation" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Current situation</CardTitle>
                  <p className="text-xs text-muted-foreground">How they operate today.</p>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <PickerField label="Current process" value={draft.current_process}
                    options={CURRENT_PROCESS_OPTIONS} onChange={(v) => set({ current_process: v })} />
                  <PickerField label="Main challenge" value={draft.main_challenge}
                    options={MAIN_CHALLENGE_OPTIONS} onChange={(v) => set({ main_challenge: v })} />
                  <PickerField label="Existing system" value={draft.existing_system}
                    options={EXISTING_SYSTEM_OPTIONS} onChange={(v) => set({ existing_system: v })} />
                  <PickerField label="Data visibility" value={draft.data_visibility}
                    options={DATA_VISIBILITY_OPTIONS} onChange={(v) => set({ data_visibility: v })} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* OVERVIEW */}
            <TabsContent value="overview" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Lead overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <Info icon={Building2} label="Company" value={draft.company_name} />
                    <Info icon={Users} label="Contact" value={draft.contact_name} />
                    <Info icon={Briefcase} label="Job role" value={draft.job_role} />
                    <Info icon={Mail} label="Email" value={draft.email} />
                    <Info icon={Phone} label="Phone" value={draft.phone} />
                    <Info icon={Globe} label="Country" value={draft.country} />
                    <Info icon={Target} label="Source" value={draft.lead_source} />
                    <Info label="Asset range" value={draft.asset_range} />
                    <Info label="Maintenance team" value={draft.maintenance_team_size} />
                    <Info label="Sector" value={draft.sector} />
                    <Info label="SharpSpring ID" value={draft.sharpspring_id} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* NOTES TAB */}
            <TabsContent value="notes" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Internal notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={draft.notes || ""}
                    onChange={(e) => set({ notes: e.target.value })}
                    rows={8}
                    placeholder="Add internal notes about this lead…"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* TASKS */}
            <TabsContent value="tasks" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <LeadTaskList
                    leadId={lead.id}
                    leadCompanyName={lead.company_name || "Unnamed Lead"}
                    linkedPartnerId={lead.linked_partner_id}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ASSIGNMENT */}
            <TabsContent value="assignment" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Assignment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Assigned partner</Label>
                    {isHQUser ? (
                      <Select
                        value={draft.linked_partner_id || "__hq__"}
                        onValueChange={(v) => set({ linked_partner_id: v === "__hq__" ? null : v })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__hq__">No partner (HQ owned)</SelectItem>
                          {activePartners
                            .sort((a, b) => a.company_name.localeCompare(b.company_name))
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.company_name} {p.country ? `(${p.country})` : ""}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="mt-1 font-medium">
                        {partners.find((p) => p.id === draft.linked_partner_id)?.company_name || "HQ"}
                      </p>
                    )}
                  </div>
                  {isHQUser && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Routing reason</Label>
                      <Input
                        className="mt-1"
                        value={draft.routing_reason || ""}
                        onChange={(e) => set({ routing_reason: e.target.value })}
                        placeholder="Why was this lead routed this way?"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {isAdmin && (
                <Card className="border-destructive/30">
                  <CardContent className="pt-6 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Permanently delete this lead record.</p>
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteLead.isPending}>
                      <Trash2 className="h-4 w-4" /> Delete lead
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>

          {isConverted && (
            <Card className="border-success/30 bg-success/5">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Converted to pipeline opportunity</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate(`/deals/${draft.converted_to_deal_id}`)}>
                  <ArrowRight className="h-4 w-4" /> View opportunity
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT SIDEBAR – QUALIFICATION ASSISTANT */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Qualification Assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Next best actions */}
              <AsstSection icon={Target} title="What to do next">
                <ul className="space-y-1.5 text-sm">
                  {actions.map((a, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={cn(
                        "mt-1.5 h-1.5 w-1.5 rounded-full shrink-0",
                        i === 0 ? "bg-primary" : "bg-muted-foreground/40",
                      )} />
                      <span className={i === 0 ? "font-medium" : "text-muted-foreground"}>{a}</span>
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setShowAddTask(true)}>
                  <Plus className="h-3.5 w-3.5" /> Create task
                </Button>
              </AsstSection>

              {/* Missing information */}
              <AsstSection
                icon={AlertCircle}
                title="Missing information"
                badge={missing.length ? String(missing.length) : undefined}
              >
                {missing.length === 0 ? (
                  <p className="text-xs text-muted-foreground">All key information captured.</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {missing.map((m, i) => (
                      <li key={i} className="text-muted-foreground">• {m}</li>
                    ))}
                  </ul>
                )}
              </AsstSection>

              {/* Contextual guidance — pains + prompts + positioning */}
              {guidance && (
                <AsstSection icon={Lightbulb} title={guidance.title}>
                  {guidance.pains?.length ? (
                    <div className="mb-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        Common pains
                      </div>
                      <ul className="space-y-0.5 text-xs">
                        {guidance.pains.map((g, i) => (
                          <li key={i} className="text-muted-foreground">• {g}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {guidance.prompts?.length ? (
                    <div className="mb-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        Discovery prompts
                      </div>
                      <ul className="space-y-0.5 text-xs">
                        {guidance.prompts.map((g, i) => (
                          <li key={i} className="text-muted-foreground">“{g}”</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {guidance.positioning?.length ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        Positioning angles
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {guidance.positioning.map((g, i) => (
                          <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </AsstSection>
              )}

              {/* Generic suggested questions (fallback / always-on) */}
              <AsstSection icon={HelpCircle} title="Suggested questions">
                <ul className="space-y-1 text-xs">
                  {questions.slice(0, 4).map((q, i) => (
                    <li key={i} className="text-muted-foreground leading-snug">“{q}”</li>
                  ))}
                </ul>
              </AsstSection>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Dialogs */}
      {lead && (
        <ConvertToOpportunityDialog open={showConvert} onOpenChange={setShowConvert} lead={lead} />
      )}
      <AddLeadTaskDialog
        open={showAddTask}
        onOpenChange={setShowAddTask}
        leadId={lead.id}
        leadCompanyName={lead.company_name || "Unnamed Lead"}
        linkedPartnerId={lead.linked_partner_id}
      />
    </div>
  );
}

/* ---------- helpers ---------- */

function Info({ icon: Icon, label, value }: { icon?: any; label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </div>
      <div className="mt-0.5 font-medium truncate">{value || "—"}</div>
    </div>
  );
}

function PickerField({
  label, value, options, onChange,
}: { label: string; value: any; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="mt-1">
          <SelectValue placeholder={`Select ${label.toLowerCase()}…`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function QualificationJourney({
  current, onChange, disabled,
}: { current: QualificationStage; onChange: (s: QualificationStage) => void; disabled?: boolean }) {
  const stages = QUALIFICATION_STAGES.filter((s) => s !== "Disqualified");
  const currentIdx = stages.indexOf(current as any);
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 overflow-x-auto">
        {stages.map((s, i) => {
          const isActive = i === currentIdx;
          const isDone = currentIdx > -1 && i < currentIdx;
          return (
            <div key={s} className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(s)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition",
                  isActive && "bg-primary text-primary-foreground border-primary",
                  isDone && !isActive && "bg-success/10 text-success border-success/30",
                  !isActive && !isDone && "bg-muted text-muted-foreground border-transparent hover:bg-muted/70",
                  disabled && "opacity-60 cursor-not-allowed",
                )}
              >
                {s}
              </button>
              {i < stages.length - 1 && <span className="h-px w-6 bg-border" />}
            </div>
          );
        })}
        {current === "Disqualified" && (
          <Badge variant="destructive" className="ml-2">Disqualified</Badge>
        )}
      </div>
    </div>
  );
}

function StageBadge({ stage }: { stage: QualificationStage }) {
  const map: Record<QualificationStage, string> = {
    New: "bg-info/10 text-info border-info/20",
    Qualification: "bg-warning/15 text-warning-foreground border-warning/20",
    "Discovery Call": "bg-purple-100 text-purple-800 border-purple-200",
    Qualified: "bg-success/10 text-success border-success/20",
    Converted: "bg-primary/10 text-primary border-primary/20",
    Disqualified: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return <Badge className={cn("border", map[stage])}>{stage}</Badge>;
}

function FitBadge({ label, tone, score, total }: {
  label: string; tone: "success" | "warning" | "destructive"; score: number; total: number;
}) {
  const cls = {
    success: "bg-success/10 text-success border-success/30",
    warning: "bg-warning/15 text-warning-foreground border-warning/30",
    destructive: "bg-destructive/10 text-destructive border-destructive/30",
  }[tone];
  return (
    <div className={cn("px-3 py-1 rounded-full text-xs font-medium border", cls)}>
      {label} · {score}/{total}
    </div>
  );
}

function statusPillClass(s: string) {
  if (s === "complete") return "bg-success/15 text-success border-success/30";
  if (s === "partial") return "bg-warning/20 text-warning-foreground border-warning/30";
  return "bg-destructive/10 text-destructive border-destructive/30";
}

function StatusPill({ status, auto }: { status: CategoryStatus; auto?: boolean }) {
  return (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-[11px] border capitalize flex items-center gap-1",
      statusPillClass(status),
    )}>
      {auto && <Wand2 className="h-2.5 w-2.5 opacity-70" />}
      {status}
    </span>
  );
}

function AsstSection({
  icon: Icon, title, badge, children,
}: { icon: any; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </div>
        {badge && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{badge}</Badge>}
      </div>
      {children}
    </div>
  );
}
