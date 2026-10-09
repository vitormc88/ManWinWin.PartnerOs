import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDeals } from "@/hooks/useDeals";
import { usePartners } from "@/hooks/usePartners";
import { useAuth } from "@/contexts/AuthContext";
import { useDealsHealth } from "@/hooks/useDealsHealth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GripVertical,
  Search,
  TrendingUp,
  Target,
  AlertTriangle,
  Trophy,
  Plus,
  Flame,
  Clock,
  BellOff,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  PIPELINE_STAGES,
  ACTIVE_STAGES,
  getStageProbability,
  resolveDealProbability,
  isActivePipelineStage,
  STUCK_THRESHOLD_DAYS,
  type DealStage,
} from "@/data/pipeline-stages";
import { useAllProfilesMap } from "@/hooks/useAssignableUsers";
import {
  getOwnerDisplay,
  getOwnershipStatus,
  ownershipStatusColor,
  ownershipStatusLabel,
} from "@/lib/owner-display";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { DealHealthBadge } from "@/components/deals/DealHealthBadge";
import { cn } from "@/lib/utils";
import { logSystemActivity } from "@/lib/activity-log";
import { formatMoney } from "@/lib/money";
import { isPartnerScopedView } from "@/lib/partner-scope";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { authDealValue } from "@/lib/analytics-corrections";
import { toast } from "sonner";
import {
  dealStageGate,
  requiresDedicatedWorkflow,
  stageLabel,
  type GateResult,
} from "@/lib/pipeline-gates";
import { loadDealGateContext } from "@/lib/pipeline-gate-context";
import { StageGateDialog } from "@/components/commercial/StageGateDialog";
import { useLogStageGateOverride } from "@/hooks/useAgreedNextSteps";

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
  const access = useModuleAccess();
  const editable = !access.isLoading && access.canEdit("pipeline");
  const [view, setView] = useState<"board" | "list">("board");
  const [closedTab, setClosedTab] = useState<"Won" | "Lost">("Lost");
  const [closedPage, setClosedPage] = useState(1);
  const [listPage, setListPage] = useState(1);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [dashboardParams, setDashboardParams] = useSearchParams();
  const dashboardFilter = dashboardParams.get("dashboard");
  const userPartnerId = !isHQ ? profile?.partner_id : null;
  const [search, setSearch] = useState("");
  const [partnerFilter, setPartnerFilter] = useState(
    dashboardParams.get("partner_id") || "all",
  );
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [signalFilter, setSignalFilter] = useState<
    "none" | "no-followup" | "overdue"
  >("none");
  const [showCreate, setShowCreate] = useState(false);
  const [pendingMove, setPendingMove] = useState<{
    deal: any;
    stage: DealStage;
    gate: GateResult;
  } | null>(null);
  const [gatePending, setGatePending] = useState(false);
  const logOverride = useLogStageGateOverride();
  const { data: deals = [], isLoading, isError, refetch } = useDeals();
  const { data: partners = [] } = usePartners();
  const {
    data: healthMap,
    isLoading: healthLoading,
    isError: healthError,
  } = useDealsHealth(deals);
  const { data: profilesMap } = useAllProfilesMap();
  const queryClient = useQueryClient();

  const partnerMap = new Map(partners.map((p) => [p.id, p.company_name]));
  const partnerScoped = isPartnerScopedView({
    isHQ: !!isHQ,
    partnerId: profile?.partner_id,
    visiblePartnerCount: partners.length,
  });
  const selectablePartners = partners.filter(
    (p) => includeArchived || (p.status === "Active" && p.is_active !== false),
  );
  useEffect(() => {
    setClosedPage(1);
    setListPage(1);
  }, [
    search,
    partnerFilter,
    healthFilter,
    signalFilter,
    dashboardFilter,
    closedTab,
  ]);

  const filtered = deals.filter((d) => {
    if (
      ["open", "undated"].includes(dashboardFilter || "") &&
      (d.status !== "Open" || !isActivePipelineStage(d.stage))
    )
      return false;
    if (dashboardFilter === "undated" && d.expected_close_date) return false;
    const pName = partnerMap.get(d.partner_id || "") || "";
    const ownerDisplay = getOwnerDisplay(d as any, profilesMap).toLowerCase();
    const matchSearch =
      d.company_name.toLowerCase().includes(search.toLowerCase()) ||
      ownerDisplay.includes(search.toLowerCase());
    const matchPartner =
      partnerFilter === "all" ||
      pName === partnerFilter ||
      d.partner_id === partnerFilter ||
      (partnerFilter === "hq" && !d.partner_id);
    const h = healthMap?.get(d.id);
    const matchHealth =
      healthFilter === "all" ||
      (healthFilter === "stalled-risk"
        ? h?.health === "Stalled" || h?.health === "AtRisk"
        : h?.health === healthFilter);
    const matchSignal =
      signalFilter === "none" ||
      (signalFilter === "no-followup" &&
        !!h?.warnings.includes("No follow-up")) ||
      (signalFilter === "overdue" && !!h?.hasOverdueTask);
    return matchSearch && matchPartner && matchHealth && matchSignal;
  });

  // Single source of truth: "open" = status Open AND stage is a rendered active Kanban stage.
  // Anything else (legacy/unknown stages, Won, Lost) is excluded from open KPIs.
  const open = filtered.filter(
    (d) => d.status === "Open" && isActivePipelineStage(d.stage),
  );
  const won = filtered.filter((d) => d.status === "Won" && d.stage === "Won");
  const lost = filtered.filter(
    (d) => d.status === "Lost" && d.stage === "Lost",
  );
  // Canonical authoritative value: prefer total_value, fallback to expected_value
  const authValue = authDealValue;
  // Canonical probability: explicit deal probability if set, otherwise stage probability.
  // Single source of truth — must match SQL pipeline_stage_probability + resolveDealProbability.
  const canonicalProb = (d: (typeof open)[number]) => resolveDealProbability(d);
  const totalPipeline = open.reduce((s, d) => s + authValue(d), 0);
  const weightedPipeline = open.reduce(
    (s, d) => s + authValue(d) * (canonicalProb(d) / 100),
    0,
  );
  const closedCount = won.length + lost.length;
  const winRate =
    closedCount > 0 ? Math.round((won.length / closedCount) * 100) : 0;

  // ── Intelligence counters (computed from health map) ────────────────
  const hotDeals = open.filter(
    (d) => healthMap?.get(d.id)?.health === "Hot",
  ).length;
  const stalledDeals = open.filter((d) => {
    const h = healthMap?.get(d.id)?.health;
    return h === "Stalled" || h === "AtRisk";
  }).length;
  const noFollowUpDeals = open.filter((d) =>
    healthMap?.get(d.id)?.warnings.includes("No follow-up"),
  ).length;
  const overdueTaskDeals = open.filter(
    (d) => healthMap?.get(d.id)?.hasOverdueTask,
  ).length;

  const applyStageMove = async (stage: DealStage, dealId: string) => {
    const deal = deals.find((d) => d.id === dealId);
    const newStatus =
      stage === "Won" ? "Won" : stage === "Lost" ? "Lost" : "Open";
    const prob = getStageProbability(stage);
    const { error } = await supabase
      .from("deals")
      .update({
        stage,
        status: newStatus,
        probability: prob,
        stage_entered_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", dealId)
      .eq("stage", deal?.stage || "")
      .select("id")
      .single();
    if (error) throw error;
    if (deal && deal.stage !== stage) {
      logSystemActivity(
        dealId,
        "Stage changed",
        `Stage changed from ${deal.stage} to ${stage}.`,
      );
    }
    queryClient.invalidateQueries({ queryKey: ["deals"] });
    queryClient.invalidateQueries({ queryKey: ["partner-metrics"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
    queryClient.invalidateQueries({ queryKey: ["revenue-history"] });
    queryClient.invalidateQueries({ queryKey: ["deals-health"] });
  };

  const handleDrop = async (stage: DealStage, dealId: string) => {
    const deal = deals.find((d) => d.id === dealId);
    if (!editable || !deal || deal.status !== "Open" || deal.stage === stage)
      return;

    // Won / Lost keep their dedicated workflows — never via drag and drop.
    if (requiresDedicatedWorkflow(stage)) {
      toast.error(
        `Use the "Mark as ${stage}" action on the opportunity — ${stage} has its own workflow.`,
      );
      return;
    }

    try {
      const ctx = await loadDealGateContext(deal as never);
      const gate = dealStageGate(stage, ctx);
      if (gate.status === "ok") {
        await applyStageMove(stage, dealId);
        return;
      }
      setPendingMove({ deal, stage, gate });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not move opportunity",
      );
    }
  };

  const confirmGatedMove = async (reason: string | null) => {
    if (!pendingMove) return;
    setGatePending(true);
    try {
      await logOverride.mutateAsync({
        entity_type: "deal",
        deal_id: pendingMove.deal.id,
        from_stage: pendingMove.deal.stage,
        to_stage: pendingMove.stage,
        missing_evidence: pendingMove.gate.missingKeys,
        reason: reason || "No reason given",
      });
      logSystemActivity(
        pendingMove.deal.id,
        "Stage gate override",
        `Advanced to ${pendingMove.stage} without: ${pendingMove.gate.missing.join("; ")}. Reason: ${reason}`,
      );
      await applyStageMove(pendingMove.stage, pendingMove.deal.id);
      setPendingMove(null);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not record the override",
      );
    } finally {
      setGatePending(false);
    }
  };

  if (isError)
    return (
      <div role="alert" className="rounded-xl border p-6">
        Pipeline unavailable.{" "}
        <Button variant="outline" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  const closedRows = (closedTab === "Won" ? won : lost)
    .slice()
    .sort((a, b) =>
      (closedTab === "Won"
        ? b.won_at || b.created_at
        : b.lost_at || b.created_at
      ).localeCompare(
        closedTab === "Won"
          ? a.won_at || a.created_at
          : a.lost_at || a.created_at,
      ),
    );
  const closedPages = Math.max(1, Math.ceil(closedRows.length / 10));
  const safeClosedPage = Math.min(closedPage, closedPages);
  const listPages = Math.max(1, Math.ceil(open.length / 15));
  const safeListPage = Math.min(listPage, listPages);
  if (isLoading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );

  const intelKpis = [
    {
      label: "Hot Deals",
      value: String(hotDeals),
      icon: Flame,
      accent: "text-rose-600",
      kind: "health" as const,
      key: "Hot",
    },
    {
      label: "No Follow-up",
      value: String(noFollowUpDeals),
      icon: BellOff,
      accent: noFollowUpDeals > 0 ? "text-amber-600" : "text-foreground",
      kind: "signal" as const,
      key: "no-followup",
    },
    {
      label: "Stalled / At Risk",
      value: String(stalledDeals),
      icon: AlertTriangle,
      accent: stalledDeals > 0 ? "text-orange-600" : "text-foreground",
      kind: "health" as const,
      key: "stalled-risk",
    },
    {
      label: "Opportunities with overdue tasks",
      value: String(overdueTaskDeals),
      icon: AlertCircle,
      accent: overdueTaskDeals > 0 ? "text-red-600" : "text-foreground",
      kind: "signal" as const,
      key: "overdue",
    },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {dashboardFilter && (
        <p className="text-sm bg-secondary p-3 rounded">
          {dashboardFilter === "undated"
            ? "Open opportunities without an expected close date"
            : "Current open opportunities"}{" "}
          ·{" "}
          <button
            className="underline text-primary"
            onClick={() => {
              const next = new URLSearchParams(dashboardParams);
              next.delete("dashboard");
              setDashboardParams(next);
            }}
          >
            Clear dashboard filter
          </button>
        </p>
      )}
      <div className="flex items-center justify-between animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Sales Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {open.length} open opportunities ·{" "}
            {formatMoney(totalPipeline, { compact: true })} pipeline ·{" "}
            {hotDeals} hot
          </p>
        </div>
        {editable && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Opportunity
          </Button>
        )}
      </div>

      {/* Commercial KPIs */}
      <div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-reveal-up"
        style={{ animationDelay: "60ms" }}
      >
        {[
          {
            label: "Pipeline Value",
            value: formatMoney(totalPipeline, { compact: true }),
            icon: TrendingUp,
            accent: "text-primary",
          },
          {
            label: "Weighted Pipeline",
            value: formatMoney(weightedPipeline, { compact: true }),
            icon: Target,
            accent: "text-foreground",
          },
          {
            label: "Win Rate · filtered closed",
            value: closedCount > 0 ? `${winRate}%` : "—",
            icon: Trophy,
            accent: "text-emerald-600",
          },
          {
            label: "Open Opportunities",
            value: String(open.length),
            icon: Clock,
            accent: "text-foreground",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-card rounded-xl border shadow-sm p-4 flex items-center gap-3"
          >
            <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <kpi.icon className={`h-4 w-4 ${kpi.accent}`} />
            </div>
            <div>
              <p className={`text-lg font-bold tabular-nums ${kpi.accent}`}>
                {kpi.value}
              </p>
              <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Operational intelligence */}
      <div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-reveal-up"
        style={{ animationDelay: "90ms" }}
      >
        {intelKpis.map((kpi) => {
          const isActive =
            (kpi.kind === "health" && healthFilter === kpi.key) ||
            (kpi.kind === "signal" && signalFilter === kpi.key);
          const onClick = () => {
            if (kpi.kind === "health") {
              setHealthFilter(isActive ? "all" : kpi.key);
              setSignalFilter("none");
            } else {
              setSignalFilter(
                isActive ? "none" : (kpi.key as "no-followup" | "overdue"),
              );
              setHealthFilter("all");
            }
          };
          return (
            <button
              key={kpi.label}
              type="button"
              disabled={healthLoading || healthError}
              aria-pressed={isActive}
              onClick={onClick}
              className={cn(
                "bg-card rounded-xl border shadow-sm p-4 flex items-center gap-3 text-left transition-colors hover:bg-secondary/40",
                isActive && "ring-2 ring-primary/40 border-primary/40",
              )}
            >
              <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <kpi.icon className={`h-4 w-4 ${kpi.accent}`} />
              </div>
              <div>
                <p className={`text-lg font-bold tabular-nums ${kpi.accent}`}>
                  {healthError
                    ? "Unavailable"
                    : healthLoading
                      ? "…"
                      : kpi.value}
                </p>
                <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div
        className="flex items-center gap-3 animate-reveal-up flex-wrap"
        style={{ animationDelay: "120ms" }}
      >
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 flex-1 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            aria-label="Search opportunities"
            placeholder="Search opportunities or owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground"
          />
        </div>
        {!partnerScoped && (
          <select
            aria-label="Partner"
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border bg-card text-sm text-muted-foreground"
          >
            <option value="all">All Partners</option>
            <option value="hq">HQ Direct</option>
            {partners
              .filter(
                (p) => selectablePartners.includes(p) || p.id === partnerFilter,
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.company_name}
                  {p.status === "Archived" ? " (archived)" : ""}
                </option>
              ))}
          </select>
        )}
        <select
          aria-label="Health"
          value={healthFilter}
          onChange={(e) => setHealthFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border bg-card text-sm text-muted-foreground"
        >
          <option value="all">All Health</option>
          <option value="Hot">Hot</option>
          <option value="Healthy">Healthy</option>
          <option value="Attention">Attention</option>
          <option value="stalled-risk">Stalled / At Risk</option>
          <option value="Stalled">Stalled</option>
          <option value="AtRisk">At Risk</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" aria-label="Pipeline view">
          <Button
            variant={view === "board" ? "default" : "outline"}
            aria-pressed={view === "board"}
            onClick={() => setView("board")}
          >
            Board
          </Button>
          <Button
            variant={view === "list" ? "default" : "outline"}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </Button>
        </div>
        {!partnerScoped && (
          <label className="text-xs flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Show archived partners in selector
          </label>
        )}
        {(search ||
          partnerFilter !== "all" ||
          healthFilter !== "all" ||
          signalFilter !== "none") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearch("");
              setPartnerFilter("all");
              setHealthFilter("all");
              setSignalFilter("none");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
      {healthError && (
        <p role="alert" className="text-sm text-amber-700">
          Health signals unavailable. Opportunity values remain available.
        </p>
      )}
      {view === "board" && (
        <p className="text-xs text-muted-foreground">
          Scroll within each stage to browse opportunities; scroll horizontally
          for later stages.{" "}
          {editable
            ? "Drag a card to change an open stage, or open it for all actions."
            : "Read-only view."}
        </p>
      )}
      {view === "board" && (
        <div
          className="flex gap-3 overflow-x-auto pb-4 pr-4 snap-x scroll-px-4 animate-reveal-up"
          style={{ animationDelay: "180ms" }}
        >
          {ACTIVE_STAGES.map((stage) => {
            const stageDeals = open.filter((d) => d.stage === stage.key);
            const stageValue = stageDeals.reduce((s, d) => s + authValue(d), 0);
            return (
              <div
                key={stage.key}
                className="min-w-[260px] w-[260px] shrink-0"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData("dealId");
                  if (id) handleDrop(stage.key, id);
                }}
              >
                <div
                  className={`rounded-xl ${stage.color} border p-2.5 h-[520px] flex flex-col`}
                >
                  <div className="flex items-center justify-between mb-2.5 sticky top-0 z-10 -mx-2.5 px-2.5 pb-1.5 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[10px] font-semibold text-foreground uppercase tracking-wider">
                        {stageLabel(stage.key, stage.label)}
                      </h3>
                      <Badge
                        variant="outline"
                        className="text-[10px] tabular-nums px-1.5 py-0"
                      >
                        {stageDeals.length}
                      </Badge>
                    </div>
                    {stageValue > 0 && (
                      <span className="text-[10px] text-muted-foreground tabular-nums font-medium">
                        {formatMoney(stageValue, { compact: true })}
                      </span>
                    )}
                  </div>
                  <div
                    tabIndex={0}
                    aria-label={`${stageLabel(stage.key, stage.label)} opportunities`}
                    className="space-y-2 overflow-y-auto overscroll-contain min-h-0 flex-1 pr-1"
                  >
                    {stageDeals.length === 0 && (
                      <p className="text-xs text-muted-foreground py-6 text-center">
                        No opportunities in this stage
                      </p>
                    )}
                    {stageDeals.map((deal) => {
                      const h = healthMap?.get(deal.id);

                      const followUp = formatRelativeFuture(
                        h?.nextFollowUpAt ?? null,
                      );
                      const isStuck =
                        (h?.daysInStage ?? 0) >= STUCK_THRESHOLD_DAYS;
                      return (
                        <Link
                          key={deal.id}
                          to={`/deals/${deal.id}`}
                          draggable={editable}
                          onDragStart={(e) =>
                            editable &&
                            e.dataTransfer.setData("dealId", deal.id)
                          }
                          className="block bg-card rounded-lg border shadow-sm p-3 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0 flex-1">
                              <p
                                className="text-sm font-semibold text-foreground leading-tight truncate"
                                title={deal.company_name}
                              >
                                {deal.company_name}
                              </p>
                              {!partnerScoped && (
                                <p className="text-[10.5px] text-muted-foreground truncate">
                                  {partnerMap.get(deal.partner_id || "") || "—"}
                                </p>
                              )}
                            </div>
                            {editable && (
                              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                            )}
                          </div>

                          {authValue(deal) > 0 && (
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-bold text-foreground tabular-nums">
                                {formatMoney(authValue(deal))}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {resolveDealProbability(deal)}%
                              </Badge>
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
                                <span
                                  key={i}
                                  className="text-[9.5px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-1.5 py-0 rounded-full"
                                >
                                  {w}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                            <span className="truncate flex-1 inline-flex items-center gap-1">
                              <span>
                                {getOwnerDisplay(
                                  deal as any,
                                  profilesMap,
                                ).split(" ")[0] || "—"}
                              </span>
                              {isHQ &&
                                (() => {
                                  const s = getOwnershipStatus(
                                    deal as any,
                                    profilesMap,
                                  );
                                  if (s === "assigned" || s === "unassigned")
                                    return null;
                                  return (
                                    <span
                                      className={`text-[9px] px-1 py-0 border rounded-full ${ownershipStatusColor(s)}`}
                                    >
                                      {ownershipStatusLabel(s)}
                                    </span>
                                  );
                                })()}
                              <span className="opacity-60">
                                {" "}
                                · {h?.daysInStage ?? 0}d in stage
                              </span>
                            </span>
                            <span className="shrink-0 ml-1.5">
                              {followUp ? (
                                <span
                                  className={
                                    followUp.startsWith("overdue")
                                      ? "text-red-600 font-medium"
                                      : "text-emerald-600"
                                  }
                                >
                                  ↗ {followUp}
                                </span>
                              ) : isStuck ? (
                                <span className="text-amber-600 font-medium">
                                  {h?.daysInStage}d
                                </span>
                              ) : (
                                <span>
                                  {formatDaysAgo(h?.lastActivityAt ?? null)}
                                </span>
                              )}
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
      )}

      {view === "list" && (
        <section className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left">
                <tr>
                  {[
                    "Opportunity",
                    "Stage",
                    ...(partnerScoped ? [] : ["Partner"]),
                    "Owner",
                    "Value",
                    "Expected close",
                  ].map((h) => (
                    <th className="p-3" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {open
                  .slice((safeListPage - 1) * 15, safeListPage * 15)
                  .map((d) => (
                    <tr className="border-t hover:bg-secondary/30" key={d.id}>
                      <td className="p-3">
                        <Link
                          className="font-medium hover:underline"
                          to={`/deals/${d.id}`}
                        >
                          {d.company_name}
                        </Link>
                      </td>
                      <td className="p-3">{stageLabel(d.stage)}</td>
                      {!partnerScoped && (
                        <td className="p-3">
                          {partnerMap.get(d.partner_id || "") ||
                            (d.partner_id ? "Unknown partner" : "HQ Direct")}
                        </td>
                      )}
                      <td className="p-3">
                        {getOwnerDisplay(d as any, profilesMap)}
                      </td>
                      <td className="p-3 tabular-nums whitespace-nowrap">
                        {formatMoney(authValue(d))}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {d.expected_close_date || "Not set"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {open.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              No open opportunities match your filters.
            </p>
          )}
          <div className="p-3 border-t flex items-center justify-between text-sm">
            <span>
              {open.length} opportunities · page {safeListPage} / {listPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safeListPage === 1}
                onClick={() => setListPage(safeListPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={safeListPage === listPages}
                onClick={() => setListPage(safeListPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </section>
      )}
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-semibold">
          Closed opportunities · {won.length} Won · {lost.length} Lost
        </summary>
        <p className="text-xs text-muted-foreground mt-2">
          Historical results under the current filters. Most recent closures
          first; 10 per page.
        </p>
        <div className="flex gap-2 my-3">
          {(["Won", "Lost"] as const).map((status) => (
            <Button
              key={status}
              variant={closedTab === status ? "default" : "outline"}
              aria-pressed={closedTab === status}
              onClick={() => setClosedTab(status)}
            >
              {status} ({status === "Won" ? won.length : lost.length})
            </Button>
          ))}
        </div>
        <div className="space-y-2">
          {closedRows
            .slice((safeClosedPage - 1) * 10, safeClosedPage * 10)
            .map((deal) => (
              <Link
                key={deal.id}
                to={`/deals/${deal.id}`}
                className="flex items-center justify-between gap-3 border rounded-lg p-3 hover:bg-secondary/30"
              >
                <div className="min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    title={deal.company_name}
                  >
                    {deal.company_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getOwnerDisplay(deal as any, profilesMap)} ·{" "}
                    {(closedTab === "Won" ? deal.won_at : deal.lost_at)?.slice(
                      0,
                      10,
                    ) || "Closure date not recorded"}
                  </p>
                </div>
                <span className="text-sm font-semibold whitespace-nowrap">
                  {formatMoney(authValue(deal))}
                </span>
              </Link>
            ))}
        </div>
        {!closedRows.length && (
          <p className="text-sm text-muted-foreground py-4">
            No {closedTab.toLowerCase()} opportunities match your filters.
          </p>
        )}
        <div className="flex items-center justify-between mt-3 text-sm">
          <span>
            Page {safeClosedPage} / {closedPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safeClosedPage === 1}
              onClick={() => setClosedPage(safeClosedPage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safeClosedPage === closedPages}
              onClick={() => setClosedPage(safeClosedPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </details>

      <CreateLeadDialog open={showCreate} onOpenChange={setShowCreate} />

      {pendingMove && (
        <StageGateDialog
          open
          onOpenChange={(v) => {
            if (!v) setPendingMove(null);
          }}
          fromStage={stageLabel(pendingMove.deal.stage)}
          toStage={stageLabel(pendingMove.stage)}
          gate={pendingMove.gate}
          isPending={gatePending}
          onConfirm={confirmGatedMove}
        />
      )}
    </div>
  );
}
