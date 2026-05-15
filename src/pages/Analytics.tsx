import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PIPELINE_STAGES } from "@/data/pipeline-stages";
import { useAuth } from "@/contexts/AuthContext";
import {
  usePipelineStageBreakdown,
  useSalesPerformance,
  usePartnerAnalytics,
  useRenewalsAnalytics,
  useRevenueByCountry,
  useOutcomes,
  useDealReconciliation,
  lastUpdatedLabel,
} from "@/hooks/useAnalytics";

function KPI({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: "up" | "down" | "neutral" }) {
  return (
    <div className="bg-card rounded-xl border shadow-sm p-4">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-xl font-bold tabular-nums mt-1 text-foreground">{value}</p>
      {sub && (
        <p className={`text-[11px] font-medium mt-1 ${trend === "up" ? "text-emerald-600" : trend === "down" ? "text-destructive" : "text-muted-foreground"}`}>
          {trend === "up" && "↑ "}{trend === "down" && "↓ "}{sub}
        </p>
      )}
    </div>
  );
}

function EmptyState({ message = "No analytics data available yet", hint }: { message?: string; hint?: string }) {
  return (
    <div className="text-center py-12 px-4">
      <p className="text-sm font-medium text-foreground">{message}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

const fmtEuro = (v: number) => `€${v.toLocaleString()}`;
const fmtEuroK = (v: number) => `€${(v / 1000).toFixed(0)}k`;

export default function Analytics() {
  const [tab, setTab] = useState("overview");
  const { isAdmin } = useAuth();

  const pipelineStage = usePipelineStageBreakdown();
  const sales = useSalesPerformance();
  const partners = usePartnerAnalytics();
  const renewals = useRenewalsAnalytics();
  const country = useRevenueByCountry();
  const outcomes = useOutcomes();
  const reconciliation = useDealReconciliation(isAdmin);

  // Order pipeline-stage data by canonical stage order
  const stageOrder = new Map<string, number>(
    PIPELINE_STAGES.filter(s => s.key !== "Won" && s.key !== "Lost").map((s, i) => [s.key as string, i])
  );
  const stageData = (pipelineStage.data || []).slice().sort((a, b) => (stageOrder.get(a.stage) ?? 99) - (stageOrder.get(b.stage) ?? 99));

  // Derived overview totals from views
  const wonOutcomes = (outcomes.data || []).filter(o => o.status === "Won");
  const lostOutcomes = (outcomes.data || []).filter(o => o.status === "Lost");
  const totalRevenue = wonOutcomes.reduce((s, o) => s + o.value, 0);
  const totalPipelineValue = stageData.reduce((s, r) => s + r.total_value, 0);
  const totalWeightedPipeline = stageData.reduce((s, r) => s + r.weighted_value, 0);
  const totalOpenDeals = stageData.reduce((s, r) => s + r.deal_count, 0);
  const conversionRate = wonOutcomes.length + lostOutcomes.length > 0
    ? Math.round((wonOutcomes.length / (wonOutcomes.length + lostOutcomes.length)) * 100)
    : 0;

  const lastUpdated = Math.max(
    pipelineStage.dataUpdatedAt || 0,
    sales.dataUpdatedAt || 0,
    partners.dataUpdatedAt || 0,
    renewals.dataUpdatedAt || 0,
    country.dataUpdatedAt || 0,
    outcomes.dataUpdatedAt || 0,
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between animate-reveal-up gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Single source of truth · all metrics from live database</p>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">{lastUpdatedLabel(lastUpdated)}</span>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="animate-reveal-up stagger-1">
        <TabsList className="bg-secondary/60">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="renewals">Renewals</TabsTrigger>
        </TabsList>

        {/* ---------- OVERVIEW ---------- */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI label="Total Revenue (Won)" value={fmtEuroK(totalRevenue)} sub={`${wonOutcomes.length} won deal${wonOutcomes.length !== 1 ? "s" : ""}`} />
            <KPI label="Pipeline Value (Open)" value={fmtEuroK(totalPipelineValue)} sub={`${totalOpenDeals} open deal${totalOpenDeals !== 1 ? "s" : ""}`} />
            <KPI label="Weighted Pipeline" value={fmtEuroK(totalWeightedPipeline)} sub="Probability-adjusted" />
            <KPI label="Conversion Rate" value={`${conversionRate}%`} sub={`${wonOutcomes.length} won / ${lostOutcomes.length} lost`} trend={conversionRate >= 50 ? "up" : conversionRate > 0 ? "down" : "neutral"} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border shadow-sm">
              <div className="p-5 border-b">
                <h3 className="font-semibold text-foreground">Revenue by Country</h3>
                <p className="text-xs text-muted-foreground mt-0.5">From won deals only</p>
              </div>
              <div className="p-5">
                {(country.data || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={country.data} layout="vertical" barSize={16}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `€${v / 1000}k`} />
                      <YAxis type="category" dataKey="country" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(v: number) => [fmtEuro(v), "Revenue"]} />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState hint="Win your first deal to populate this chart." />}
              </div>
            </div>

            <div className="bg-card rounded-xl border shadow-sm">
              <div className="p-5 border-b">
                <h3 className="font-semibold text-foreground">Open Pipeline by Stage</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Excludes Won and Lost</p>
              </div>
              <div className="p-5">
                {stageData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={stageData} barSize={24}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="stage" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `€${v / 1000}k`} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(v: number) => [fmtEuro(v), undefined]} />
                      <Bar dataKey="total_value" name="Pipeline Value" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState hint="Create open opportunities to see stage distribution." />}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ---------- PIPELINE ---------- */}
        <TabsContent value="pipeline" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI label="Open Deals" value={String(totalOpenDeals)} />
            <KPI label="Pipeline Value" value={fmtEuroK(totalPipelineValue)} />
            <KPI label="Weighted Pipeline" value={fmtEuroK(totalWeightedPipeline)} sub="Probability-adjusted" />
            <KPI label="Avg Deal Size" value={totalOpenDeals > 0 ? fmtEuroK(totalPipelineValue / totalOpenDeals) : "—"} />
          </div>

          <div className="bg-card rounded-xl border shadow-sm">
            <div className="p-5 border-b">
              <h3 className="font-semibold text-foreground">Pipeline by Stage</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Active stages only · Won and Lost shown separately as outcomes</p>
            </div>
            <div className="p-5">
              {stageData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stageData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="value" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `€${v / 1000}k`} />
                    <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar yAxisId="value" dataKey="total_value" name="Value (€)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="count" dataKey="deal_count" name="Deals" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState hint="Create open opportunities to see pipeline analytics." />}
            </div>
          </div>

          {/* Outcomes shown separately, not mixed with active pipeline */}
          <div className="bg-card rounded-xl border shadow-sm">
            <div className="p-5 border-b">
              <h3 className="font-semibold text-foreground">Outcomes</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Closed deals — separate from active pipeline</p>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KPI label="Won" value={String(wonOutcomes.length)} sub={fmtEuroK(totalRevenue)} trend={wonOutcomes.length > 0 ? "up" : "neutral"} />
              <KPI label="Lost" value={String(lostOutcomes.length)} sub={fmtEuroK(lostOutcomes.reduce((s, o) => s + o.value, 0))} trend={lostOutcomes.length > 0 ? "down" : "neutral"} />
              <KPI label="Conversion Rate" value={`${conversionRate}%`} sub="won / (won + lost)" />
            </div>
          </div>
        </TabsContent>

        {/* ---------- SALES ---------- */}
        <TabsContent value="sales" className="space-y-6 mt-4">
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="p-5 border-b">
              <h3 className="font-semibold text-foreground">Sales Performance</h3>
              <p className="text-xs text-muted-foreground mt-0.5">By assigned user · revenue from won deals only</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50">
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Salesperson</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue (Won)</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Open</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Won</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Lost</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Conversion</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Weighted Pipeline</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(sales.data || []).map(s => (
                    <tr key={s.sales_key} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <span>{s.sales_name}</span>
                          {isAdmin && s.is_unlinked && <Badge variant="outline" className="text-[10px] opacity-60" title="No linked user profile (HQ-only diagnostic)">Unlinked</Badge>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">{fmtEuro(s.won_revenue)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{s.open_count}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{s.won_count}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{s.lost_count}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`tabular-nums font-medium ${s.conversion >= 50 ? "text-emerald-600" : "text-foreground"}`}>{s.conversion}%</span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{fmtEuro(s.weighted_pipeline)}</td>
                    </tr>
                  ))}
                  {(sales.data || []).length === 0 && (
                    <tr><td colSpan={7} className="p-0"><EmptyState hint="Assign opportunities to users to see performance breakdown." /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ---------- PARTNERS ---------- */}
        <TabsContent value="partners" className="space-y-6 mt-4">
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="p-5 border-b"><h3 className="font-semibold text-foreground">Partner Performance Ranking</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50">
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">#</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Partner</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Country</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue (Won)</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Open Deals</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Pipeline</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Active Clients</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(partners.data || []).map((p, i) => (
                    <tr key={p.partner_id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-muted-foreground">{i + 1}</td>
                      <td className="px-5 py-3 font-medium text-foreground">{p.company_name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.country || "—"}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">{fmtEuro(p.revenue)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{p.open_deal_count}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{fmtEuro(p.pipeline)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{p.client_count}</td>
                    </tr>
                  ))}
                  {(partners.data || []).length === 0 && (
                    <tr><td colSpan={7} className="p-0"><EmptyState /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ---------- RENEWALS ---------- */}
        <TabsContent value="renewals" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI label="Success Rate" value={`${renewals.data?.success_rate ?? 0}%`} sub={`${renewals.data?.won ?? 0} of ${(renewals.data?.won ?? 0) + (renewals.data?.lost ?? 0)} closed`} trend={(renewals.data?.success_rate ?? 0) >= 70 ? "up" : "down"} />
            <KPI label="Renewal Revenue" value={fmtEuroK(renewals.data?.won_value ?? 0)} sub={`${renewals.data?.won ?? 0} won`} />
            <KPI label="Upcoming" value={String(renewals.data?.upcoming ?? 0)} sub="Active, not yet due" />
            <KPI label="Overdue" value={String(renewals.data?.overdue ?? 0)} trend={(renewals.data?.overdue ?? 0) > 0 ? "down" : undefined} />
          </div>

          <div className="bg-card rounded-xl border shadow-sm">
            <div className="p-5 border-b"><h3 className="font-semibold text-foreground">Renewal Outcomes</h3></div>
            <div className="p-5">
              {(renewals.data?.total ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={[
                      { status: "Won", count: renewals.data?.won ?? 0 },
                      { status: "Lost", count: renewals.data?.lost ?? 0 },
                      { status: "Upcoming", count: renewals.data?.upcoming ?? 0 },
                      { status: "Overdue", count: renewals.data?.overdue ?? 0 },
                    ]}
                    barSize={28}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="status" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    <Bar dataKey="count" name="Count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState hint="Renewal data will appear once renewals are tracked." />}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Admin-only reconciliation panel — helps audit Analytics numbers against raw deals */}
      {isAdmin && (
        <details className="bg-card rounded-xl border shadow-sm">
          <summary className="cursor-pointer p-4 text-sm font-semibold text-foreground flex items-center justify-between">
            <span>Data Reconciliation <span className="text-xs font-normal text-muted-foreground ml-2">HQ Admin only · 50 most recent deals</span></span>
            <Badge variant="outline" className="text-[10px]">Diagnostic</Badge>
          </summary>
          <div className="overflow-x-auto border-t">
            <table className="w-full text-xs">
              <thead className="bg-secondary/50">
                <tr className="border-b">
                  {["Company","Status","Stage","Country (raw → normalized)","Salesperson","Value (auth)","Probability","Weighted","In Revenue","In Pipeline","Closed at"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(reconciliation.data || []).map((r: any) => {
                  const resolved = r.resolved_probability ?? 0;
                  const overridden = r.deal_probability != null && Number(r.deal_probability) > 0;
                  return (
                    <tr key={r.id} className="hover:bg-secondary/30">
                      <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{r.company_name}</td>
                      <td className="px-3 py-2"><Badge variant={r.status === "Won" ? "success" : r.status === "Lost" ? "destructive" : "outline"} className="text-[10px]">{r.status}</Badge></td>
                      <td className="px-3 py-2 text-muted-foreground">{r.stage}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {r.country_raw || "—"} {r.country_raw !== r.country_normalized && <span className="text-foreground">→ {r.country_normalized || "—"}</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.salesperson}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(r.authoritative_value)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {resolved}%
                        <span className="ml-1 text-[10px] text-muted-foreground">{overridden ? "(custom)" : "(stage)"}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtEuro(r.weighted_value)}</td>
                      <td className="px-3 py-2 text-center">{r.in_revenue ? "✓" : "—"}</td>
                      <td className="px-3 py-2 text-center">{r.in_pipeline ? "✓" : "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.status_changed_at ? new Date(r.status_changed_at).toLocaleDateString() : "—"}</td>
                    </tr>
                  );
                })}
                {(reconciliation.data || []).length === 0 && (
                  <tr><td colSpan={11} className="p-0"><EmptyState message="No deals to reconcile" /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
