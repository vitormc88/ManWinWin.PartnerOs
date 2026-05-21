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
  Wand2, Copy, PhoneCall, MailPlus, Leaf, Activity as ActivityIcon, Gauge,
  User as UserIcon, History, ListChecks, UserCheck, CheckSquare, CircleDot, Leaf as LeafIcon,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { ConvertToOpportunityDialog } from "@/components/leads/ConvertToOpportunityDialog";
import { LeadTaskList } from "@/components/leads/LeadTaskList";
import { AddLeadTaskDialog } from "@/components/leads/AddLeadTaskDialog";
import { LogContactAttemptDialog } from "@/components/leads/LogContactAttemptDialog";
import { DisqualifyLeadDialog } from "@/components/leads/DisqualifyLeadDialog";
import { MoveToNurtureDialog } from "@/components/leads/MoveToNurtureDialog";
import { SendEmailDialog } from "@/components/leads/SendEmailDialog";
import { OutreachIntelligence } from "@/components/leads/OutreachIntelligence";
import type { PlayKey } from "@/lib/outreach";
import { useLeadContactAttempts, OUTCOME_LABEL, CHANNEL_LABEL } from "@/hooks/useLeadContactAttempts";
import { useLeadTasks } from "@/hooks/useLeadTasks";
import { usePartnerUsers } from "@/hooks/usePartnerUsers";
import { useHQUsers } from "@/hooks/useHQUsers";
import { cn } from "@/lib/utils";
import {
  QUALIFICATION_STAGES, type QualificationStage, normalizeStage, lifecycleFromStage,
  engagementLabel,
  TIMD_CATEGORIES, CATEGORY_STATUSES, type CategoryStatus,
  resolvedStatus, autoStatusFromNotes,
  timdCompletion, fitScore, missingInformation, nextBestActions, topNextAction,
  suggestedQuestions, qualificationSignals, lastMeaningfulDiscovery, FIT_FACTORS,
  CURRENT_PROCESS_OPTIONS, MAIN_CHALLENGE_OPTIONS, EXISTING_SYSTEM_OPTIONS, DATA_VISIBILITY_OPTIONS,
  contextualGuidanceAll, discoveryInsights, positioningHelp, likelyRisks, knowledgeSnippets,
  splitPositioning,
  cadenceGuidance, attemptCounts, slaBucket, nextBestActionDynamic, qualificationReadiness,
} from "@/lib/qualification";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [showConvertGate, setShowConvertGate] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showLogContact, setShowLogContact] = useState(false);
  const [showDisqualify, setShowDisqualify] = useState(false);
  const [showNurture, setShowNurture] = useState(false);
  const [showSendEmail, setShowSendEmail] = useState(false);
  const [emailPlay, setEmailPlay] = useState<PlayKey | undefined>(undefined);
  const openSendEmail = (play?: PlayKey) => {
    setEmailPlay(play);
    setShowSendEmail(true);
  };
  const [openTimd, setOpenTimd] = useState<string>("");

  const { data: attempts = [] } = useLeadContactAttempts(id);
  const { data: tasks = [] } = useLeadTasks(id);
  const { data: partnerUsers = [] } = usePartnerUsers(lead?.linked_partner_id || null);
  const { data: hqUsers = [] } = useHQUsers();

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
  const stage: QualificationStage = normalizeStage(draft.qualification_stage as any);

  const timd = useMemo(() => timdCompletion(draft), [draft]);
  const fit = useMemo(() => fitScore(draft), [draft]);
  const signals = useMemo(() => qualificationSignals(draft), [draft]);
  const missing = useMemo(() => missingInformation(draft), [draft]);
  const actions = useMemo(() => nextBestActions(draft), [draft]);
  const discovery = useMemo(() => lastMeaningfulDiscovery(draft), [draft]);
  const questions = useMemo(() => suggestedQuestions(draft), [draft]);
  const guidanceBlocks = useMemo(() => contextualGuidanceAll(draft), [draft]);
  const insights = useMemo(() => discoveryInsights(draft), [draft]);
  const positioning = useMemo(() => positioningHelp(draft), [draft]);
  const risks = useMemo(() => likelyRisks(draft), [draft]);
  const snippets = useMemo(() => knowledgeSnippets(draft), [draft]);

  const counts = useMemo(() => attemptCounts(attempts as any), [attempts]);
  const cadence = useMemo(() => cadenceGuidance(attempts as any), [attempts]);
  const sla = useMemo(() => slaBucket(lead?.created_at, (draft as any).last_contact_at), [lead?.created_at, draft]);
  const dynamicNba = useMemo(
    () => nextBestActionDynamic(draft, attempts as any, tasks as any),
    [draft, attempts, tasks],
  );
  const readiness = useMemo(() => qualificationReadiness(draft), [draft]);
  const openTasksCount = useMemo(() => tasks.filter((t: any) => t.status !== "Done").length, [tasks]);

  const allAssignableUsers = useMemo(() => {
    const list = [...(hqUsers || []), ...(partnerUsers || [])];
    const seen = new Set<string>();
    return list.filter((u: any) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
  }, [hqUsers, partnerUsers]);

  const assignedUser = useMemo(
    () => allAssignableUsers.find((u: any) => u.id === (draft as any).assigned_user_id) || null,
    [allAssignableUsers, draft],
  );

  const timeline = useMemo(
    () => buildTimeline({ lead: draft, attempts: attempts as any, tasks: tasks as any, assignedUser }),
    [draft, attempts, tasks, assignedUser],
  );

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

  // Stage button click — also keeps lifecycle status aligned.
  const setStage = (s: QualificationStage) => {
    set({ qualification_stage: s, status: lifecycleFromStage(s) });
  };


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
    <div className="pb-6 max-w-[1400px] mx-auto">
      {/* COMPACT TOP HEADER (non-sticky) */}
      <div className="px-6 pt-4 pb-2 flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/incoming-leads")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight truncate">{draft.company_name || "Unnamed Lead"}</h1>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Created {format(new Date(lead.created_at), "dd MMM yyyy")}
            {draft.contact_name ? ` · ${draft.contact_name}` : ""}
            {draft.job_role ? ` · ${draft.job_role}` : ""}
          </p>
        </div>
        <div className="flex-1" />
        <StageBadge stage={stage} />
        {draft.linked_partner_id && partners.find((p) => p.id === draft.linked_partner_id) ? (
          <Badge variant="secondary" className="gap-1 text-[11px]">
            <Building2 className="h-3 w-3" />
            {partners.find((p) => p.id === draft.linked_partner_id)?.company_name}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[11px]">HQ owned</Badge>
        )}
      </div>

      {/* STICKY OPERATIONAL ACTION BAR */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
        <div className="px-6 py-2 space-y-2">
          {/* Row 1: context + engagement chips + NBA */}
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px]">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              {draft.email && (
                <a href={`mailto:${draft.email}`} className="inline-flex items-center gap-1 hover:text-foreground truncate max-w-[180px]">
                  <Mail className="h-3 w-3" />{draft.email}
                </a>
              )}
              {draft.phone && (
                <a href={`tel:${draft.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Phone className="h-3 w-3" />{draft.phone}
                </a>
              )}
              {draft.country && (
                <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{draft.country}</span>
              )}
              <span className="inline-flex items-center gap-1">
                <UserIcon className="h-3 w-3" />
                {assignedUser ? (assignedUser as any).full_name || (assignedUser as any).email : "Unassigned"}
              </span>
            </div>
            <span className="h-3 w-px bg-border" />
            <Badge variant="outline" className="gap-1 text-[10px] h-5 px-1.5" title="Communication state — not a business status">
              <ActivityIcon className="h-2.5 w-2.5" /> {engagementLabel((draft as any).engagement_status)}
            </Badge>

            <span className="text-muted-foreground">
              <PhoneCall className="h-3 w-3 inline mr-0.5" />{counts.calls}
              <Mail className="h-3 w-3 inline ml-2 mr-0.5" />{counts.emails}
            </span>
            {(draft as any).last_contact_at ? (
              <span className="text-muted-foreground">
                · last {formatDistanceToNow(new Date((draft as any).last_contact_at), { addSuffix: true })}
              </span>
            ) : (
              <span className="text-muted-foreground">· no activity yet</span>
            )}
            <Badge className={cn(
              "gap-1 text-[10px] h-5 px-1.5 border",
              sla.bucket === "healthy" && "bg-success/10 text-success border-success/30",
              sla.bucket === "warning" && "bg-warning/15 text-warning-foreground border-warning/30",
              sla.bucket === "critical" && "bg-destructive/10 text-destructive border-destructive/30",
            )}>
              <Clock className="h-2.5 w-2.5" /> {sla.label}
            </Badge>
            <div className="flex-1" />
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <Target className="h-3 w-3 text-primary" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Next:</span>
              <span className="font-medium truncate max-w-[260px]" title={dynamicNba.reason}>{dynamicNba.title}</span>
            </span>
          </div>

          {/* Row 2: action buttons + stage progression */}
          <div className="flex items-center gap-1 flex-wrap">
            {draft.phone && (
              <Button size="sm" variant="outline" className="h-8" asChild>
                <a href={`tel:${draft.phone}`}><PhoneCall className="h-3.5 w-3.5" /> Call</a>
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8" onClick={() => setShowLogContact(true)} disabled={isConverted}>
              <CheckSquare className="h-3.5 w-3.5" /> Log activity
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => openSendEmail()} disabled={!draft.email}>
              <MailPlus className="h-3.5 w-3.5" /> Send email
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => setShowAddTask(true)} disabled={isConverted}>
              <Plus className="h-3.5 w-3.5" /> Task
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowNurture(true)} disabled={isConverted}>
              <Leaf className="h-3.5 w-3.5" /> Nurture
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowDisqualify(true)} disabled={isConverted}>
              <XCircle className="h-3.5 w-3.5" /> Disqualify
            </Button>
            <Button
              size="sm"
              variant={canConvert ? "default" : "outline"}
              className="h-8"
              onClick={() => {
                if (!isHQUser || isConverted) return;
                if (!readiness.ready) setShowConvertGate(true);
                else setShowConvert(true);
              }}
              disabled={!isHQUser || isConverted}
            >
              <ArrowRight className="h-3.5 w-3.5" /> Convert
            </Button>
            <div className="flex-1" />
            <div className="hidden md:flex items-center gap-1 mr-2">
              {QUALIFICATION_STAGES.filter((s) => s !== "Disqualified").map((s, i, arr) => {
                const cur = arr.indexOf(stage as any);
                const isActive = i === cur;
                const isDone = cur > -1 && i < cur;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={isConverted}
                    onClick={() => setStage(s as QualificationStage)}
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-medium border transition",
                      isActive && "bg-primary text-primary-foreground border-primary",
                      isDone && !isActive && "bg-success/10 text-success border-success/30",
                      !isActive && !isDone && "bg-muted text-muted-foreground border-transparent hover:bg-muted/70",
                      isConverted && "opacity-60 cursor-not-allowed",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <Button size="sm" variant="outline" className="h-8" onClick={() => handleSave()} disabled={!dirty || updateLead.isPending}>
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </div>
      </div>

      {/* TWO-COLUMN LAYOUT */}
      <div className="px-6 pt-4 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
        {/* MAIN */}
        <div className="space-y-3 min-w-0">
          {/* COMPACT GUIDANCE STRIP: Cadence · Readiness · Discovery */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <CompactDisclosure icon={Gauge} title="Cadence" summary={cadence.step} tone="neutral">
              <ul className="space-y-1 text-xs">
                {cadence.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="mt-1 h-1 w-1 rounded-full bg-foreground/40 shrink-0" />
                    <span className="leading-snug">{s}</span>
                  </li>
                ))}
              </ul>
            </CompactDisclosure>

            <CompactDisclosure
              icon={ShieldCheck}
              title="Readiness"
              summary={`${readiness.done}/${readiness.total}${readiness.ready ? " · ready" : ""}`}
              tone={readiness.ready ? "success" : "neutral"}
            >
              <ul className="space-y-1 text-xs">
                {readiness.items.map((it) => (
                  <li key={it.key} className="flex items-center gap-1.5">
                    {it.done
                      ? <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                      : <AlertCircle className="h-3 w-3 text-muted-foreground shrink-0" />}
                    <span className={it.done ? "" : "text-muted-foreground"}>{it.label}</span>
                  </li>
                ))}
              </ul>
            </CompactDisclosure>

            <CompactDisclosure
              icon={Compass}
              title="Discovery"
              summary={discovery.length === 0 ? "Not captured yet" : `${discovery.length} insight${discovery.length === 1 ? "" : "s"}`}
              tone={discovery.length === 0 ? "muted" : "neutral"}
            >
              {discovery.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Capture current process, system or main challenge to surface insights.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {discovery.map((d, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="mt-1 h-1 w-1 rounded-full bg-foreground/40 shrink-0" />
                      <span className="leading-snug">{d}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CompactDisclosure>
          </div>

          {/* OUTREACH INTELLIGENCE — distinct from Qualification Assistant.
              Focus: contact strategy, cadence guidance, plays, micro-discovery. */}
          <OutreachIntelligence
            lead={draft}
            attempts={attempts as any}
            onSendEmail={(k) => openSendEmail(k)}
            onLogActivity={() => setShowLogContact(true)}
          />


          {/* TABS */}
          <Tabs defaultValue="qualification" className="w-full">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="qualification">Qualification</TabsTrigger>
              <TabsTrigger value="situation">Situation</TabsTrigger>
              <TabsTrigger value="overview">Lead info</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="tasks" className="gap-1.5">
                Tasks
                {openTasksCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{openTasksCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5">
                Activity
                {timeline.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{timeline.length}</Badge>
                )}
              </TabsTrigger>
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

            {/* ACTIVITY TIMELINE — real events only */}
            <TabsContent value="activity" className="mt-4">
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" /> Activity timeline
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Real operational events stored in the system. No synthetic entries.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setShowLogContact(true)} disabled={isConverted}>
                    <PhoneCall className="h-3.5 w-3.5" /> Log activity
                  </Button>
                </CardHeader>
                <CardContent>
                  {timeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      No operational events yet.
                    </p>
                  ) : (
                    <ol className="relative border-l border-border ml-2 space-y-4">
                      {timeline.map((ev) => (
                        <li key={ev.id} className="ml-4">
                          <span className={cn(
                            "absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-background",
                            ev.tone === "success" && "bg-success",
                            ev.tone === "warning" && "bg-warning",
                            ev.tone === "destructive" && "bg-destructive",
                            ev.tone === "neutral" && "bg-muted-foreground",
                            ev.tone === "primary" && "bg-primary",
                          )} />
                          <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <div className="text-sm font-medium leading-snug">{ev.title}</div>
                            <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {format(new Date(ev.at), "dd MMM yyyy · HH:mm")}
                            </div>
                          </div>
                          {ev.detail && (
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{ev.detail}</p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
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

                  {/* Assigned owner — saved immediately so the trigger fires
                      and SLA/ownership context updates without a manual Save. */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Assigned owner</Label>
                    <Select
                      value={(draft as any).assigned_user_id || "__none__"}
                      onValueChange={(v) => {
                        const next = v === "__none__" ? null : v;
                        set({ assigned_user_id: next });
                        updateLead.mutate(
                          { id: lead.id, assigned_user_id: next as any },
                          {
                            onSuccess: () =>
                              toast.success(next ? "Owner assigned — notification sent" : "Owner cleared"),
                            onError: (e: any) => toast.error(e.message),
                          },
                        );
                      }}
                      disabled={isConverted || allAssignableUsers.length === 0}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {allAssignableUsers.map((u: any) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.full_name || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(draft as any).assigned_at && (draft as any).assigned_user_id && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Assigned {formatDistanceToNow(new Date((draft as any).assigned_at), { addSuffix: true })}
                      </p>
                    )}
                  </div>
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
              <p className="text-[11px] text-muted-foreground">
                Contextual coaching. Updates as you capture discovery.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Always-visible: What to do next */}
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

              {/* Single-expand accordion — only one section open at a time.
                  Order = visual priority: missing → insights → guidance → questions → emphasize → risks → snippets */}
              <SingleAccordion
                defaultValue={missing.length > 0 ? "missing" : "insights"}
                sections={[
                  {
                    value: "missing",
                    icon: AlertCircle,
                    title: "Missing information",
                    count: missing.length,
                    empty: "All key information captured.",
                    render: () => (
                      <ul className="space-y-1 text-xs">
                        {missing.map((m, i) => (<li key={i} className="text-muted-foreground">• {m}</li>))}
                      </ul>
                    ),
                  },
                  {
                    value: "insights",
                    icon: SearchIcon,
                    title: "Discovery insights",
                    count: insights.length,
                    empty: "Capture current process, system or challenge to surface insights.",
                    render: () => (
                      <ul className="space-y-1">
                        {insights.map((i) => (
                          <li key={i.id} className="flex items-start gap-2 text-xs">
                            <span className={cn(
                              "mt-1 h-1.5 w-1.5 rounded-full shrink-0",
                              i.tone === "positive" && "bg-success",
                              i.tone === "warning" && "bg-warning",
                              i.tone === "neutral" && "bg-muted-foreground/50",
                            )} />
                            <span className={i.tone === "warning" ? "text-foreground" : "text-muted-foreground"}>
                              {i.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ),
                  },
                  ...(guidanceBlocks.length > 0 ? [{
                    value: "guidance",
                    icon: Lightbulb,
                    title: "Contextual guidance",
                    count: guidanceBlocks.length,
                    render: () => (
                      <div className="space-y-3">
                        {guidanceBlocks.map((g) => {
                          const split = splitPositioning(g.positioning);
                          return (
                            <div key={g.id} className="rounded-md border bg-card/40 p-2.5">
                              <div className="text-xs font-semibold text-foreground mb-2">{g.title}</div>
                              {g.pains?.length ? (
                                <Subsection label="Common pains">
                                  <TopList items={g.pains} limit={3} className="text-xs text-muted-foreground" />
                                </Subsection>
                              ) : null}
                              {g.prompts?.length ? (
                                <Subsection label="Try asking">
                                  <TopList items={g.prompts} limit={3} quote className="text-xs text-muted-foreground" />
                                </Subsection>
                              ) : null}
                              {split.businessValue.length ? (
                                <Subsection label="Business value">
                                  <ChipList items={split.businessValue.slice(0, 3)} tone="primary" />
                                </Subsection>
                              ) : null}
                              {split.capabilities.length ? (
                                <Subsection label="Product capabilities">
                                  <ChipList items={split.capabilities.slice(0, 3)} tone="muted" />
                                </Subsection>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ),
                  }] : []),
                  {
                    value: "questions",
                    icon: HelpCircle,
                    title: "Suggested questions",
                    count: Math.min(questions.length, 3),
                    render: () => (
                      <TopList items={questions} limit={3} quote className="text-xs text-muted-foreground leading-snug" />
                    ),
                  },
                  ...(positioning.length > 0 ? [{
                    value: "emphasize",
                    icon: Megaphone,
                    title: "What to emphasize",
                    count: Math.min(positioning.length, 3),
                    render: () => (
                      <ul className="space-y-2">
                        {positioning.slice(0, 3).map((p) => (
                          <li key={p.id} className="text-xs">
                            <div className="font-medium text-foreground">{p.emphasis}</div>
                            <div className="text-muted-foreground leading-snug">{p.reason}</div>
                          </li>
                        ))}
                      </ul>
                    ),
                  }] : []),
                  ...(risks.length > 0 ? [{
                    value: "risks",
                    icon: ShieldAlert,
                    title: "Likely risks",
                    count: risks.length,
                    render: () => (
                      <ul className="space-y-2">
                        {risks.slice(0, 3).map((r) => (
                          <li key={r.id} className="text-xs">
                            <div className="font-medium text-foreground">{r.label}</div>
                            <div className="text-muted-foreground leading-snug">{r.hint}</div>
                          </li>
                        ))}
                      </ul>
                    ),
                  }] : []),
                  ...(snippets.length > 0 ? [{
                    value: "snippets",
                    icon: BookOpen,
                    title: "Positioning snippets",
                    count: snippets.length,
                    render: () => (
                      <ul className="space-y-2">
                        {snippets.slice(0, 3).map((s) => (
                          <li key={s.id} className="text-xs">
                            <div className="font-medium text-foreground">{s.title}</div>
                            <div className="text-muted-foreground leading-snug">{s.body}</div>
                          </li>
                        ))}
                      </ul>
                    ),
                  }] : []),
                ]}
              />
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
      <LogContactAttemptDialog
        open={showLogContact}
        onOpenChange={setShowLogContact}
        leadId={lead.id}
      />
      <DisqualifyLeadDialog
        open={showDisqualify}
        onOpenChange={setShowDisqualify}
        leadId={lead.id}
      />
      <MoveToNurtureDialog
        open={showNurture}
        onOpenChange={setShowNurture}
        leadId={lead.id}
      />
      <SendEmailDialog
        open={showSendEmail}
        onOpenChange={setShowSendEmail}
        to={draft.email}
        contactName={draft.contact_name}
        companyName={draft.company_name}
        lead={draft}
        initialPlay={emailPlay}
      />
      <AlertDialog open={showConvertGate} onOpenChange={setShowConvertGate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cover the missing qualification items first</AlertDialogTitle>
            <AlertDialogDescription>
              The following items should be covered before this lead enters the pipeline:
              <ul className="mt-2 list-disc pl-5 space-y-0.5 text-sm">
                {readiness.missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back to qualification</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowConvertGate(false);
                setShowConvert(true);
              }}
            >
              Convert anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    Attempted: "bg-warning/15 text-warning-foreground border-warning/20",
    Contacted: "bg-purple-100 text-purple-800 border-purple-200",
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

function CompactDisclosure({
  icon: Icon, title, summary, tone = "neutral", children,
}: {
  icon?: any; title: string; summary: string;
  tone?: "neutral" | "success" | "muted"; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-2.5 py-1.5 hover:bg-muted/40 rounded-md">
        <div className="flex items-center gap-1.5 min-w-0">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="text-xs font-medium text-foreground">{title}</span>
          <span className={cn(
            "text-[11px] truncate",
            tone === "success" && "text-success",
            tone === "muted" && "text-muted-foreground italic",
            tone === "neutral" && "text-muted-foreground",
          )}>· {summary}</span>
        </div>
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2.5 pb-2.5 pt-1 border-t">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function CollapsibleSection({
  icon: Icon, title, count, defaultOpen, emptyHint, compact, children,
}: {
  icon?: any; title: string; count?: number; defaultOpen?: boolean;
  emptyHint?: string; compact?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const isEmpty = count === 0;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("rounded-md border bg-card/40", compact && "border-dashed")}>
      <CollapsibleTrigger className="flex w-full items-center justify-between px-2.5 py-2 hover:bg-muted/40 rounded-md">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          <span className="normal-case tracking-normal text-foreground">{title}</span>
          {typeof count === "number" && count > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{count}</Badge>
          )}
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2.5 pb-2.5 pt-1">
        {isEmpty && emptyHint ? (
          <p className="text-xs text-muted-foreground italic">{emptyHint}</p>
        ) : (
          children
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function Subsection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

type AsstAccordionSection = {
  value: string;
  icon?: any;
  title: string;
  count?: number;
  empty?: string;
  render: () => React.ReactNode;
};

function SingleAccordion({ sections, defaultValue }: { sections: AsstAccordionSection[]; defaultValue?: string }) {
  const [open, setOpen] = useState<string>(defaultValue || "");
  return (
    <div className="space-y-1.5">
      {sections.map((s) => {
        const isOpen = open === s.value;
        const isEmpty = s.count === 0;
        return (
          <div key={s.value} className="rounded-md border bg-card/40">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? "" : s.value)}
              className="flex w-full items-center justify-between px-2.5 py-2 hover:bg-muted/40 rounded-md"
            >
              <div className="flex items-center gap-1.5 text-xs">
                {s.icon && <s.icon className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="font-medium text-foreground">{s.title}</span>
                {typeof s.count === "number" && s.count > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{s.count}</Badge>
                )}
              </div>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="px-2.5 pb-2.5 pt-1">
                {isEmpty && s.empty ? (
                  <p className="text-xs text-muted-foreground italic">{s.empty}</p>
                ) : (
                  s.render()
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TopList({
  items, limit = 3, quote, className,
}: { items: string[]; limit?: number; quote?: boolean; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, limit);
  const hidden = items.length - shown.length;
  return (
    <>
      <ul className={cn("space-y-0.5", className)}>
        {shown.map((p, i) => (
          <li key={i}>{quote ? `“${p}”` : `• ${p}`}</li>
        ))}
      </ul>
      {(hidden > 0 || expanded) && items.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[11px] text-primary hover:underline"
        >
          {expanded ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
    </>
  );
}

function ChipList({ items, tone }: { items: string[]; tone: "primary" | "muted" }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((p, i) => (
        <span
          key={i}
          className={cn(
            "text-[11px] px-1.5 py-0.5 rounded border",
            tone === "primary"
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-muted text-muted-foreground border-border",
          )}
        >
          {p}
        </span>
      ))}
    </div>
  );
}



/* ---------- Activity timeline (real events only) ---------- */

type TimelineEvent = {
  id: string;
  at: string;
  title: string;
  detail?: string;
  tone: "success" | "warning" | "destructive" | "neutral" | "primary";
};

const ATTEMPT_LABEL: Record<string, string> = {
  no_answer: "No answer",
  left_voicemail: "Left voicemail",
  reached: "Reached contact",
  bounced: "Bounced / invalid",
  replied: "Replied",
  scheduled: "Meeting scheduled",
  unreachable: "Marked unreachable",
  other: "Other outcome",
};

const CHANNEL_TITLE: Record<string, string> = {
  call: "Call",
  email: "Email",
  linkedin: "LinkedIn",
  meeting: "Meeting",
  other: "Contact attempt",
};

function buildTimeline({
  lead,
  attempts,
  tasks,
  assignedUser,
}: {
  lead: Record<string, any>;
  attempts: any[];
  tasks: any[];
  assignedUser: any;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Lead created — real timestamp on the record.
  if (lead?.created_at) {
    events.push({
      id: `created-${lead.id}`,
      at: lead.created_at,
      title: "Lead created",
      detail: lead.lead_source ? `Source: ${lead.lead_source}` : undefined,
      tone: "neutral",
    });
  }

  // Assignment — only if we have an actual assigned_at stamp.
  if (lead?.assigned_at && lead?.assigned_user_id) {
    events.push({
      id: `assigned-${lead.assigned_at}`,
      at: lead.assigned_at,
      title: "Owner assigned",
      detail: assignedUser
        ? `Assigned to ${assignedUser.full_name || assignedUser.email}`
        : undefined,
      tone: "primary",
    });
  }

  // Contact attempts — clearly distinguish attempts vs established conversations.
  for (const a of attempts || []) {
    const channel = CHANNEL_TITLE[a.channel] || "Contact";
    const outcome = ATTEMPT_LABEL[a.outcome] || a.outcome;
    const isConversation = a.outcome === "reached" || a.outcome === "replied" || a.outcome === "scheduled";
    const isFailed = a.outcome === "unreachable" || a.outcome === "bounced";
    const tone: TimelineEvent["tone"] = isConversation ? "success" : isFailed ? "destructive" : "warning";
    // Wording: only call it a real "contact" when two-way comms happened.
    const title = isConversation
      ? `${channel} — ${outcome}`
      : `${channel} attempt — ${outcome}`;
    events.push({
      id: `attempt-${a.id}`,
      at: a.performed_at,
      title,
      detail: a.notes || undefined,
      tone,
    });
  }


  // Tasks created and completed.
  for (const t of tasks || []) {
    if (t.created_at) {
      events.push({
        id: `task-created-${t.id}`,
        at: t.created_at,
        title: `Task created: ${t.title}`,
        detail: t.due_date ? `Due ${t.due_date}` : undefined,
        tone: "neutral",
      });
    }
    if (t.completed_at) {
      events.push({
        id: `task-done-${t.id}`,
        at: t.completed_at,
        title: `Task completed: ${t.title}`,
        tone: "success",
      });
    }
  }

  // Nurture decision (real, only when nurture_until or nurture_reason exist).
  if (lead?.status === "Nurture" && (lead?.nurture_until || lead?.nurture_reason)) {
    events.push({
      id: `nurture-${lead.id}`,
      at: lead.nurture_until
        ? new Date(lead.nurture_until + "T00:00:00").toISOString()
        : lead.last_contact_at || lead.created_at,
      title: "Moved to nurture",
      detail: [
        lead.nurture_reason,
        lead.nurture_until ? `Follow up on ${lead.nurture_until}` : null,
      ].filter(Boolean).join(" — "),
      tone: "warning",
    });
  }

  // Disqualified (only if we have a reason recorded).
  if (lead?.qualification_stage === "Disqualified" && lead?.disqualified_reason) {
    events.push({
      id: `disq-${lead.id}`,
      at: lead.last_contact_at || lead.created_at,
      title: "Disqualified",
      detail: lead.disqualified_reason,
      tone: "destructive",
    });
  }

  // Converted to opportunity.
  if (lead?.converted_to_deal_id) {
    events.push({
      id: `conv-${lead.id}`,
      at: lead.last_contact_at || lead.created_at,
      title: "Converted to opportunity",
      tone: "primary",
    });
  }

  return events
    .filter((e) => !!e.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
