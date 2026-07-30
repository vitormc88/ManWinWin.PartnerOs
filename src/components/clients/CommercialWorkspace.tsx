import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  FilePlus2, RefreshCw, CalendarPlus, StickyNote, FileText, Clock,
  TrendingUp, Sparkles, ArrowUpRight, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { useCreateNote } from "@/hooks/useClients";
import { useCreateManualTask } from "@/hooks/useTasks";
import { useLifecycleEvents } from "@/hooks/useLifecycleEvents";
import { CreateProposalDialog, type CommercialContext, type CommercialProposalMode } from "@/components/proposals/CreateProposalDialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ArrowUpCircle, Puzzle, Plug, Users2, RefreshCcw, MoreHorizontal, Server } from "lucide-react";
import {
  availableCommercialActions,
  resolveLicenseId,
  type CommercialActionId,
} from "@/lib/license-evolution";

const PROPOSAL_MODES: Record<CommercialActionId, {
  mode: CommercialProposalMode;
  label: string;
  hint: string;
  icon: any;
}> = {
  upgrade_license:  { mode: "upgrade_license",  label: "Change / Upgrade License",  hint: "Move to a higher plan or Business model", icon: ArrowUpCircle },
  add_modules:      { mode: "add_modules",      label: "Add Modules",               hint: "Extend current license with modules",     icon: Puzzle },
  add_plugins:      { mode: "add_plugins",      label: "Add Plugins",               hint: "Enable additional plugins",               icon: Plug },
  add_users:        { mode: "add_users",        label: "Add Users",                 hint: "Increase licensed users",                 icon: Users2 },
  change_hosting:   { mode: "change_hosting",   label: "Change Hosting",            hint: "Switch SaaS / On-Premise",                icon: Server },
  renew_agreement:  { mode: "renew_agreement",  label: "Renew Commercial Agreement", hint: "Prepare a renewal proposal",             icon: RefreshCcw },
  other:            { mode: "other",            label: "Other Commercial Proposal", hint: "Custom commercial change",                icon: MoreHorizontal },
};


interface Props {
  client: any;
  primaryLicense: any | null;
  primaryContract: any | null;
  modules: any[];
  notes: any[];
  plugins?: any[];
  readOnly?: boolean;
}

export function CommercialWorkspace({ client, primaryLicense, primaryContract, modules, notes, plugins = [], readOnly = false }: Props) {
  const navigate = useNavigate();
  const createNote = useCreateNote();
  const createTask = useCreateManualTask();

  const [showProposal, setShowProposal] = useState(false);
  const [commercialCtx, setCommercialCtx] = useState<CommercialContext | null>(null);
  const [showMeeting, setShowMeeting] = useState(false);
  const [showNote, setShowNote] = useState(false);

  // Meeting form
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");

  // Commercial note form
  const [noteBody, setNoteBody] = useState("");

  // Existing proposals for this client (matched by client_name)
  const clientName: string = client?.company_name ?? client?.name ?? "";
  const { data: proposals = [] } = useQuery({
    queryKey: ["proposals", "by-client-name", clientName],
    queryFn: async () => {
      if (!clientName) return [];
      const { data, error } = await supabase
        .from("proposals")
        .select("id, client_name, project_name, status, total_year_1, total_recurring, proposal_date, created_at")
        .eq("client_name", clientName)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientName,
  });

  // Commercial notes (subset of client notes)
  const commercialNotes = useMemo(
    () => (notes || []).filter((n: any) => n.note_type === "commercial").slice(0, 10),
    [notes],
  );

  // Lifecycle events → commercial timeline
  const { data: events = [] } = useLifecycleEvents(client?.id);
  const timeline = useMemo(() => {
    const proposalEvents = (proposals || []).map((p: any) => ({
      when: p.created_at || p.proposal_date,
      title: `Proposal — ${p.project_name || p.client_name}`,
      meta: p.status ? `Status: ${p.status}` : null,
      icon: FileText as any,
    }));
    const noteEvents = (commercialNotes || []).map((n: any) => ({
      when: n.created_at,
      title: "Commercial note",
      meta: (n.content || "").slice(0, 90),
      icon: MessageSquare as any,
    }));
    const lifeEvents = (events || []).map((e: any) => ({
      when: e.created_at,
      title: e.event_type || "Lifecycle event",
      meta: e.description || null,
      icon: Sparkles as any,
    }));
    return [...proposalEvents, ...noteEvents, ...lifeEvents]
      .filter((x) => x.when)
      .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
      .slice(0, 12);
  }, [proposals, commercialNotes, events]);

  // ─── Existing Customer Context (Sprint I.6) ───────────────────────────────
  // Normalize the real client commercial configuration into a single source of
  // truth for the Proposal Builder wizards. Mirrors field usage of the
  // Licensing / Contract tabs (product/edition, web_accesses, backoffice_users,
  // sat_active, api_access, license_end_date).
  const activeModuleRows = useMemo(
    () => (modules || []).filter((m: any) => m?.enabled !== false && !m?.plugin_id && (m?.item_type ?? "module") !== "plugin"),
    [modules],
  );
  const activePluginRows = useMemo(() => {
    const fromPlugins = (plugins || []).filter((p: any) => p?.enabled !== false);
    const fromModules = (modules || []).filter(
      (m: any) => m?.enabled !== false && (m?.plugin_id || m?.item_type === "plugin"),
    );
    // Prefer the explicit plugins list; fall back to plugin rows co-located in licensed_modules.
    return fromPlugins.length ? fromPlugins : fromModules;
  }, [modules, plugins]);

  const derivedLicense = useMemo(() => {
    const lic: any = primaryLicense || {};
    const product: string = (lic.product || "").toString().trim();
    const edition: string = (lic.edition || "").toString().trim();
    const combined = `${product} ${edition}`.toLowerCase();

    const family: "Business" | "Professional" | null =
      /business/.test(combined) ? "Business" :
      /professional/.test(combined) ? "Professional" : null;

    // Variant: "KeepIT" / "UseIT" for Business, "I|II|III|1|2|3" for Professional.
    let variant: string | null = null;
    if (family === "Business") {
      if (/keepit/.test(combined)) variant = "KeepIT";
      else if (/useit/.test(combined)) variant = "UseIT";
      else if (/startit/.test(combined)) variant = "StartIT";
    } else if (family === "Professional") {
      const m = combined.match(/professional[^0-9iv]*(iii|ii|i|3|2|1)\b/);
      if (m) {
        const t = m[1];
        variant = t === "iii" || t === "3" ? "III" : t === "ii" || t === "2" ? "II" : "I";
      }
    }

    // ProposalPlan 1|2|3 currently only maps meaningfully for Professional.
    let plan: 1 | 2 | 3 | undefined;
    if (family === "Professional" && variant) {
      plan = variant === "III" ? 3 : variant === "II" ? 2 : 1;
    }

    const label = family
      ? family === "Business"
        ? variant ? `Business ${variant}` : (product || "Business")
        : variant ? `Professional ${variant}` : (product || "Professional")
      : (product || null);

    return { family, variant, plan, label };
  }, [primaryLicense]);

  const currentLicenseId = useMemo(
    () => resolveLicenseId(derivedLicense.family, derivedLicense.variant),
    [derivedLicense.family, derivedLicense.variant],
  );
  const allowedActions = useMemo(
    () => availableCommercialActions(currentLicenseId),
    [currentLicenseId],
  );


  const backofficeUsers = Number(
    (primaryLicense as any)?.backoffice_users ??
    (primaryLicense as any)?.backoffice_employee_users ?? 0,
  ) || 0;
  const webUsers = Number((primaryLicense as any)?.web_accesses ?? 0) || 0;
  const mobileUsers = Number((primaryLicense as any)?.mobile_users ?? 0) || 0;
  const renewalDate =
    (primaryContract as any)?.contract_end_date ||
    (primaryLicense as any)?.license_end_date ||
    null;

  const projectBase = client?.commercial_name ?? clientName;

  const buildContext = (mode: CommercialProposalMode): CommercialContext => {
    const lic: any = primaryLicense || {};

    const snapshot = {
      clientId: client?.id ?? null,
      clientName: clientName || null,
      partnerId: client?.partner_id ?? null,
      partnerName: client?.partner_name ?? client?.partner?.company_name ?? null,
      license: primaryLicense ?? null,
      contract: primaryContract ?? null,
      modules: activeModuleRows,
      plugins: activePluginRows,
      backofficeUsers,
      webUsers,
      mobileUsers,
      renewalDate,
      licenseFamily: derivedLicense.family,
      licenseVariant: derivedLicense.variant,
      licenseLabel: derivedLicense.label,
      deployment: lic.deployment_type || lic.database_type || client?.cloud_onpremise || null,
      billingFrequency: (primaryContract as any)?.billing_frequency || lic.billing_frequency || lic.periodicity || null,
      currency: lic.currency || (primaryContract as any)?.currency || null,
      satActive: Boolean(lic.sat_active) || null,
      apiAccess: Boolean(lic.api_access) || null,
      arr: Number(lic.recurring_contract_value ?? 0) || null,
      year1: Number(lic.initial_contract_value ?? 0) || null,
    };

    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.log("[CommercialWorkspace/buildContext]", {
        mode,
        clientId: snapshot.clientId,
        licenseLabel: snapshot.licenseLabel,
        backofficeUsers,
        webUsers,
        modules: activeModuleRows.length,
        plugins: activePluginRows.length,
        renewalDate,
        satActive: snapshot.satActive,
      });
    }

    const base: CommercialContext = {
      source: "commercial_workspace",
      mode,
      label: PROPOSAL_MODES[mode as CommercialActionId]?.label || "Commercial Proposal",
      presetPlan: derivedLicense.plan,
      presetWebUsers: webUsers,
      presetProductFamily: derivedLicense.family ?? "Professional",
      existingCustomer: snapshot,
    };
    switch (mode) {
      case "upgrade_license":
        return { ...base, initialStep: 0, projectNameHint: `License upgrade — ${projectBase}` };
      case "add_modules":
        return { ...base, initialStep: 1, projectNameHint: `Additional modules — ${projectBase}` };
      case "add_plugins":
        return { ...base, initialStep: 1, projectNameHint: `Plugins expansion — ${projectBase}` };
      case "add_users":
        return { ...base, initialStep: 1, projectNameHint: `Additional users — ${projectBase}` };
      case "change_hosting":
        return { ...base, initialStep: 0, projectNameHint: `Change hosting — ${projectBase}` };
      case "renew_agreement":
        return { ...base, initialStep: 4, projectNameHint: `Renewal — ${projectBase}` };
      default:
        return { ...base, initialStep: 0, projectNameHint: `Commercial proposal — ${projectBase}` };
    }
  };


  const openProposal = (mode: CommercialProposalMode) => {
    setCommercialCtx(buildContext(mode));
    setShowProposal(true);
  };

  // Recommended actions (deterministic, lightweight)
  const recommendations = useMemo(() => {
    const recs: { title: string; hint: string; action?: () => void; label?: string }[] = [];
    const renewalDate = primaryContract?.contract_end_date || primaryLicense?.license_end_date;
    if (renewalDate) {
      const days = Math.ceil((new Date(renewalDate).getTime() - Date.now()) / 86400000);
      if (days < 0) {
        recs.push({
          title: "Renewal overdue",
          hint: `Contract ended ${Math.abs(days)}d ago — prepare renewal now.`,
          label: "Prepare Renewal",
          action: () => openProposal("renew_agreement"),
        });
      } else if (days <= 90) {
        recs.push({
          title: `Renewal due in ${days}d`,
          hint: "Kick off renewal conversation and prepare pricing.",
          label: "Prepare Renewal",
          action: () => openProposal("renew_agreement"),
        });
      }
    }
    if (proposals.length === 0) {
      recs.push({
        title: "No commercial proposals on file",
        hint: "Create the first proposal to formalize the relationship.",
        label: "New Proposal",
        action: () => openProposal("other"),
      });
    }
    if (commercialNotes.length === 0) {
      recs.push({
        title: "Log the last commercial touchpoint",
        hint: "Capture context so the next AM continues seamlessly.",
        label: "Log Note",
        action: () => setShowNote(true),
      });
    }
    if (!recs.length) {
      recs.push({
        title: "Account is on track",
        hint: "Schedule a quarterly check-in to sustain momentum.",
        label: "Schedule Meeting",
        action: () => setShowMeeting(true),
      });
    }
    return recs.slice(0, 3);
  }, [primaryContract, primaryLicense, proposals, commercialNotes]);


  const handleCreateMeeting = async () => {
    if (!meetingTitle.trim()) { toast.error("Add a meeting title"); return; }
    try {
      await createTask.mutateAsync({
        title: meetingTitle.trim(),
        description: meetingNotes || undefined,
        due_date: meetingDate || undefined,
        task_type: "meeting",
        task_status: "Open",
        priority: "Medium",
        related_type: "client",
        related_entity_id: client.id,
        related_company: clientName,
      } as any);
      toast.success("Meeting scheduled");
      setShowMeeting(false);
      setMeetingTitle(""); setMeetingDate(""); setMeetingNotes("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to create meeting");
    }
  };

  const handleCreateNote = async () => {
    if (!noteBody.trim()) { toast.error("Write a note"); return; }
    try {
      await createNote.mutateAsync({ client_id: client.id, content: noteBody.trim(), note_type: "commercial" } as any);
      toast.success("Commercial note added");
      setShowNote(false);
      setNoteBody("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to add note");
    }
  };

  return (
    <div className="space-y-5">
      {/* ─── Commercial Actions ─── */}
      {!readOnly && <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Commercial Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="group flex flex-col items-start gap-2 rounded-xl border border-primary/40 bg-primary/5 p-4 text-left hover:border-primary hover:bg-primary/10 transition-colors">
                  <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                    <FilePlus2 className="h-4 w-4" />
                  </div>
                  <div className="w-full flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">New Proposal</p>
                      <p className="text-[11px] text-muted-foreground">Existing customer commercial action</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Commercial Proposal Type
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allowedActions.map((id) => {
                  const m = PROPOSAL_MODES[id];
                  const Icon = m.icon;
                  return (
                    <DropdownMenuItem key={m.mode} onClick={() => openProposal(m.mode)} className="gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{m.label}</div>
                        <div className="text-[11px] text-muted-foreground">{m.hint}</div>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            {!readOnly && <ActionButton icon={CalendarPlus} label="Schedule Meeting" hint="Task linked to client" onClick={() => setShowMeeting(true)} />}
            {!readOnly && <ActionButton icon={StickyNote} label="Log Commercial Note" hint="Attached to this client" onClick={() => setShowNote(true)} />}
          </div>
        </CardContent>
      </Card>}

      {/* ─── Recommended Actions ─── */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Recommended Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recommendations.map((r, i) => (
            <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-secondary/30 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{r.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{r.hint}</p>
              </div>
              {!readOnly && r.action && r.label && (
                <Button size="sm" variant="outline" onClick={r.action} className="shrink-0">{r.label}</Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ─── Proposal History ─── */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Proposal History
          </CardTitle>
          {!readOnly && (
            <Button size="sm" variant="ghost" onClick={() => openProposal("other")}>
              <FilePlus2 className="h-3.5 w-3.5 mr-1" /> New
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {proposals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No commercial proposals yet.</p>
          ) : (
            <div className="space-y-2">
              {proposals.slice(0, 8).map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/proposals/${p.id}`)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3 hover:bg-secondary/40 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {p.project_name || p.client_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.proposal_date ? new Date(p.proposal_date).toLocaleDateString() : "—"}
                      {p.total_year_1 ? ` · Year 1 €${Number(p.total_year_1).toLocaleString()}` : ""}
                      {p.total_recurring ? ` · Recurring €${Number(p.total_recurring).toLocaleString()}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px]">{p.status || "draft"}</Badge>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Commercial Timeline ─── */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Commercial Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No commercial activity yet.</p>
          ) : (
            <div className="space-y-3">
              {timeline.map((e, i) => {
                const Icon = e.icon;
                return (
                  <div key={i} className="flex gap-3">
                    <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-secondary flex items-center justify-center">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1 border-b border-border/40 pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {new Date(e.when).toLocaleDateString()}
                        </span>
                      </div>
                      {e.meta && <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.meta}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Commercial Notes ─── */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" /> Commercial Notes
          </CardTitle>
          {!readOnly && (
            <Button size="sm" variant="ghost" onClick={() => setShowNote(true)}>
              <StickyNote className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {commercialNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No commercial notes yet.</p>
          ) : (
            <div className="space-y-2">
              {commercialNotes.map((n: any) => (
                <div key={n.id} className="rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="text-[10px]">commercial</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{n.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Proposal Builder (reuse) ─── */}
      {showProposal && (
        <CreateProposalDialog
          open={showProposal}
          onOpenChange={setShowProposal}
          leadId={client.id}
          defaultClientName={clientName}
          defaultCountry={client.country || null}
          commercialContext={commercialCtx}
        />
      )}

      {/* ─── Schedule Meeting ─── */}
      <Dialog open={showMeeting} onOpenChange={setShowMeeting}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Meeting — {clientName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Meeting title</Label>
              <Input
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="e.g. QBR with account owner"
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={meetingNotes}
                onChange={(e) => setMeetingNotes(e.target.value)}
                rows={3}
                className="text-sm"
                placeholder="Agenda, participants…"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Linked to {clientName}. Owner defaults to you.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMeeting(false)}>Cancel</Button>
            <Button onClick={handleCreateMeeting} disabled={createTask.isPending}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Commercial Note ─── */}
      <Dialog open={showNote} onOpenChange={setShowNote}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Commercial Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={5}
              className="text-sm"
              placeholder="Deal context, budget signals, decision-maker, next step…"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Saved as a Commercial note on {clientName}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNote(false)}>Cancel</Button>
            <Button onClick={handleCreateNote} disabled={createNote.isPending}>Save Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionButton({
  icon: Icon, label, hint, onClick,
}: { icon: any; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start gap-2 rounded-xl border border-border/60 bg-background p-4 text-left hover:border-primary/50 hover:bg-primary/5 transition-colors"
    >
      <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </button>
  );
}
