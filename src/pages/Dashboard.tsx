import { useMemo } from "react";
import { DollarSign, Users, TrendingUp, Activity, AlertTriangle, RefreshCcw, ArrowRight, Clock, Plus } from "lucide-react";
import { KPICard } from "@/components/dashboard/KPICard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { PartnerHealthList } from "@/components/dashboard/PartnerHealthList";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { usePartners } from "@/hooks/usePartners";
import { useClients } from "@/hooks/useClients";
import { useDeals, useRenewals, useNotifications } from "@/hooks/useDeals";
import { useAuth } from "@/contexts/AuthContext";
import { getStageProbability, isActivePipelineStage } from "@/data/pipeline-stages";

export default function Dashboard() {
  const { isHQ, profile } = useAuth();
  const { data: partners = [] } = usePartners();
  const { data: clients = [] } = useClients();
  const { data: deals = [] } = useDeals();
  const { data: renewals = [] } = useRenewals();
  const { data: notifications = [] } = useNotifications();

  const clientMap = useMemo(() => {
    const m: Record<string, { client_code: string; commercial_name: string; short_name?: string | null }> = {};
    clients.forEach(c => { m[c.id] = { client_code: c.client_code, commercial_name: c.commercial_name, short_name: c.short_name }; });
    return m;
  }, [clients]);

  // Revenue & Pipeline from deals (same logic as Pipeline module)
  // Same definitions as Pipeline page so KPIs match the visible Kanban
  const wonDeals = deals.filter(d => d.status === "Won" && d.stage === "Won");
  const openDeals = deals.filter(d => d.status === "Open" && isActivePipelineStage(d.stage));
  const totalRevenue = wonDeals.reduce((s, d) => s + (d.expected_value || 0), 0);
  const totalPipeline = openDeals.reduce((s, d) => s + (d.expected_value || 0), 0);

  const activePartners = partners.filter((p) => p.status === "Active").length;
  const activeClients = clients.filter(c => c.status === "Active").length;
  const premiumClients = clients.filter(c => c.is_premium).length;

  const now = new Date();

  // Active (non-terminal) renewals with days calculated
  const activeRenewals = useMemo(() => renewals
    .filter((r: any) => r.status !== "Won" && r.status !== "Lost" && r.renewal_date)
    .map((r: any) => ({
      ...r,
      _days: Math.ceil((new Date(r.renewal_date).getTime() - now.getTime()) / 86400000),
    })), [renewals, now]);

  const urgentRenewals = activeRenewals.filter(r => r._days >= 0 && r._days <= 30);
  const overdueRenewals = activeRenewals.filter(r => r._days < 0);

  // Exclusive buckets
  const bucket0_30 = activeRenewals.filter(r => r._days >= 0 && r._days <= 30);
  const bucket31_60 = activeRenewals.filter(r => r._days >= 31 && r._days <= 60);
  const bucket61_90 = activeRenewals.filter(r => r._days >= 61 && r._days <= 90);

  const totalDueSoonValue = urgentRenewals.reduce((s: number, r: any) => s + (Number(r.estimated_value) || 0), 0);

  const atRiskPartners = partners.filter(p => (p.health_score ?? 50) < 40);
  const unreadNotifs = notifications.filter((n: any) => !n.is_read);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="animate-reveal-up">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {isHQ ? "Dashboard" : `${partners[0]?.company_name || "Partner"} Dashboard`}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isHQ ? "Partner ecosystem overview" : "Your partner overview"} · {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {(overdueRenewals.length > 0 || atRiskPartners.length > 0) && (
        <div className="bg-destructive/8 border border-destructive/20 rounded-xl p-4 flex items-start gap-3 animate-reveal-up stagger-1">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Action Required</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
              {overdueRenewals.length > 0 && (
                <Link to="/renewals" className="text-xs text-destructive hover:underline">{overdueRenewals.length} overdue renewal{overdueRenewals.length > 1 ? "s" : ""}</Link>
              )}
              {atRiskPartners.length > 0 && (
                <Link to="/partners" className="text-xs text-destructive hover:underline">{atRiskPartners.length} partner{atRiskPartners.length > 1 ? "s" : ""} at risk</Link>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Revenue" value={totalRevenue > 0 ? `€${totalRevenue.toLocaleString()}` : "€0"} change={`${wonDeals.length} won deal${wonDeals.length !== 1 ? "s" : ""}`} changeType={wonDeals.length > 0 ? "positive" : "neutral"} icon={DollarSign} delay={60} />
        <KPICard title="Active Partners" value={String(activePartners)} change={`of ${partners.length} total`} changeType="neutral" icon={Users} delay={120} />
        <KPICard title="Pipeline Value" value={totalPipeline > 0 ? `€${totalPipeline.toLocaleString()}` : "€0"} change={`${openDeals.length} open deal${openDeals.length !== 1 ? "s" : ""}`} changeType={openDeals.length > 0 ? "positive" : "neutral"} icon={TrendingUp} delay={180} />
        <KPICard title="Active Clients" value={String(activeClients)} change={`${premiumClients} premium`} changeType="neutral" icon={Activity} delay={240} />
      </div>

      {/* Renewals Urgency */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-reveal-up stagger-2">
        <div className="bg-card rounded-xl border shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-foreground text-sm">Renewals Due Soon</h3>
              {totalDueSoonValue > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">Total: €{totalDueSoonValue.toLocaleString()}</p>
              )}
            </div>
            <Link to="/renewals" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="space-y-2.5">
            {urgentRenewals.slice(0, 4).map((r: any) => {
              const client = clientMap[r.client_id];
              const label = client ? `${client.client_code} — ${client.short_name || client.commercial_name}` : r.client_id.slice(0, 8);
              const value = Number(r.estimated_value) || 0;
              return (
                <div key={r.id} className="flex items-center justify-between">
                  <div className="min-w-0 flex-1 mr-2">
                    <Link to={`/clients/${r.client_id}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block">{label}</Link>
                    <p className="text-[11px] text-muted-foreground truncate">{r.renewal_type} · {r.status}{value > 0 ? ` · €${value.toLocaleString()}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs tabular-nums font-semibold ${r._days < 0 ? "text-destructive" : "text-warning-foreground"}`}>
                      {r._days < 0 ? `${Math.abs(r._days)}d ago` : `${r._days}d`}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{r.renewal_type}</Badge>
                  </div>
                </div>
              );
            })}
            {urgentRenewals.length === 0 && <p className="text-xs text-muted-foreground">No urgent renewals</p>}
          </div>
        </div>

        <div className="bg-card rounded-xl border shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground text-sm">Renewal Summary</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "0–30 days", value: bucket0_30.length, color: "text-warning-foreground" },
              { label: "31–60 days", value: bucket31_60.length, color: "text-foreground" },
              { label: "61–90 days", value: bucket61_90.length, color: "text-foreground" },
              { label: "Overdue", value: overdueRenewals.length, color: "text-destructive" },
            ].map(item => (
              <div key={item.label} className="text-center p-2 rounded-lg bg-secondary/50">
                <p className={`text-lg font-bold tabular-nums ${item.color}`}>{item.value}</p>
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl border shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground text-sm">Recent Alerts</h3>
            <Link to="/notifications" className="text-xs text-primary hover:underline">All →</Link>
          </div>
          <div className="space-y-2.5">
            {unreadNotifs.slice(0, 4).map((n: any) => (
              <div key={n.id} className="flex items-start gap-2">
                <div className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${n.type === "danger" ? "bg-destructive" : n.type === "warning" ? "bg-amber-500" : "bg-blue-500"}`} />
                <p className="text-xs text-muted-foreground line-clamp-2">{n.title}</p>
              </div>
            ))}
            {unreadNotifs.length === 0 && <p className="text-xs text-muted-foreground">No new alerts</p>}
          </div>
        </div>
      </div>

      {isHQ && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <RevenueChart />
          </div>
          <PartnerHealthList />
        </div>
      )}

      <RecentActivity />
    </div>
  );
}
