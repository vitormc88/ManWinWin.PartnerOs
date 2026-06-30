import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, AlertTriangle, Activity, Globe2, Sparkles, Trophy, Rocket, Target as TargetIcon, Users, Heart, GraduationCap, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
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
      <p className="text-2xl font-bold tabular-nums mt-1 text-foreground tracking-tight">{value}</p>
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
    <div className="text-center py-8 px-4">
      <p className="text-sm font-medium text-foreground">{message}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function ExecCard({
  title, icon: Icon, onClick, children,
}: { title: string; icon: any; onClick?: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
      className={`group text-left bg-card rounded-xl border shadow-sm transition-all flex flex-col ${onClick ? "cursor-pointer hover:shadow-md hover:border-primary/40" : ""}`}
    >
      <div className="px-4 py-2.5 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-accent flex items-center justify-center">
            <Icon className="h-3.5 w-3.5 text-accent-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {onClick && <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
      <div className="p-4 flex-1 min-h-0">{children}</div>
    </div>
  );
}

const fmtEuro = (v: number) => `€${v.toLocaleString()}`;
const fmtEuroK = (v: number) => `€${(v / 1000).toFixed(0)}k`;

export default function Analytics() {
  const [tab, setTab] = useState("overview");
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

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

  // --- Executive derivations (presentation-only, no business logic changes) ---
  const topCountry = (country.data || [])[0];
  const topCountryPct = topCountry && totalRevenue > 0 ? Math.round((topCountry.revenue / totalRevenue) * 100) : 0;

  const largestStage = useMemo(() => stageData.slice().sort((a, b) => b.total_value - a.total_value)[0], [stageData]);
  const mostOppStage = useMemo(() => stageData.slice().sort((a, b) => b.deal_count - a.deal_count)[0], [stageData]);
  // Bottleneck = stage holding the largest commercial exposure (value)
  const bottleneckStage = largestStage;

  const topPartner = (partners.data || [])[0];
  const overdueRenewals = renewals.data?.overdue ?? 0;

  const alerts = useMemo(() => {
    const out: Array<{ tone: "red" | "orange" | "yellow" | "green"; text: string; onClick?: () => void }> = [];
    if (overdueRenewals > 0) {
      out.push({ tone: "red", text: `${overdueRenewals} renewal${overdueRenewals !== 1 ? "s" : ""} overdue`, onClick: () => navigate("/renewals") });
    }
    if (bottleneckStage && bottleneckStage.total_value > 0) {
      out.push({ tone: "orange", text: `${bottleneckStage.stage} concentrates ${fmtEuroK(bottleneckStage.total_value)} of exposure`, onClick: () => navigate("/pipeline") });
    }
    (partners.data || []).forEach(p => {
      if (p.pipeline > 0 && p.client_count === 0) {
        out.push({ tone: "yellow", text: `${p.company_name} has pipeline but no active clients`, onClick: () => navigate(`/partners/${p.partner_id}`) });
      }
    });
    if (topPartner && topPartner.won_deal_count >= 3) {
      out.push({ tone: "green", text: `${topPartner.company_name} closed ${topPartner.won_deal_count} deals (${fmtEuroK(topPartner.revenue)})`, onClick: () => navigate(`/partners/${topPartner.partner_id}`) });
    }
    return out.slice(0, 5);
  }, [overdueRenewals, bottleneckStage, partners.data, topPartner, navigate]);

  const highlights = useMemo(() => {
    const out: string[] = [];
    if (topCountry) out.push(`Revenue is led by ${topCountry.country} (${topCountryPct}% of total).`);
    if (largestStage) out.push(`Pipeline value is concentrated in ${largestStage.stage}.`);
    if (mostOppStage && mostOppStage.stage !== largestStage?.stage) out.push(`${mostOppStage.stage} holds the most opportunities (${mostOppStage.deal_count}).`);
    if (conversionRate > 0) out.push(`Conversion rate sits at ${conversionRate}% across closed deals.`);
    if (overdueRenewals > 0) out.push(`Renewals are the primary commercial risk (${overdueRenewals} overdue).`);
    else if ((renewals.data?.upcoming ?? 0) > 0) out.push(`${renewals.data?.upcoming} renewals upcoming — protect recurring revenue.`);
    if (topPartner) out.push(`${topPartner.company_name} remains the strongest performing partner.`);
    return out.slice(0, 5);
  }, [topCountry, topCountryPct, largestStage, mostOppStage, conversionRate, overdueRenewals, renewals.data, topPartner]);

  const toneStyles: Record<string, string> = {
    red: "bg-destructive/10 text-destructive border-destructive/30",
    orange: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-300",
    yellow: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-300",
    green: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/20 dark:text-emerald-300",
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between animate-reveal-up gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Executive cockpit · live commercial intelligence</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live database
          </span>
          <span className="text-[11px] text-muted-foreground">{lastUpdatedLabel(lastUpdated)}</span>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="animate-reveal-up stagger-1">
        <TabsList className="bg-secondary/60">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="renewals">Renewals</TabsTrigger>
        </TabsList>

        {/* ---------- OVERVIEW (Executive Cockpit) ---------- */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI label="Total Revenue (Won)" value={fmtEuroK(totalRevenue)} sub={`${wonOutcomes.length} won deal${wonOutcomes.length !== 1 ? "s" : ""}`} />
            <KPI label="Pipeline Value (Open)" value={fmtEuroK(totalPipelineValue)} sub={`${totalOpenDeals} open deal${totalOpenDeals !== 1 ? "s" : ""}`} />
            <KPI label="Weighted Pipeline" value={fmtEuroK(totalWeightedPipeline)} sub="Probability-adjusted" />
            <KPI label="Conversion Rate" value={`${conversionRate}%`} sub={`${wonOutcomes.length} won / ${lostOutcomes.length} lost`} trend={conversionRate >= 50 ? "up" : conversionRate > 0 ? "down" : "neutral"} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Card 1 — Revenue by Country */}
            <ExecCard title="Revenue by Country" icon={Globe2} onClick={() => setTab("partners")}>
              {(country.data || []).length > 0 ? (
                <div className="grid grid-cols-5 gap-4 items-center">
                  <div className="col-span-2 space-y-1">
                    <p className="text-xs text-muted-foreground">Top country</p>
                    <p className="text-lg font-bold text-foreground">{topCountry?.country}</p>
                    <p className="text-sm font-semibold text-primary tabular-nums">{fmtEuroK(topCountry?.revenue || 0)}</p>
                    <p className="text-[11px] text-muted-foreground">{topCountryPct}% of total · {topCountry?.won_deal_count} won deal{(topCountry?.won_deal_count || 0) !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="col-span-3">
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={(country.data || []).slice(0, 5)} layout="vertical" barSize={10} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                        <XAxis type="number" hide tickFormatter={v => `€${v / 1000}k`} />
                        <YAxis type="category" dataKey="country" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={70} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }} formatter={(v: number) => [fmtEuro(v), "Revenue"]} />
                        <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : <EmptyState hint="Win your first deal to populate this card." />}
            </ExecCard>

            {/* Card 2 — Pipeline Health */}
            <ExecCard title="Pipeline Health" icon={Activity} onClick={() => setTab("pipeline")}>
              {stageData.length > 0 ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Largest stage</p>
                    <p className="font-semibold text-foreground mt-0.5">{largestStage?.stage}</p>
                    <p className="text-xs text-primary tabular-nums">{fmtEuroK(largestStage?.total_value || 0)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Most opportunities</p>
                    <p className="font-semibold text-foreground mt-0.5">{mostOppStage?.stage}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{mostOppStage?.deal_count} deals</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Weighted pipeline</p>
                    <p className="font-semibold text-foreground mt-0.5 tabular-nums">{fmtEuroK(totalWeightedPipeline)}</p>
                    <p className="text-xs text-muted-foreground">Probability-adjusted</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Attention</p>
                    <p className="text-xs text-foreground mt-0.5 leading-snug">{bottleneckStage?.stage} holds the highest commercial exposure.</p>
                  </div>
                </div>
              ) : <EmptyState hint="Create open opportunities to see pipeline health." />}
            </ExecCard>

            {/* Card 3 — Commercial Alerts */}
            <ExecCard title="Commercial Alerts" icon={AlertTriangle}>
              {alerts.length > 0 ? (
                <ul className="space-y-1.5">
                  {alerts.map((a, i) => (
                    <li
                      key={i}
                      onClick={(e) => { e.stopPropagation(); a.onClick?.(); }}
                      className={`flex items-start gap-2 text-xs px-2.5 py-2 rounded-md border ${toneStyles[a.tone]} ${a.onClick ? "cursor-pointer hover:opacity-80" : ""}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 bg-current" />
                      <span className="leading-snug">{a.text}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState message="All clear" hint="No commercial alerts at this time." />}
            </ExecCard>

            {/* Card 4 — Executive Highlights */}
            <ExecCard title="Executive Highlights" icon={Sparkles}>
              {highlights.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-foreground leading-snug">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState hint="Highlights will appear as data accumulates." />}
            </ExecCard>
          </div>
        </TabsContent>



        {/* ---------- PIPELINE (Commercial Intelligence) ---------- */}
        <TabsContent value="pipeline" className="space-y-4 mt-4">
          <PipelineCockpit
            stageData={stageData}
            totalOpenDeals={totalOpenDeals}
            totalPipelineValue={totalPipelineValue}
            totalWeightedPipeline={totalWeightedPipeline}
            wonCount={wonOutcomes.length}
            navigate={navigate}
          />
        </TabsContent>


        {/* ---------- SALES ---------- */}
        <TabsContent value="sales" className="space-y-4 mt-4">
          <SalesCockpit sales={sales.data || []} isAdmin={isAdmin} navigate={navigate} />
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

// ---------- Pipeline Cockpit ----------
import { useDeals } from "@/hooks/useDeals";
import { usePartners } from "@/hooks/usePartners";
import { Target, GitBranch, Gauge, Lightbulb, Crown } from "lucide-react";

function PipelineCockpit({
  stageData, totalOpenDeals, totalPipelineValue, totalWeightedPipeline, wonCount, navigate,
}: {
  stageData: any[];
  totalOpenDeals: number;
  totalPipelineValue: number;
  totalWeightedPipeline: number;
  wonCount: number;
  navigate: (path: string) => void;
}) {
  const dealsQ = useDeals();
  const partnersQ = usePartners();
  const allDeals = dealsQ.data || [];
  const openDeals = allDeals.filter((d: any) => d.status === "Open");
  const partnerMap = new Map((partnersQ.data || []).map((p: any) => [p.id, p.company_name]));

  // Stage age (days in stage) per stage
  const now = Date.now();
  const stageAge = new Map<string, number>();
  const stageDealsCount = new Map<string, number>();
  openDeals.forEach((d: any) => {
    const ts = d.stage_entered_at || d.created_at;
    if (!ts) return;
    const days = Math.max(0, Math.floor((now - new Date(ts).getTime()) / 86400000));
    stageAge.set(d.stage, (stageAge.get(d.stage) || 0) + days);
    stageDealsCount.set(d.stage, (stageDealsCount.get(d.stage) || 0) + 1);
  });
  const avgAgeByStage = stageData.map((s: any) => {
    const sum = stageAge.get(s.stage) || 0;
    const n = stageDealsCount.get(s.stage) || 0;
    return { stage: s.stage, avgDays: n > 0 ? Math.round(sum / n) : 0 };
  });

  const largestValueStage = stageData.slice().sort((a: any, b: any) => b.total_value - a.total_value)[0];
  const mostDealsStage = stageData.slice().sort((a: any, b: any) => b.deal_count - a.deal_count)[0];
  const oldestStage = avgAgeByStage.slice().sort((a, b) => b.avgDays - a.avgDays)[0];

  // Conversion summary — survival ratio between consecutive stages (snapshot approximation)
  const conversions = useMemo(() => {
    const out: Array<{ from: string; to: string; pct: number }> = [];
    for (let i = 0; i < stageData.length - 1; i++) {
      const cur = stageData[i];
      const nxt = stageData[i + 1];
      if (!cur.deal_count) continue;
      const passedNext = stageData.slice(i + 1).reduce((s: number, x: any) => s + x.deal_count, 0) + wonCount;
      const passedCur = cur.deal_count + passedNext;
      const pct = passedCur > 0 ? Math.round((passedNext / passedCur) * 100) : 0;
      out.push({ from: cur.stage, to: nxt.stage, pct });
    }
    return out;
  }, [stageData, wonCount]);

  // Forecast
  const avgProb = openDeals.length > 0
    ? Math.round(openDeals.reduce((s: number, d: any) => s + (Number(d.probability) || 0), 0) / openDeals.length)
    : 0;
  const highConfidence = openDeals.filter((d: any) => (Number(d.probability) || 0) >= 70);
  const expectedRevenue = totalWeightedPipeline;
  const quarterEnd = (() => {
    const d = new Date();
    const q = Math.floor(d.getMonth() / 3);
    return new Date(d.getFullYear(), q * 3 + 3, 0);
  })();
  const closesThisQuarter = openDeals.filter((d: any) => {
    if (!d.expected_close_date) return false;
    const c = new Date(d.expected_close_date);
    return c <= quarterEnd && c >= new Date();
  }).length;

  // Insights
  const insights: string[] = [];
  if (largestValueStage && totalPipelineValue > 0) {
    const pct = Math.round((largestValueStage.total_value / totalPipelineValue) * 100);
    insights.push(`${largestValueStage.stage} contains ${pct}% of pipeline value.`);
  }
  if (mostDealsStage && largestValueStage && mostDealsStage.stage !== largestValueStage.stage) {
    insights.push(`${mostDealsStage.stage} concentrates most opportunities (${mostDealsStage.deal_count}).`);
  }
  if (oldestStage && oldestStage.avgDays >= 21) {
    insights.push(`${oldestStage.stage} deals have aged on average ${oldestStage.avgDays} days.`);
  }
  const big = openDeals.filter((d: any) => Number(d.total_value || d.expected_value || 0) >= 25000);
  if (big.length > 0) insights.push(`${big.length} opportunit${big.length === 1 ? "y exceeds" : "ies exceed"} €25k.`);
  if (highConfidence.length > 0) insights.push(`${highConfidence.length} high-confidence deal${highConfidence.length !== 1 ? "s" : ""} expected to convert.`);
  const topInsights = insights.slice(0, 5);

  // Largest opportunities
  const largest = openDeals
    .map((d: any) => ({ ...d, _value: Number(d.total_value ?? d.expected_value ?? 0) }))
    .sort((a: any, b: any) => b._value - a._value)
    .slice(0, 5);

  const avgDealSize = totalOpenDeals > 0 ? totalPipelineValue / totalOpenDeals : 0;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="Open Deals" value={String(totalOpenDeals)} />
        <KPI label="Pipeline Value" value={fmtEuroK(totalPipelineValue)} />
        <KPI label="Weighted Pipeline" value={fmtEuroK(totalWeightedPipeline)} sub="Probability-adjusted" />
        <KPI label="Avg Deal Size" value={totalOpenDeals > 0 ? fmtEuroK(avgDealSize) : "—"} />
      </div>

      {/* Compact stage breakdown */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Pipeline by Stage</h3>
          <span className="text-[11px] text-muted-foreground">Value · Deals · Avg deal value</span>
        </div>
        {stageData.length > 0 ? (
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {stageData.map((s: any) => {
                const avg = s.deal_count > 0 ? s.total_value / s.deal_count : 0;
                const pct = totalPipelineValue > 0 ? Math.round((s.total_value / totalPipelineValue) * 100) : 0;
                return (
                  <tr key={s.stage} onClick={() => navigate("/pipeline")} className="hover:bg-secondary/40 cursor-pointer">
                    <td className="px-4 py-2 w-40">
                      <span className="text-sm font-medium text-foreground">{s.stage}</span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-foreground w-24">{fmtEuroK(s.total_value)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground w-16">{s.deal_count}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground w-24">{avg > 0 ? fmtEuroK(avg) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <EmptyState hint="Create open opportunities to see pipeline analytics." />}
      </div>

      {/* 2x2 intelligence cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bottlenecks */}
        <ExecCard title="Pipeline Bottlenecks" icon={Target} onClick={() => navigate("/pipeline")}>
          {stageData.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Largest value</p>
                <p className="font-semibold text-foreground mt-0.5">{largestValueStage?.stage}</p>
                <p className="text-xs text-primary tabular-nums">{fmtEuroK(largestValueStage?.total_value || 0)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Most deals</p>
                <p className="font-semibold text-foreground mt-0.5">{mostDealsStage?.stage}</p>
                <p className="text-xs text-muted-foreground tabular-nums">{mostDealsStage?.deal_count} deals</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Longest avg age</p>
                <p className="font-semibold text-foreground mt-0.5">{oldestStage?.stage || "—"}</p>
                <p className="text-xs text-muted-foreground tabular-nums">{oldestStage ? `${oldestStage.avgDays} days` : "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Attention</p>
                <p className="text-xs text-foreground mt-0.5 leading-snug">{largestValueStage?.stage} concentrates the highest commercial exposure.</p>
              </div>
            </div>
          ) : <EmptyState hint="Add open opportunities to detect bottlenecks." />}
        </ExecCard>

        {/* Conversion */}
        {conversions.length > 0 && (
          <ExecCard title="Stage Conversion" icon={GitBranch} onClick={() => navigate("/pipeline")}>
            <ul className="space-y-2">
              {conversions.slice(0, 5).map((c, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 text-foreground truncate">
                    <span className="text-muted-foreground">{c.from}</span>
                    <span className="text-muted-foreground mx-1">→</span>
                    <span>{c.to}</span>
                  </span>
                  <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className={`h-full ${c.pct >= 60 ? "bg-emerald-500" : c.pct >= 30 ? "bg-amber-500" : "bg-destructive"}`} style={{ width: `${Math.min(100, c.pct)}%` }} />
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-foreground w-10 text-right">{c.pct}%</span>
                </li>
              ))}
            </ul>
          </ExecCard>
        )}

        {/* Forecast */}
        <ExecCard title="Forecast" icon={Gauge} onClick={() => navigate("/pipeline")}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Expected revenue</p>
              <p className="font-bold text-foreground mt-0.5 tabular-nums">{fmtEuroK(expectedRevenue)}</p>
              <p className="text-xs text-muted-foreground">Weighted pipeline</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">High-confidence deals</p>
              <p className="font-bold text-foreground mt-0.5 tabular-nums">{highConfidence.length}</p>
              <p className="text-xs text-muted-foreground">≥ 70% probability</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Average probability</p>
              <p className="font-bold text-foreground mt-0.5 tabular-nums">{avgProb}%</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Closes this quarter</p>
              <p className="font-bold text-foreground mt-0.5 tabular-nums">{closesThisQuarter}</p>
            </div>
          </div>
        </ExecCard>

        {/* Insights */}
        <ExecCard title="Commercial Insights" icon={Lightbulb}>
          {topInsights.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {topInsights.map((h, i) => (
                <li key={i} className="flex items-start gap-2 text-foreground leading-snug">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState hint="Insights will appear as pipeline grows." />}
        </ExecCard>
      </div>

      {/* Largest opportunities */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b flex items-center gap-2">
          <Crown className="h-3.5 w-3.5 text-amber-500" />
          <h3 className="text-sm font-semibold text-foreground">Largest Open Opportunities</h3>
          <span className="text-[11px] text-muted-foreground ml-auto">Top {largest.length}</span>
        </div>
        {largest.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/40">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Company</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Partner</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Stage</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Value</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {largest.map((d: any) => (
                <tr key={d.id} onClick={() => navigate(`/deals/${d.id}`)} className="hover:bg-secondary/30 cursor-pointer">
                  <td className="px-4 py-2 font-medium text-foreground">{d.company_name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{partnerMap.get(d.partner_id) || "—"}</td>
                  <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{d.stage}</Badge></td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtEuro(d._value)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{d.assigned_salesperson || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState hint="Open opportunities will appear here." />}
      </div>
    </>
  );
}

// ============================================================
// Sales Cockpit
// ============================================================

type SalesRow = {
  sales_key: string;
  user_id: string | null;
  sales_name: string;
  is_unlinked: boolean;
  open_count: number;
  won_count: number;
  lost_count: number;
  won_revenue: number;
  pipeline_value: number;
  weighted_pipeline: number;
  conversion: number;
};

type SalesSortKey = "won_revenue" | "pipeline_value" | "won_count" | "lost_count" | "conversion" | "weighted_pipeline" | "open_count";

function medal(idx: number) {
  return idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "";
}

function RankCard({
  title, icon: Icon, rows, format, onPick, emptyHint,
}: {
  title: string;
  icon: any;
  rows: { key: string; name: string; value: number; display: string }[];
  format?: (n: number) => string;
  onPick: (key: string, name: string) => void;
  emptyHint?: string;
}) {
  return (
    <ExecCard title={title} icon={Icon}>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyHint || "No data yet."}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.slice(0, 3).map((r, i) => (
            <li
              key={r.key}
              onClick={() => onPick(r.key, r.name)}
              className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-md hover:bg-secondary/60 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base leading-none w-5 text-center">{medal(i)}</span>
                <span className="text-sm font-medium text-foreground truncate">{r.name}</span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-foreground">{r.display}</span>
            </li>
          ))}
        </ul>
      )}
    </ExecCard>
  );
}

function SalesCockpit({
  sales, isAdmin, navigate,
}: { sales: SalesRow[]; isAdmin: boolean; navigate: (path: string) => void }) {
  const [sortKey, setSortKey] = useState<SalesSortKey>("won_revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const totalRevenue = sales.reduce((s, r) => s + r.won_revenue, 0);
  const totalPipeline = sales.reduce((s, r) => s + r.pipeline_value, 0);
  const avgConversion = sales.length > 0
    ? Math.round(sales.reduce((s, r) => s + r.conversion, 0) / sales.filter(r => r.won_count + r.lost_count > 0).length || 0) || 0
    : 0;

  const openPicker = (key: string, _name: string) => {
    // future: salesperson profile. For now: go to pipeline (filter not URL-driven yet).
    navigate("/pipeline");
  };

  // Rankings
  const byRevenue = [...sales]
    .filter(r => r.won_revenue > 0)
    .sort((a, b) => b.won_revenue - a.won_revenue)
    .map(r => ({ key: r.sales_key, name: r.sales_name, value: r.won_revenue, display: fmtEuroK(r.won_revenue) }));

  const byPipeline = [...sales]
    .filter(r => r.pipeline_value > 0)
    .sort((a, b) => b.pipeline_value - a.pipeline_value)
    .map(r => ({ key: r.sales_key, name: r.sales_name, value: r.pipeline_value, display: fmtEuroK(r.pipeline_value) }));

  const byConversion = [...sales]
    .filter(r => r.won_count + r.lost_count >= 2)
    .sort((a, b) => b.conversion - a.conversion)
    .map(r => ({ key: r.sales_key, name: r.sales_name, value: r.conversion, display: `${r.conversion}%` }));

  // Top / flag sets for badges
  const topRevenueKey = byRevenue[0]?.key;
  const topPipelineKey = byPipeline[0]?.key;
  const topConversionKey = byConversion[0]?.key;
  const lowestConvKey = [...sales]
    .filter(r => r.won_count + r.lost_count >= 2)
    .sort((a, b) => a.conversion - b.conversion)[0]?.sales_key;

  // Health signals
  const noPipelineCount = sales.filter(r => r.pipeline_value === 0 && r.open_count === 0).length;
  const sortedByPipe = [...sales].sort((a, b) => b.pipeline_value - a.pipeline_value);
  const top2PipeShare = totalPipeline > 0
    ? Math.round(((sortedByPipe[0]?.pipeline_value || 0) + (sortedByPipe[1]?.pipeline_value || 0)) / totalPipeline * 100)
    : 0;

  // Coaching
  const coaching: { key: string; name: string; reason: string }[] = [];
  sales.forEach(r => {
    if (r.pipeline_value > 0 && r.won_count === 0 && r.lost_count >= 2) {
      coaching.push({ key: r.sales_key, name: r.sales_name, reason: "Active pipeline, zero wins" });
    } else if (r.won_count + r.lost_count >= 3 && r.conversion < 30) {
      coaching.push({ key: r.sales_key, name: r.sales_name, reason: `Low conversion (${r.conversion}%)` });
    } else if (r.pipeline_value === 0 && r.open_count === 0 && r.won_revenue === 0) {
      coaching.push({ key: r.sales_key, name: r.sales_name, reason: "No pipeline activity" });
    } else if (r.open_count === 0 && r.won_revenue > 0) {
      coaching.push({ key: r.sales_key, name: r.sales_name, reason: "No open pipeline" });
    }
  });
  const coachingTop = coaching.slice(0, 4);
  const coachingKeys = new Set(coaching.map(c => c.key));

  // Executive insights
  const insights: string[] = [];
  if (byRevenue[0]) insights.push(`${byRevenue[0].name} leads revenue generation at ${fmtEuroK(byRevenue[0].value)}.`);
  if (byPipeline[0]) insights.push(`${byPipeline[0].name} owns the largest active pipeline (${fmtEuroK(byPipeline[0].value)}).`);
  if (top2PipeShare >= 50) insights.push(`Pipeline ownership is concentrated — top 2 hold ${top2PipeShare}% of total pipeline.`);
  else if (sales.length >= 3) insights.push(`Pipeline distribution is balanced across the team.`);
  if (avgConversion >= 60) insights.push(`Overall conversion remains strong at ${avgConversion}%.`);
  else if (avgConversion > 0) insights.push(`Average conversion at ${avgConversion}% — coaching focus advised.`);
  if (noPipelineCount > 0) insights.push(`${noPipelineCount} salesperson${noPipelineCount > 1 ? "s have" : " has"} no active pipeline.`);

  // Sortable table
  const sortedTable = [...sales].sort((a, b) => {
    const av = (a as any)[sortKey] as number;
    const bv = (b as any)[sortKey] as number;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const toggleSort = (k: SalesSortKey) => {
    if (sortKey === k) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const SortTh = ({ k, label, align = "right" }: { k: SalesSortKey; label: string; align?: "left" | "right" }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`px-5 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground ${align === "right" ? "text-right" : "text-left"}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k
          ? (sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </span>
    </th>
  );

  if (sales.length === 0) {
    return (
      <div className="bg-card rounded-xl border shadow-sm">
        <EmptyState hint="Assign opportunities to users to see sales performance." />
      </div>
    );
  }

  return (
    <>
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total Salespeople" value={String(sales.length)} sub="active users with deals" />
        <KPI label="Total Won Revenue" value={fmtEuroK(totalRevenue)} sub="from won deals" trend="up" />
        <KPI label="Open Pipeline" value={fmtEuroK(totalPipeline)} sub="across all owners" />
        <KPI label="Average Win Rate" value={`${avgConversion}%`} sub="team conversion" trend={avgConversion >= 50 ? "up" : "neutral"} />
      </div>

      {/* Top Performers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <RankCard title="Top Revenue" icon={Trophy} rows={byRevenue} onPick={openPicker} emptyHint="No won deals yet." />
        <RankCard title="Highest Pipeline" icon={Rocket} rows={byPipeline} onPick={openPicker} emptyHint="No open pipeline." />
        <RankCard title="Best Conversion" icon={TargetIcon} rows={byConversion} onPick={openPicker} emptyHint="Not enough closed deals." />
      </div>

      {/* Health + Coaching */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ExecCard title="Sales Health" icon={Heart}>
          <ul className="space-y-1.5 text-sm">
            {noPipelineCount > 0 && (
              <li className="flex items-start gap-2"><span className="text-muted-foreground">•</span><span>{noPipelineCount} salesperson{noPipelineCount > 1 ? "s have" : " has"} no active pipeline.</span></li>
            )}
            {top2PipeShare > 0 && (
              <li className="flex items-start gap-2"><span className="text-muted-foreground">•</span><span>Top 2 account managers own <strong>{top2PipeShare}%</strong> of pipeline.</span></li>
            )}
            {sortedByPipe[0] && (
              <li className="flex items-start gap-2"><span className="text-muted-foreground">•</span><span>Highest pipeline holder: <strong>{sortedByPipe[0].sales_name}</strong> ({fmtEuroK(sortedByPipe[0].pipeline_value)}).</span></li>
            )}
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">•</span>
              <span>Average conversion {avgConversion >= 50 ? "remains above target" : "needs attention"} at <strong>{avgConversion}%</strong>.</span>
            </li>
          </ul>
        </ExecCard>

        <ExecCard title="Coaching Opportunities" icon={GraduationCap}>
          {coachingTop.length === 0 ? (
            <p className="text-xs text-muted-foreground">No coaching flags — team is performing within expected ranges.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {coachingTop.map(c => (
                <li
                  key={`${c.key}-${c.reason}`}
                  onClick={() => openPicker(c.key, c.name)}
                  className="flex items-start gap-2 px-2 py-1 -mx-2 rounded-md hover:bg-secondary/60 cursor-pointer"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <span><strong className="text-foreground">{c.name}</strong> <span className="text-muted-foreground">— {c.reason}</span></span>
                </li>
              ))}
            </ul>
          )}
        </ExecCard>
      </div>

      {/* Executive Insights */}
      <ExecCard title="Executive Insights" icon={Sparkles}>
        <ul className="space-y-1 text-sm">
          {insights.slice(0, 5).map((t, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-muted-foreground">•</span>
              <span className="text-foreground">{t}</span>
            </li>
          ))}
        </ul>
      </ExecCard>

      {/* Full sortable table */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-sm">Full Sales Performance</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Click a header to sort · click a row to drill in</p>
          </div>
          <Badge variant="outline" className="text-[10px]">{sales.length} users</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Salesperson</th>
                <SortTh k="won_revenue" label="Revenue" />
                <SortTh k="pipeline_value" label="Pipeline" />
                <SortTh k="open_count" label="Open" />
                <SortTh k="won_count" label="Won" />
                <SortTh k="lost_count" label="Lost" />
                <SortTh k="conversion" label="Conversion" />
                <SortTh k="weighted_pipeline" label="Weighted" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedTable.map(s => {
                const badges: { label: string; cls: string }[] = [];
                if (s.sales_key === topRevenueKey) badges.push({ label: "🏆 Top Revenue", cls: "bg-amber-50 text-amber-700 border-amber-200" });
                if (s.sales_key === topPipelineKey) badges.push({ label: "🚀 Pipeline Leader", cls: "bg-blue-50 text-blue-700 border-blue-200" });
                if (s.sales_key === topConversionKey) badges.push({ label: "🎯 Best Conversion", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" });
                if (coachingKeys.has(s.sales_key)) badges.push({ label: "⚠ Needs Attention", cls: "bg-amber-50 text-amber-700 border-amber-200" });

                const rowHighlight =
                  s.sales_key === topRevenueKey ? "bg-amber-50/30" :
                  s.sales_key === topPipelineKey ? "bg-blue-50/20" :
                  s.sales_key === lowestConvKey ? "bg-destructive/5" : "";

                return (
                  <tr
                    key={s.sales_key}
                    onClick={() => openPicker(s.sales_key, s.sales_name)}
                    className={`hover:bg-secondary/40 transition-colors cursor-pointer ${rowHighlight}`}
                  >
                    <td className="px-5 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{s.sales_name}</span>
                        {isAdmin && s.is_unlinked && <Badge variant="outline" className="text-[10px] opacity-60">Unlinked</Badge>}
                        {badges.map(b => (
                          <span key={b.label} className={`text-[10px] px-1.5 py-0.5 border rounded-full ${b.cls}`}>{b.label}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium">{fmtEuro(s.won_revenue)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtEuro(s.pipeline_value)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.open_count}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.won_count}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.lost_count}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`tabular-nums font-medium ${s.conversion >= 50 ? "text-emerald-600" : s.sales_key === lowestConvKey ? "text-destructive" : "text-foreground"}`}>
                        {s.won_count + s.lost_count > 0 ? `${s.conversion}%` : "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{fmtEuro(s.weighted_pipeline)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}


