import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileText, Search } from "lucide-react";
import { CreateProposalDialog } from "@/components/proposals/CreateProposalDialog";
import { renewalProposalSource } from "@/lib/proposal-source";
import { Badge } from "@/components/ui/badge";
import { useRenewals } from "@/hooks/useDeals";
import { usePartners } from "@/hooks/usePartners";
import { useClients } from "@/hooks/useClients";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateOnly } from "@/lib/date-format";
import { formatMoney, LOADING_PLACEHOLDER } from "@/lib/money";
import { useAuth } from "@/contexts/AuthContext";
import { isPartnerScopedView } from "@/lib/partner-scope";
import { CloseRenewalDialog } from "@/components/renewals/CloseRenewalDialog";
import { RenewalClosureSummary } from "@/components/renewals/RenewalClosureSummary";
import { isClosedRenewal, isOperationalRenewal } from "@/lib/renewal-closing";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { useAssignableUsers, useAllProfilesMap } from "@/hooks/useAssignableUsers";
import { useReassignRenewalOwner } from "@/hooks/useRenewalOwner";
import { getOwnerDisplay } from "@/lib/owner-display";
import { ProposalWorkflowActions } from "@/components/proposals/ProposalWorkflowActions";
import { renewalDays, renewalUrgency, renewalDeadline, renewalStage, renewalResult, renewalPartner, RENEWAL_STAGES } from "@/lib/renewal-pipeline";
import { fetchAllPages } from "@/lib/loss-analysis";
import { createRenewalWorkflowRow } from "@/lib/renewal-workflow";
import { buildRenewalInsertPayload } from "@/lib/renewal-payload";
import { RENEWAL_IDENTITY_SELECT } from "@/lib/renewal-identity";
import { proposalStatusLabel } from "@/lib/proposal-workflow";

/** Every open working state shown as "In Progress" in the pipeline counter. */
export const IN_PROGRESS_RENEWAL_STATUSES = new Set(["In Progress", "In Negotiation", "Quoted"]);

const statusColors: Record<string, string> = {
  "In Progress": "bg-purple-50 text-purple-700 border-purple-200",
  "Upcoming": "bg-info/10 text-info border-info/20",
  "Due Soon": "bg-warning/15 text-warning-foreground border-warning/30",
  "In Negotiation": "bg-purple-50 text-purple-700 border-purple-200",
  "Quoted": "bg-info/10 text-info border-info/20",
  "Won": "bg-success/10 text-success border-success/20",
  "Lost": "bg-destructive/10 text-destructive border-destructive/20",
  "Expired": "bg-muted text-muted-foreground border-border",
};

const priorityColors: Record<string, string> = {
  "Critical": "bg-destructive/10 text-destructive",
  "High": "bg-warning/15 text-warning-foreground",
  "Medium": "bg-info/10 text-info",
  "Low": "bg-success/10 text-success",
};

export default function Renewals() {
  const { isHQ, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const dashboardDeadline = searchParams.get("deadline");
  const { data: renewals = [], isLoading, isError, refetch } = useRenewals({ includeHistory: true });
  const { data: partners = [], isLoading: partnersLoading, isError: partnersError } = usePartners();
  const { data: clients = [], isLoading: clientsLoading, isError: clientsError } = useClients();
  const qc = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60000); return () => window.clearInterval(timer); }, []);
  const { data: proposalRows = [], isLoading: proposalsLoading, isError: proposalsError } = useQuery({
    queryKey: ["proposal", "renewal-pipeline-stages"],
    queryFn: () => fetchAllPages<any>((from, to) => supabase.from("proposals").select("id, renewal_id, version, status").not("renewal_id", "is", null).order("id").range(from, to)),
  });
  const proposalMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of proposalRows) if (!map.has(p.renewal_id) || Number(p.version) > Number(map.get(p.renewal_id).version)) map.set(p.renewal_id, p);
    return map;
  }, [proposalRows]);
  const loadError = isError || partnersError || clientsError || proposalsError;
  const kpisReady = !isLoading && !partnersLoading && !clientsLoading && !proposalsLoading && !loadError;
  const [includeArchived, setIncludeArchived] = useState(false);
  const [periodFilter, setPeriodFilter] = useState("365");
  const [stageFilter, setStageFilter] = useState("all");
  const [deadlineFilter, setDeadlineFilter] = useState(["Overdue", "Due Soon"].includes(dashboardDeadline || "") ? dashboardDeadline! : "all");
  const [makingOperational, setMakingOperational] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [partnerFilter, setPartnerFilter] = useState<string>(searchParams.get("partner") || "all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showProposal, setShowProposal] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const { canEdit } = useModuleAccess();
  const { data: profilesMap } = useAllProfilesMap();
  const { data: assignableUsers = [] } = useAssignableUsers();
  const reassign = useReassignRenewalOwner();

  const clientMap = useMemo(() => {
    const m: Record<string, any> = {};
    clients.forEach(c => { m[c.id] = c; });
    return m;
  }, [clients]);



  const enriched = useMemo(() => {
    return renewals.map((r: any) => {
      const cl = clientMap[r.client_id];
      const days = renewalDays(r.renewal_date, now);
      const partner = renewalPartner(r, cl, partners);
      const ownerName = getOwnerDisplay({ assigned_user_id: r.assigned_user_id, assigned_salesperson: r.assigned_owner }, profilesMap);
      return { ...r, clientName: cl?.commercial_name || "Client unavailable", clientCode: cl?.client_code || "", resolvedPartnerId: partner.id, partnerName: partner.name, daysUntil: days, priority: isClosedRenewal(r) ? "—" : renewalUrgency(days), deadline: renewalDeadline(r, days), stage: renewalStage(r, proposalMap.get(r.id)?.status), result: renewalResult(r), ownerName, isUnassigned: ownerName === "Unassigned" };
    });
  }, [renewals, clientMap, partners, profilesMap, now, proposalMap]);

  const filtered = useMemo(() => {
    return enriched.filter(r => {
      if (search && !r.clientName.toLowerCase().includes(search.toLowerCase()) && !r.clientCode.toLowerCase().includes(search.toLowerCase())) return false;
      const closed = isClosedRenewal(r);
      if (statusFilter === "active" && closed) return false;
      if (statusFilter === "history" && !closed) return false;
      if (statusFilter === "renewed" && r.result !== "Renewed") return false;
      if (statusFilter === "lost" && r.result !== "Lost") return false;
      if (partnerFilter === "hq" && r.resolvedPartnerId !== null) return false;
      if (!["all", "hq"].includes(partnerFilter) && r.resolvedPartnerId !== partnerFilter) return false;
      if (periodFilter !== "all" && (r.daysUntil === null || r.daysUntil > Number(periodFilter))) return false;
      if (stageFilter !== "all" && r.stage !== stageFilter) return false;
      if (deadlineFilter !== "all" && r.deadline !== deadlineFilter) return false;
      if (dashboardDeadline === "31-60" && (r.daysUntil === null || r.daysUntil < 31 || r.daysUntil > 60)) return false;
      if (dashboardDeadline === "61-90" && (r.daysUntil === null || r.daysUntil < 61 || r.daysUntil > 90)) return false;
      return true;
    });
  }, [enriched, search, statusFilter, partnerFilter, periodFilter, stageFilter, deadlineFilter, dashboardDeadline]);

  const activeRenewals = useMemo(() => filtered.filter(r => !isClosedRenewal(r)), [filtered]);

  const stats = useMemo(() => ({
    total: activeRenewals.length,
    expired: activeRenewals.filter(r => r.deadline === "Overdue").length,
    dueSoon: activeRenewals.filter(r => r.deadline === "Due Soon").length,
    inProgress: activeRenewals.filter(r => r.stage !== "Not started").length,
    accepted: activeRenewals.filter(r => r.stage === "Accepted").length,
    unassigned: activeRenewals.filter(r => r.isUnassigned && r.status !== "Won" && r.status !== "Lost").length,
    totalValue: activeRenewals.reduce((s, r) => s + Number(r.estimated_value || 0), 0),
  }), [activeRenewals]);

  const partnerScoped = isPartnerScopedView({ isHQ: !!isHQ, partnerId: profile?.partner_id, visiblePartnerCount: partners.length });

  // Deep link: /renewals?renewal=<id> opens that renewal's detail.
  const deepRenewalId = searchParams.get("renewal");
  useEffect(() => {
    if (!deepRenewalId || isLoading || clientsLoading || partnersLoading || loadError) return;
    if (enriched.some(r => r.id === deepRenewalId)) setSelectedId(deepRenewalId);
    else toast.info("That renewal could not be found or is no longer available.");
    const next = new URLSearchParams(searchParams);
    next.delete("renewal");
    setSearchParams(next, { replace: true });
  }, [deepRenewalId, isLoading, clientsLoading, partnersLoading, enriched]); // eslint-disable-line react-hooks/exhaustive-deps

  const detail = selectedId ? enriched.find(r => r.id === selectedId) : null;
  const isRealRenewal = !!detail && isOperationalRenewal(detail.id);
  const detailClosed = isClosedRenewal(detail);
  const detailClient = detail ? clientMap[detail.client_id] : null;

  const { data: renewalProposal = null, isLoading: proposalLoading, isError: proposalError } = useQuery({
    queryKey: ["proposal", "renewal", detail?.id],
    queryFn: async () => {
      let query = supabase.from("proposals").select("*");
      query = detail!.closed_proposal_id ? query.eq("id", detail!.closed_proposal_id) : query.eq("renewal_id", detail!.id).order("version", { ascending: false }).limit(1);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!detail?.id && isRealRenewal,
  });

  // Keep closing history visible even after the next cycle takes over the row.
  const { data: previousCycle = null } = useQuery({
    queryKey: ["renewal", "previous", detail?.previous_renewal_id],
    enabled: !!detail?.previous_renewal_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renewals")
        .select("*")
        .eq("id", detail!.previous_renewal_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: activities = [], isError: activitiesError } = useQuery({
    queryKey: ["renewal_activities", detail?.id],
    enabled: !!detail?.id && isRealRenewal,
    queryFn: async () => {
      const { data, error } = await supabase.from("renewal_activities").select("id, action, created_at, notes").eq("renewal_id", detail!.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    },
  });
  const makeOperational = async () => {
    if (!detail || isRealRenewal || !canEdit("renewals") || makingOperational) return;
    setMakingOperational(true);
    try {
      if (detail.resolvedPartnerId && !detail.partner_uuid && !detailClient?.partner_uuid) throw new Error("Confirm the client's partner relationship before making this renewal operational.");
      const component = detail._components?.find((r: any) => r.id === detail.id) || detail;
      const contractId = component.contract_id || (String(component.id).startsWith("derived-contract-") ? component.id.replace("derived-contract-", "") : null);
      const licenseId = component.license_id || (String(component.id).startsWith("derived-license-") ? component.id.replace("derived-license-", "") : String(component.id).startsWith("derived-sat-") ? component.id.replace("derived-sat-", "") : null);
      const fields = { client_id: detail.client_id, contract_id: contractId, license_id: licenseId, renewal_type: component.renewal_type || "Commercial", renewal_date: detail.renewal_date, estimated_value: detail.estimated_value, priority: detail.priority, status: "Upcoming", billing_frequency: component.billing_frequency || null };
      const result = await createRenewalWorkflowRow<any>({
        target: fields,
        fetchExisting: async () => {
          const { data, error } = await supabase.from("renewals").select(RENEWAL_IDENTITY_SELECT).eq("client_id", detail.client_id);
          if (error) throw error;
          return data || [];
        },
        insert: async () => {
          const { data, error } = await supabase.from("renewals").insert(buildRenewalInsertPayload(fields, { partner_uuid: detail.partner_uuid || detailClient?.partner_uuid || null }) as any).select("*").single();
          if (error) throw error;
          return data;
        },
      });
      await qc.invalidateQueries({ queryKey: ["renewals"] });
      setSelectedId(result.id);
      toast.success(result.created ? "Renewal is now operational. Assign its owner to continue." : "Opened the existing operational renewal.");
    } catch (e: any) { toast.error(e?.message || "Could not make the renewal operational"); }
    finally { setMakingOperational(false); }
  };

  const proposalSource = detail && isRealRenewal
    ? renewalProposalSource({
        renewalId: detail.id,
        clientId: detail.client_id,
        partnerUuid: detail.partner_uuid ?? null,
        contractId: detail.contract_id ?? null,
        licenseId: detail.license_id ?? null,
      })
    : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Renewals Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">One active commercial cycle per client, with previous cycles available in history</p>
        </div>
      </div>

      {loadError && <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">Could not load the complete renewal pipeline. <Button variant="outline" size="sm" onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["clients"] }); qc.invalidateQueries({ queryKey: ["partners"] }); qc.invalidateQueries({ queryKey: ["proposal"] }); }}>Retry</Button></div>}
      {["31-60", "61-90"].includes(dashboardDeadline || "") && <p className="text-sm">Dashboard range: {dashboardDeadline} days. <button className="text-primary underline" onClick={() => { const next = new URLSearchParams(searchParams); next.delete("deadline"); setSearchParams(next); }}>Clear range</button></p>}
      <p className="text-xs text-muted-foreground">Indicators show open renewals matching the filters below. Commercial stages follow proposal actions: Validate → Mark Sent → Record acceptance. Renewed/Lost are recorded through Close Renewal. Priority is calculated from the renewal date: overdue = Critical, up to 30 days = High, up to 90 days = Medium, later = Low.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 animate-reveal-up stagger-1">
        {[
          { label: "Clients", value: stats.total, color: "text-foreground" },
          { label: "Due Soon", value: stats.dueSoon, color: "text-amber-600" },
          { label: "In Progress", value: stats.inProgress, color: "text-purple-600" },
          { label: "Accepted", value: stats.accepted, color: "text-success" },
          { label: "Unassigned", value: stats.unassigned, color: stats.unassigned > 0 ? "text-destructive" : "text-muted-foreground" },
          { label: "Overdue", value: stats.expired, color: "text-muted-foreground" },
          { label: "Pipeline Value", value: formatMoney(stats.totalValue, { compact: true }), color: "text-foreground" },
        ].map((kpi, i) => (
          <div key={i} className="bg-card rounded-xl border shadow-sm p-4">
            <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
            <p className={`text-xl font-bold tabular-nums mt-1 ${kpisReady ? kpi.color : "text-muted-foreground animate-pulse"}`} aria-busy={!kpisReady || undefined}>{kpisReady ? kpi.value : LOADING_PLACEHOLDER}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 animate-reveal-up stagger-2">
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 flex-1 max-w-xs">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input type="text" placeholder="Search client..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); if (v !== "active") { setPeriodFilter("all"); setStageFilter("all"); setDeadlineFilter("all"); } }}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active renewals</SelectItem>
            <SelectItem value="all">All cycles</SelectItem>
            <SelectItem value="history">Closed history</SelectItem>
            <SelectItem value="renewed">Renewed</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
        {!partnerScoped && (
        <Select value={partnerFilter} onValueChange={setPartnerFilter}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Partner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Partners</SelectItem>
            <SelectItem value="hq">HQ Direct</SelectItem>
            {partners.filter(p => includeArchived || p.status !== "Archived").map(p => <SelectItem key={p.id} value={p.id}>{p.company_name}{p.status === "Archived" ? " (archived)" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        )}
        {!partnerScoped && <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={includeArchived} onChange={e => { setIncludeArchived(e.target.checked); setPartnerFilter("all"); }} />Include archived partners</label>}
        <Select value={periodFilter} onValueChange={setPeriodFilter}><SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="365">Next 365 days + overdue</SelectItem><SelectItem value="90">Next 90 days + overdue</SelectItem><SelectItem value="30">Next 30 days + overdue</SelectItem><SelectItem value="all">All dates (full history)</SelectItem>
        </SelectContent></Select>
        <Select value={deadlineFilter} onValueChange={setDeadlineFilter}><SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All deadlines</SelectItem>{["Upcoming", "Due Soon", "Overdue", "Date missing"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={stageFilter} onValueChange={setStageFilter}><SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All commercial stages</SelectItem>{RENEWAL_STAGES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} cycles shown · {activeRenewals.length} open · {filtered.length - activeRenewals.length} closed. Select All dates to include every future cycle. {activeRenewals.some(r => r.estimated_value == null) && "Some open renewals have no estimated value and are excluded from Pipeline Value."}</p>

      <div className="bg-card rounded-xl border shadow-sm overflow-hidden animate-reveal-up stagger-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-secondary/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Priority</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
              {!partnerScoped && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Partner</th>}
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Renewal Date</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Days</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Deadline</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Commercial Stage</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Result</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Value</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Owner</th>
            </tr></thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={partnerScoped ? 9 : 10} className="px-4 py-8 text-center text-muted-foreground">Loading renewals...</td></tr>
              ) : loadError ? (
                <tr><td colSpan={partnerScoped ? 9 : 10} className="px-4 py-8 text-center text-destructive">Pipeline unavailable. Please retry.</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={partnerScoped ? 9 : 10} className="px-4 py-8 text-center text-muted-foreground">No renewals found.</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => setSelectedId(r.id)}>
                  <td className="px-4 py-3"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityColors[r.priority || "Medium"] || ""}`}>{r.priority}</span></td>
                  <td className="px-4 py-3"><Link to={`/clients/${r.client_id}`} className="font-medium text-foreground hover:text-primary" onClick={e => e.stopPropagation()}>{r.clientCode}</Link><p className="text-xs text-muted-foreground truncate max-w-[200px]">{r.clientName}</p></td>
                  {!partnerScoped && <td className="px-4 py-3 text-muted-foreground text-xs">{r.partnerName}</td>}
                  <td className="px-4 py-3 tabular-nums text-xs">{formatDateOnly(r.renewal_date)}</td>
                  <td className="px-4 py-3"><span className={`tabular-nums text-xs font-semibold ${r.daysUntil !== null && r.daysUntil < 0 ? "text-destructive" : r.daysUntil !== null && r.daysUntil <= 30 ? "text-amber-600" : "text-muted-foreground"}`}>{isClosedRenewal(r) ? "Closed" : r.daysUntil !== null && r.daysUntil < 0 ? `${Math.abs(r.daysUntil)}d overdue` : r.daysUntil === null ? "—" : `${r.daysUntil}d`}</span></td>
                  <td className="px-4 py-3"><Badge variant={r.deadline === "Overdue" ? "destructive" : "outline"}>{r.deadline}</Badge></td><td className="px-4 py-3 text-xs">{r.stage}</td><td className="px-4 py-3 text-xs">{r.result}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{r.estimated_value == null ? "Not set" : formatMoney(isClosedRenewal(r) ? r.final_value ?? r.estimated_value : r.estimated_value)}</td>
                  <td className="px-4 py-3 text-xs"><span className={r.isUnassigned ? "text-destructive font-medium" : "text-muted-foreground"}>{r.ownerName}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={() => setSelectedId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.clientName}</DialogTitle>
                <DialogDescription>Commercial Renewal · {detail.clientCode}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Deadline</span><p className="font-medium mt-0.5">{detail.deadline}</p></div><div><span className="text-muted-foreground">Commercial Stage</span><p className="font-medium mt-0.5">{detail.stage}</p></div><div><span className="text-muted-foreground">Result</span><p className="font-medium mt-0.5">{detail.result}</p></div>
                  <div><span className="text-muted-foreground">Priority</span><p className="font-medium mt-0.5">{detail.priority}</p><p className="text-xs text-muted-foreground">Calculated from the deadline; stored manual priority: {detail.priority === "—" ? "—" : detail._components?.find((r: any) => r.id === detail.id)?.priority || "Not set"}.</p></div>
                  <div><span className="text-muted-foreground">Renewal Date</span><p className="font-medium mt-0.5 tabular-nums">{formatDateOnly(detail.renewal_date)}</p></div>
                  <div><span className="text-muted-foreground">Days Until</span><p className="font-medium mt-0.5 tabular-nums">{detailClosed ? "Closed" : detail.daysUntil !== null && detail.daysUntil < 0 ? `${Math.abs(detail.daysUntil)} overdue` : detail.daysUntil === null ? "Date missing" : `${detail.daysUntil} days`}</p></div>
                  <div><span className="text-muted-foreground">Estimated Value</span><p className="font-medium mt-0.5 tabular-nums">{formatMoney(detail.estimated_value)}</p></div>
                  <div><span className="text-muted-foreground">Owner</span><p className={`font-medium mt-0.5 ${detail.isUnassigned ? "text-destructive" : ""}`}>{detail.ownerName}</p></div>
                  <div><span className="text-muted-foreground">Contract Period</span><p className="font-medium mt-0.5">{detail.billing_frequency || "Not standard / unknown"}</p></div>

                </div>
                {detail.included_services?.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Includes</p>
                    <ul className="text-sm text-foreground space-y-1">
                      {detail.included_services.map((s: string) => (
                        <li key={s} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> {s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {detail.notes && (
                  <div className="border-t pt-3"><p className="text-xs font-medium text-muted-foreground mb-1">Notes</p><p className="text-sm text-muted-foreground">{detail.notes}</p></div>
                )}
                {isRealRenewal && !detailClosed && canEdit("renewals") && (
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Operational Owner</p>
                    <Select
                      value={detail.assigned_user_id ?? "unassigned"}
                      onValueChange={(v) => reassign.mutate({ renewalId: detail.id, newOwnerId: v === "unassigned" ? null : v })}
                      disabled={reassign.isPending}
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Assign owner" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {assignableUsers.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Renewal Proposal</p>
                  {!isRealRenewal ? (
                    <div className="space-y-2"><p className="text-sm text-muted-foreground">This renewal comes from contract/license dates. Make it operational to assign an owner and prepare a proposal.</p>{canEdit("renewals") && !detailClosed && <Button size="sm" disabled={makingOperational} onClick={makeOperational}>{makingOperational ? "Saving…" : "Make operational"}</Button>}</div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        {renewalProposal
                          ? `Version ${renewalProposal.version} · ${proposalStatusLabel(renewalProposal.status, true)}`
                          : proposalError ? "Could not load the proposal." : proposalLoading ? "Loading proposal…" : "No proposal created yet."}
                      </p>
                      <Button size="sm" variant={detailClosed || !canEdit("renewals") ? "outline" : "default"} disabled={proposalLoading || proposalError || (!renewalProposal && (detailClosed || !canEdit("renewals")))} onClick={() => setShowProposal(true)} className="gap-2">
                        <FileText className="h-4 w-4" />
                        {renewalProposal ? "Open Renewal Proposal" : "Create Renewal Proposal"}
                      </Button>
                    </div>
                  )}
                  {isRealRenewal && renewalProposal && !detailClosed && canEdit("renewals") && (
                    <div className="flex flex-wrap justify-end gap-2"><ProposalWorkflowActions proposal={renewalProposal} /></div>
                  )}
                </div>

                {detail.result === "Closed (legacy)" && <p className="text-xs text-amber-700">Legacy completed record: closing date and outcome have not been confirmed. This is not counted as a confirmed renewal win.</p>}
                {isRealRenewal && <div className="border-t pt-3"><p className="text-xs font-medium text-muted-foreground mb-2">Recent activity</p>{activitiesError ? <p className="text-xs text-destructive">Could not load activity history.</p> : activities.length === 0 ? <p className="text-xs text-muted-foreground">No recorded activity.</p> : <ul className="space-y-2 max-h-36 overflow-y-auto">{activities.map(a => <li key={a.id} className="text-xs"><span className="font-medium">{a.action.replace(/_/g, " ")}</span> · {formatDateOnly(a.created_at)}{a.notes && <p className="text-muted-foreground">{a.notes}</p>}</li>)}</ul>}</div>}
                {previousCycle && <RenewalClosureSummary renewal={previousCycle} title="Previous cycle" />}

                {detailClosed ? (
                  <>
                    <RenewalClosureSummary renewal={detail} title="Closure" />
                    <p className="text-xs text-muted-foreground">This renewal is closed and read-only.</p>
                  </>
                ) : isRealRenewal && canEdit("renewals") ? (
                  <div className="border-t pt-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">Close this commercial cycle.</p>
                    <Button size="sm" variant="outline" onClick={() => setShowClose(true)} className="gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Close Renewal
                    </Button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {showProposal && proposalSource && detail && (
        <CreateProposalDialog
          open={showProposal}
          onOpenChange={setShowProposal}
          proposalSource={proposalSource}
          editingProposal={renewalProposal as any}
          readOnly={detailClosed || !canEdit("renewals")}
          defaultClientName={detailClient?.commercial_name || detail.clientName}
          defaultCountry={detailClient?.country || null}
        />
      )}

      {showClose && detail && (
        <CloseRenewalDialog
          open={showClose}
          onOpenChange={(o) => { setShowClose(o); if (!o) setSelectedId(null); }}
          renewal={detail}
          clientName={detail.clientName}
        />
      )}
    </div>
  );
}
