import { useState } from "react";
import { Link } from "react-router-dom";
import { useDeals } from "@/hooks/useDeals";
import { usePartners } from "@/hooks/usePartners";
import { useAuth } from "@/contexts/AuthContext";
import { useDealsHealth } from "@/hooks/useDealsHealth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GripVertical, Search, TrendingUp, Target, AlertTriangle, Trophy, Plus, Flame, Clock, BellOff, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { PIPELINE_STAGES, ACTIVE_STAGES, getStageProbability, resolveDealProbability, isActivePipelineStage, STUCK_THRESHOLD_DAYS, type DealStage } from "@/data/pipeline-stages";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { DealHealthBadge } from "@/components/deals/DealHealthBadge";
import { cn } from "@/lib/utils";
import { logSystemActivity } from "@/lib/activity-log";

function formatDaysAgo(d: Date | null): string {
  if (!d) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function formatRelativeFuture(d: Date | null): string | null {
  if (!d) return null;
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return `overdue ${Math.abs(days)}d`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

export default function Pipeline() {
  const { isHQ, profile } = useAuth();
  const userPartnerId = !isHQ ? profile?.partner_id : null;
  const [search, setSearch] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [signalFilter, setSignalFilter] = useState<"none" | "no-followup" | "overdue">("none");
  const [showCreate, setShowCreate] = useState(false);
  const { data: deals = [], isLoading } = useDeals();
  const { data: partners = [] } = usePartners();
  const { data: healthMap } = useDealsHealth(deals);
  const queryClient = useQueryClient();

  const partnerMap = new Map(partners.map(p => [p.id, p.company_name]));
  const partnerNames = [...new Set(deals.map(d => partnerMap.get(d.partner_id || "") || "Unknown"))].filter(Boolean);

  const filtered = deals.filter(d => {
    const pName = partnerMap.get(d.partner_id || "") || "";
    const matchSearch = d.company_name.toLowerCase().includes(search.toLowerCase()) || (d.assigned_salesperson || "").toLowerCase().includes(search.toLowerCase());
    const matchPartner = partnerFilter === "all" || pName === partnerFilter;
    const h = healthMap?.get(d.id);
    const matchHealth = healthFilter === "all" || h?.health === healthFilter;
    const matchSignal =
      signalFilter === "none" ||
      (signalFilter === "no-followup" && !!h?.warnings.includes("No follow-up")) ||
      (signalFilter === "overdue" && !!h?.hasOverdueTask);
    return matchSearch && matchPartner && matchHealth && matchSignal;
  });

  // Single source of truth: "open" = status Open AND stage is a rendered active Kanban stage.
  // Anything else (legacy/unknown stages, Won, Lost) is excluded from open KPIs.
  const open = filtered.filter(d => d.status === "Open" && isActivePipelineStage(d.stage));
  const won = filtered.filter(d => d.status === "Won" && d.stage === "Won");
  const lost = filtered.filter(d => d.status === "Lost" && d.stage === "Lost");
  // Canonical authoritative value: prefer total_value, fallback to expected_value
  const authValue = (d: typeof open[number]) =>
    (d.total_value && Number(d.total_value) !== 0 ? Number(d.total_value) : Number(d.expected_value || 0));
  // Canonical probability: explicit deal probability if set, otherwise stage probability.
  // Single source of truth — must match SQL pipeline_stage_probability + resolveDealProbability.
  const canonicalProb = (d: typeof open[number]) => resolveDealProbability(d);
  const totalPipeline = open.reduce((s, d) => s + authValue(d), 0);
  const weightedPipeline = open.reduce((s, d) => s + authValue(d) * (canonicalProb(d) / 100), 0);
  const closedCount = won.length + lost.length;
  const winRate = closedCount > 0 ? Math.round((won.length / closedCount) * 100) : 0;

  // ── Intelligence counters (computed from health map) ────────────────
  const hotDeals = open.filter(d => healthMap?.get(d.id)?.health === "Hot").length;
  const stalledDeals = open.filter(d => {
    const h = healthMap?.get(d.id)?.health;
    return h === "Stalled" || h === "AtRisk";
  }).length;
  const noFollowUpDeals = open.filter(d => healthMap?.get(d.id)?.warnings.includes("No follow-up")).length;
  const overdueTaskDeals = open.filter(d => healthMap?.get(d.id)?.hasOverdueTask).length;

  const handleDrop = async (stage: DealStage, dealId: string) => {
    const deal = deals.find(d => d.id === dealId);
    const newStatus = stage === "Won" ? "Won" : stage === "Lost" ? "Lost" : "Open";
    const prob = getStageProbability(stage);
    await supabase.from("deals").update({
      stage,
      status: newStatus,
      probability: prob,
      stage_entered_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    }).eq("id", dealId);
    if (deal && deal.stage !== stage) {
      logSystemActivity(dealId, "Stage changed", `Stage changed from ${deal.stage} to ${stage}.`);
    }
    queryClient.invalidateQueries({ queryKey: ["deals"] });
    queryClient.invalidateQueries({ queryKey: ["deals-health"] });
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const intelKpis = [
    { label: "Hot Deals", value: String(hotDeals), icon: Flame, accent: "text-rose-600", kind: "health" as const, key: "Hot" },
    { label: "No Follow-up", value: String(noFollowUpDeals), icon: BellOff, accent: noFollowUpDeals > 0 ? "text-amber-600" : "text-foreground", kind: "signal" as const, key: "no-followup" },
    { label: "Stalled / At Risk", value: String(stalledDeals), icon: AlertTriangle, accent: stalledDeals > 0 ? "text-orange-600" : "text-foreground", kind: "health" as const, key: "Stalled" },
    { label: "Overdue Tasks", value: String(overdueTaskDeals), icon: AlertCircle, accent: overdueTaskDeals > 0 ? "text-red-600" : "text-foreground", kind: "signal" as const, key: "overdue" },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <div className="flex items-center justify-between animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Sales Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">{open.length} open leads · €{(totalPipeline / 1000).toFixed(0)}k pipeline · {hotDeals} hot</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> New Lead</Button>
      </div>

      {/* Commercial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-reveal-up" style={{ animationDelay: "60ms" }}>
        {[
          { label: "Pipeline Value", value: `€${(totalPipeline / 1000).toFixed(0)}k`, icon: TrendingUp, accent: "text-primary" },
          { label: "Weighted Pipeline", value: `€${(weightedPipeline / 1000).toFixed(0)}k`, icon: Target, accent: "text-foreground" },
          { label: "Win Rate", value: closedCount > 0 ? `${winRate}%` : "—", icon: Trophy, accent: "text-emerald-600" },
          { label: "Open Leads", value: String(open.length), icon: Clock, accent: "text-foreground" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-card rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <kpi.icon className={`h-4 w-4 ${kpi.accent}`} />
            </div>
            <div>
              <p className={`text-lg font-bold tabular-nums ${kpi.accent}`}>{kpi.value}</p>
              <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Operational intelligence */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-reveal-up" style={{ animationDelay: "90ms" }}>
        {intelKpis.map(kpi => {
          const isActive =
            (kpi.kind === "health" && healthFilter === kpi.key) ||
            (kpi.kind === "signal" && signalFilter === kpi.key);
          const onClick = () => {
            if (kpi.kind === "health") {
              setHealthFilter(isActive ? "all" : kpi.key);
              setSignalFilter("none");
            } else {
              setSignalFilter(isActive ? "none" : (kpi.key as "no-followup" | "overdue"));
              setHealthFilter("all");
            }
          };
          return (
            <button
              key={kpi.label}
              type="button"
              onClick={onClick}
              className={cn(
                "bg-card rounded-xl border shadow-sm p-4 flex items-center gap-3 text-left transition-colors hover:bg-secondary/40",
                isActive && "ring-2 ring-primary/40 border-primary/40"
              )}
            >
              <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <kpi.icon className={`h-4 w-4 ${kpi.accent}`} />
              </div>
              <div>
                <p className={`text-lg font-bold tabular-nums ${kpi.accent}`}>{kpi.value}</p>
                <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 animate-reveal-up flex-wrap" style={{ animationDelay: "120ms" }}>
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 flex-1 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input type="text" placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground" />
        </div>
        <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)} className="h-9 px-3 rounded-lg border bg-card text-sm text-muted-foreground">
          <option value="all">All Partners</option>
          {partnerNames.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={healthFilter} onChange={e => setHealthFilter(e.target.value)} className="h-9 px-3 rounded-lg border bg-card text-sm text-muted-foreground">
          <option value="all">All Health</option>
          <option value="Hot">Hot</option>
          <option value="Healthy">Healthy</option>
          <option value="Attention">Attention</option>
          <option value="Stalled">Stalled</option>
          <option value="AtRisk">At Risk</option>
        </select>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 pr-4 snap-x scroll-px-4 animate-reveal-up" style={{ animationDelay: "180ms" }}>
        {ACTIVE_STAGES.map(stage => {
          const stageDeals = filtered.filter(d => d.stage === stage.key);
          const stageValue = stageDeals.reduce((s, d) => s + (d.expected_value || 0), 0);
          return (
            <div key={stage.key} className="min-w-[260px] w-[260px] shrink-0"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { const id = e.dataTransfer.getData("dealId"); if (id) handleDrop(stage.key, id); }}>
              <div className={`rounded-xl ${stage.color} border p-2.5 min-h-[400px]`}>
                <div className="flex items-center justify-between mb-2.5 sticky top-0 z-10 -mx-2.5 px-2.5 pb-1.5 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[10px] font-semibold text-foreground uppercase tracking-wider">{stage.label}</h3>
                    <Badge variant="outline" className="text-[10px] tabular-nums px-1.5 py-0">{stageDeals.length}</Badge>
                  </div>
                  {stageValue > 0 && <span className="text-[10px] text-muted-foreground tabular-nums font-medium">€{(stageValue / 1000).toFixed(0)}k</span>}
                </div>
                <div className="space-y-1.5">
                  {stageDeals.map(deal => {
                    const h = healthMap?.get(deal.id);
                    
                    const followUp = formatRelativeFuture(h?.nextFollowUpAt ?? null);
                    const isStuck = (h?.daysInStage ?? 0) >= STUCK_THRESHOLD_DAYS;
                    return (
                      <Link key={deal.id} to={`/deals/${deal.id}`} draggable
                        onDragStart={e => e.dataTransfer.setData("dealId", deal.id)}
                        className="block bg-card rounded-lg border shadow-sm p-2.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground leading-tight truncate">{deal.company_name}</p>
                            <p className="text-[10.5px] text-muted-foreground truncate">{partnerMap.get(deal.partner_id || "") || "—"}</p>
                          </div>
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                        </div>

                        {(deal.expected_value || 0) > 0 && (
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-bold text-foreground tabular-nums">€{(deal.expected_value || 0).toLocaleString()}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{resolveDealProbability(deal)}%</Badge>
                          </div>
                        )}

                        {/* Intelligence row */}
                        {h && (
                          <div
                            className="flex items-center gap-1.5 flex-wrap mb-1"
                            onClickCapture={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <DealHealthBadge result={h} />
                            {h.warnings.slice(0, 2).map((w, i) => (
                              <span key={i} className="text-[9.5px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-1.5 py-0 rounded-full">{w}</span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                          <span className="truncate flex-1">
                            {(deal.assigned_salesperson || "").split(" ")[0] || "—"}
                            <span className="opacity-60"> · {h?.daysInStage ?? 0}d in stage</span>
                          </span>
                          <span className="shrink-0 ml-1.5">
                            {followUp
                              ? <span className={followUp.startsWith("overdue") ? "text-red-600 font-medium" : "text-emerald-600"}>↗ {followUp}</span>
                              : isStuck
                                ? <span className="text-amber-600 font-medium">{h?.daysInStage}d</span>
                                : <span>{formatDaysAgo(h?.lastActivityAt ?? null)}</span>}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-reveal-up" style={{ animationDelay: "240ms" }}>
        {(["Won", "Lost"] as DealStage[]).map(stage => {
          const stageInfo = PIPELINE_STAGES.find(s => s.key === stage)!;
          const stageDeals = filtered.filter(d => d.stage === stage);
          return (
            <div key={stage} className={`rounded-xl ${stageInfo.color} border p-4`}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { const id = e.dataTransfer.getData("dealId"); if (id) handleDrop(stage, id); }}>
              <h3 className="text-sm font-semibold text-foreground mb-3">{stageInfo.label} ({stageDeals.length})</h3>
              <div className="space-y-2">
                {stageDeals.map(deal => (
                  <Link key={deal.id} to={`/deals/${deal.id}`} className="flex items-center justify-between bg-card rounded-lg border p-3 hover:shadow-sm transition-shadow">
                    <div>
                      <p className="text-sm font-medium text-foreground">{deal.company_name}</p>
                      <p className="text-[11px] text-muted-foreground">{partnerMap.get(deal.partner_id || "") || "—"} · {deal.assigned_salesperson || "—"}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-foreground">€{(deal.total_value || deal.expected_value || 0).toLocaleString()}</span>
                  </Link>
                ))}
                {stageDeals.length === 0 && <p className="text-xs text-muted-foreground">No {stage.toLowerCase()} deals</p>}
              </div>
            </div>
          );
        })}
      </div>

      <CreateLeadDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
