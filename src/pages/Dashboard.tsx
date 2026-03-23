import { DollarSign, Users, TrendingUp, Activity, AlertTriangle, RefreshCcw, ArrowRight, Clock, Plus } from "lucide-react";
import { KPICard } from "@/components/dashboard/KPICard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { PartnerHealthList } from "@/components/dashboard/PartnerHealthList";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { usePartners } from "@/hooks/usePartners";
import { useClients } from "@/hooks/useClients";
import { useRenewals, useNotifications } from "@/hooks/useDeals";
import { useAuth } from "@/contexts/AuthContext";

export default function Dashboard() {
  const { isHQ, profile } = useAuth();
  const { data: partners = [] } = usePartners();
  const { data: clients = [] } = useClients();
  const { data: renewals = [] } = useRenewals();
  const { data: notifications = [] } = useNotifications();

  const totalRevenue = partners.reduce((s, p) => s + (Number(p.total_revenue) || 0), 0);
  const totalPipeline = partners.reduce((s, p) => s + (Number(p.pipeline_value) || 0), 0);
  const activePartners = partners.filter((p) => p.status === "Active").length;
  const activeClients = clients.filter(c => c.status === "Active").length;
  const premiumClients = clients.filter(c => c.is_premium).length;

  const now = new Date();
  const urgentRenewals = renewals.filter(r => {
    if (r.status === "Won" || r.status === "Lost") return false;
    if (!r.renewal_date) return false;
    const days = Math.ceil((new Date(r.renewal_date).getTime() - now.getTime()) / 86400000);
    return days <= 30;
  });
  const overdueRenewals = renewals.filter(r => {
    if (!r.renewal_date) return false;
    return new Date(r.renewal_date) < now && r.status !== "Won";
  });
  const atRiskPartners = partners.filter(p => (p.health_score ?? 50) < 40);
  const unreadNotifs = notifications.filter((n: any) => !n.is_read);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="animate-reveal-up">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Partner ecosystem overview · {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
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
        <KPICard title="Total Revenue" value={`€${(totalRevenue / 1000).toFixed(0)}k`} change="+12.3% vs last quarter" changeType="positive" icon={DollarSign} delay={60} />
        <KPICard title="Active Partners" value={String(activePartners)} change={`of ${partners.length} total`} changeType="neutral" icon={Users} delay={120} />
        <KPICard title="Pipeline Value" value={`€${(totalPipeline / 1000).toFixed(0)}k`} change="+8.7% this month" changeType="positive" icon={TrendingUp} delay={180} />
        <KPICard title="Active Clients" value={String(activeClients)} change={`${premiumClients} premium`} changeType="neutral" icon={Activity} delay={240} />
      </div>

      {/* Renewals Urgency */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-reveal-up stagger-2">
        <div className="bg-card rounded-xl border shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground text-sm">Renewals Due Soon</h3>
            <Link to="/renewals" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="space-y-2.5">
            {urgentRenewals.slice(0, 4).map(r => {
              const days = r.renewal_date ? Math.ceil((new Date(r.renewal_date).getTime() - now.getTime()) / 86400000) : 0;
              return (
                <div key={r.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <Link to={`/clients/${r.client_id}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block">{r.client_id.slice(0, 8)}</Link>
                    <p className="text-[11px] text-muted-foreground truncate">{r.renewal_type} · {r.status}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs tabular-nums font-semibold ${days < 0 ? "text-destructive" : "text-amber-600"}`}>
                      {days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
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
              { label: "Next 30 days", value: renewals.filter(r => { if (!r.renewal_date) return false; const d = Math.ceil((new Date(r.renewal_date).getTime() - now.getTime()) / 86400000); return d >= 0 && d <= 30 && r.status !== "Won"; }).length, color: "text-amber-600" },
              { label: "Next 60 days", value: renewals.filter(r => { if (!r.renewal_date) return false; const d = Math.ceil((new Date(r.renewal_date).getTime() - now.getTime()) / 86400000); return d >= 0 && d <= 60 && r.status !== "Won"; }).length, color: "text-foreground" },
              { label: "Next 90 days", value: renewals.filter(r => { if (!r.renewal_date) return false; const d = Math.ceil((new Date(r.renewal_date).getTime() - now.getTime()) / 86400000); return d >= 0 && d <= 90 && r.status !== "Won"; }).length, color: "text-foreground" },
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <PartnerHealthList />
      </div>

      <RecentActivity />
    </div>
  );
}
