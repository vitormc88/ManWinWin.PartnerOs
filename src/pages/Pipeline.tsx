import { useState } from "react";
import { Link } from "react-router-dom";
import { useDeals } from "@/hooks/useDeals";
import { usePartners } from "@/hooks/usePartners";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GripVertical, Search, TrendingUp, Target, AlertTriangle, Trophy, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { PIPELINE_STAGES, ACTIVE_STAGES, getStageProbability, STUCK_THRESHOLD_DAYS, type DealStage } from "@/data/pipeline-stages";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";


export default function Pipeline() {
  const { isHQ, profile } = useAuth();
  const userPartnerId = !isHQ ? profile?.partner_id : null;
  const [search, setSearch] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const { data: deals = [], isLoading } = useDeals();
  const { data: partners = [] } = usePartners();
  const queryClient = useQueryClient();

  const partnerMap = new Map(partners.map(p => [p.id, p.company_name]));
  const partnerNames = [...new Set(deals.map(d => partnerMap.get(d.partner_id || "") || "Unknown"))].filter(Boolean);

  const filtered = deals.filter(d => {
    const pName = partnerMap.get(d.partner_id || "") || "";
    const matchSearch = d.company_name.toLowerCase().includes(search.toLowerCase()) || (d.assigned_salesperson || "").toLowerCase().includes(search.toLowerCase());
    const matchPartner = partnerFilter === "all" || pName === partnerFilter;
    return matchSearch && matchPartner;
  });

  const open = filtered.filter(d => d.status === "Open");
  const won = filtered.filter(d => d.status === "Won");
  const lost = filtered.filter(d => d.status === "Lost");
  const totalPipeline = open.reduce((s, d) => s + (d.expected_value || 0), 0);
  const weightedPipeline = open
    .filter(d => (d.expected_value || 0) > 0)
    .reduce((s, d) => s + (d.expected_value || 0) * (getStageProbability(d.stage) / 100), 0);
  const closedCount = won.length + lost.length;
  const winRate = closedCount > 0 ? Math.round((won.length / closedCount) * 100) : 0;
  const stuckDeals = open.filter(d => {
    const entered = d.stage_entered_at ? new Date(d.stage_entered_at) : new Date(d.created_at);
    const daysSince = Math.floor((Date.now() - entered.getTime()) / 86400000);
    return daysSince >= STUCK_THRESHOLD_DAYS;
  }).length;

  const handleDrop = async (stage: DealStage, dealId: string) => {
    const newStatus = stage === "Won" ? "Won" : stage === "Lost" ? "Lost" : "Open";
    const prob = getStageProbability(stage);
    await supabase.from("deals").update({
      stage,
      status: newStatus,
      probability: prob,
      stage_entered_at: new Date().toISOString(),
    }).eq("id", dealId);
    queryClient.invalidateQueries({ queryKey: ["deals"] });
  };




  if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <div className="flex items-center justify-between animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Sales Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">{open.length} open leads · €{(totalPipeline / 1000).toFixed(0)}k pipeline</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> New Lead</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-reveal-up" style={{ animationDelay: "60ms" }}>
        {[
          { label: "Pipeline Value", value: `€${(totalPipeline / 1000).toFixed(0)}k`, icon: TrendingUp, accent: "text-primary" },
          { label: "Weighted Pipeline", value: `€${(weightedPipeline / 1000).toFixed(0)}k`, icon: Target, accent: "text-foreground" },
          { label: "Win Rate", value: closedCount > 0 ? `${winRate}%` : "—", icon: Trophy, accent: "text-emerald-600" },
          { label: "Stuck Deals", value: String(stuckDeals), icon: AlertTriangle, accent: stuckDeals > 0 ? "text-amber-600" : "text-foreground" },
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

      <div className="flex items-center gap-3 animate-reveal-up" style={{ animationDelay: "120ms" }}>
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 flex-1 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input type="text" placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground" />
        </div>
        <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)} className="h-9 px-3 rounded-lg border bg-card text-sm text-muted-foreground">
          <option value="all">All Partners</option>
          {partnerNames.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 animate-reveal-up" style={{ animationDelay: "180ms" }}>
        {ACTIVE_STAGES.map(stage => {
          const stageDeals = filtered.filter(d => d.stage === stage.key);
          const stageValue = stageDeals.reduce((s, d) => s + (d.expected_value || 0), 0);
          return (
            <div key={stage.key} className="min-w-[260px] w-[260px] shrink-0"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { const id = e.dataTransfer.getData("dealId"); if (id) handleDrop(stage.key, id); }}>
              <div className={`rounded-xl ${stage.color} border p-3 min-h-[400px]`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[10px] font-semibold text-foreground uppercase tracking-wider">{stage.label}</h3>
                    <Badge variant="outline" className="text-[10px] tabular-nums">{stageDeals.length}</Badge>
                  </div>
                  {stageValue > 0 && <span className="text-[10px] text-muted-foreground tabular-nums font-medium">€{(stageValue / 1000).toFixed(0)}k</span>}
                </div>
                <div className="space-y-2">
                  {stageDeals.map(deal => {
                    const entered = deal.stage_entered_at ? new Date(deal.stage_entered_at) : new Date(deal.created_at);
                    const daysInStage = Math.floor((Date.now() - entered.getTime()) / 86400000);
                    const isStuck = daysInStage >= STUCK_THRESHOLD_DAYS;
                    return (
                      <Link key={deal.id} to={`/deals/${deal.id}`} draggable
                        onDragStart={e => e.dataTransfer.setData("dealId", deal.id)}
                        className="block bg-card rounded-lg border shadow-sm p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <p className="text-sm font-medium text-foreground leading-tight">{deal.company_name}</p>
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                        </div>
                        <p className="text-[11px] text-muted-foreground mb-1.5">{partnerMap.get(deal.partner_id || "") || "—"}</p>
                        {(deal.expected_value || 0) > 0 && (
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-semibold text-foreground tabular-nums">€{(deal.expected_value || 0).toLocaleString()}</span>
                            <Badge variant="outline" className="text-[10px]">{getStageProbability(deal.stage)}%</Badge>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{(deal.assigned_salesperson || "").split(" ")[0] || "—"}</span>
                          <div className="flex items-center gap-2">
                            {isStuck && <span className="text-amber-600 font-medium">{daysInStage}d</span>}
                            {deal.country && <span>{deal.country}</span>}
                          </div>
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
