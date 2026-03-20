import { useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, Area, AreaChart } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { partners, revenueByCountry } from "@/data/mock-data";
import { mockClients } from "@/data/clients-mock-data";
import { monthlyRevenue, partnerPerformance, revenueByProduct, renewalAnalytics, salesPerformance } from "@/data/renewals-mock-data";
import { TrendingUp, TrendingDown, Target, DollarSign, Users, RefreshCcw, BarChart3, PieChart as PieChartIcon, Activity } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

const COLORS = [
  "hsl(174, 62%, 34%)", "hsl(210, 80%, 52%)", "hsl(38, 92%, 50%)",
  "hsl(152, 60%, 40%)", "hsl(0, 72%, 51%)", "hsl(280, 60%, 50%)", "hsl(174, 62%, 48%)",
];

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

export default function Analytics() {
  const [tab, setTab] = useState("overview");

  const totalRevenue = partners.reduce((s, p) => s + p.revenue, 0);
  const totalPipeline = partners.reduce((s, p) => s + p.pipeline, 0);
  const activePartners = partners.filter(p => p.status === "Active").length;
  const activeClients = mockClients.filter(c => c.status === "Active").length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Revenue, performance & renewal insights</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="animate-reveal-up stagger-1">
        <TabsList className="bg-secondary/60">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="renewals">Renewals</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI label="Total Revenue" value={`€${(totalRevenue / 1000).toFixed(0)}k`} sub="+12.3% vs last year" trend="up" />
            <KPI label="Pipeline Value" value={`€${(totalPipeline / 1000).toFixed(0)}k`} sub="+8.7% this quarter" trend="up" />
            <KPI label="Active Partners" value={String(activePartners)} sub={`of ${partners.length} total`} />
            <KPI label="Active Clients" value={String(activeClients)} sub={`${mockClients.length} total`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Over Time */}
            <div className="bg-card rounded-xl border shadow-sm">
              <div className="p-5 border-b">
                <h3 className="font-semibold text-foreground">Revenue Over Time</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Monthly revenue & pipeline trend</p>
              </div>
              <div className="p-5">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={monthlyRevenue}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(174, 62%, 34%)" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="hsl(174, 62%, 34%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `${v / 1000}k`} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(v: number) => [`€${v.toLocaleString()}`, undefined]} />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(174, 62%, 34%)" fill="url(#revGrad)" strokeWidth={2} />
                    <Line type="monotone" dataKey="pipeline" stroke="hsl(210, 80%, 52%)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Revenue by Country */}
            <div className="bg-card rounded-xl border shadow-sm">
              <div className="p-5 border-b">
                <h3 className="font-semibold text-foreground">Revenue by Country</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Geographic distribution</p>
              </div>
              <div className="p-5">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={revenueByCountry} layout="vertical" barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `€${v / 1000}k`} />
                    <YAxis type="category" dataKey="country" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(v: number) => [`€${v.toLocaleString()}`, "Revenue"]} />
                    <Bar dataKey="revenue" fill="hsl(174, 62%, 34%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Product Distribution */}
          <div className="bg-card rounded-xl border shadow-sm">
            <div className="p-5 border-b">
              <h3 className="font-semibold text-foreground">Revenue by Product</h3>
            </div>
            <div className="p-5 flex flex-col md:flex-row items-center gap-6">
              <ResponsiveContainer width={220} height={220}>
                <PieChart>
                  <Pie data={revenueByProduct} dataKey="revenue" nameKey="product" cx="50%" cy="50%" outerRadius={90} innerRadius={55} strokeWidth={2} stroke="hsl(var(--card))">
                    {revenueByProduct.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`€${v.toLocaleString()}`, "Revenue"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {revenueByProduct.map((p, i) => (
                  <div key={p.product} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS[i] }} />
                      <span className="font-medium">{p.product}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="tabular-nums text-muted-foreground">{p.clients} clients</span>
                      <span className="tabular-nums font-medium w-20 text-right">€{p.revenue.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* PARTNERS TAB */}
        <TabsContent value="partners" className="space-y-6 mt-4">
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="p-5 border-b">
              <h3 className="font-semibold text-foreground">Partner Performance Ranking</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50">
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">#</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Partner</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Target</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Growth</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Clients</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Avg Deal</th>
                    <th className="text-center px-5 py-3 font-medium text-muted-foreground">vs Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {partnerPerformance.map((p, i) => {
                    const pct = Math.round((p.revenue / p.target) * 100);
                    return (
                      <tr key={p.partner} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-5 py-3 font-medium text-muted-foreground">{i + 1}</td>
                        <td className="px-5 py-3 font-medium text-foreground">{p.partner}</td>
                        <td className="px-5 py-3 text-right tabular-nums font-medium">€{p.revenue.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">€{p.target.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`tabular-nums font-medium ${p.growth >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                            {p.growth >= 0 ? "+" : ""}{p.growth}%
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">{p.clients}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">€{p.avgDeal.toLocaleString()}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: pct >= 100 ? "hsl(152, 60%, 40%)" : pct >= 80 ? "hsl(38, 92%, 50%)" : "hsl(0, 72%, 51%)" }} />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground w-8">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Partner Revenue Chart */}
          <div className="bg-card rounded-xl border shadow-sm">
            <div className="p-5 border-b">
              <h3 className="font-semibold text-foreground">Revenue by Partner</h3>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={partnerPerformance} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="partner" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `€${v / 1000}k`} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(v: number) => [`€${v.toLocaleString()}`, undefined]} />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(174, 62%, 34%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="target" name="Target" fill="hsl(var(--border))" radius={[4, 4, 0, 0]} opacity={0.5} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        {/* RENEWALS TAB */}
        <TabsContent value="renewals" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI label="Success Rate" value={`${renewalAnalytics.successRate}%`} sub={`${renewalAnalytics.wonRenewals} of ${renewalAnalytics.totalRenewals} renewed`} trend="up" />
            <KPI label="Avg Time to Close" value={`${renewalAnalytics.avgTimeToClose}d`} sub={`${renewalAnalytics.avgDelay}d avg delay`} />
            <KPI label="Renewal Revenue" value={`€${(renewalAnalytics.renewalRevenue / 1000).toFixed(0)}k`} sub="vs €160k new business" />
            <KPI label="Lost Renewals" value={String(renewalAnalytics.lostRenewals)} sub="worth €37.4k" trend="down" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Renewal vs New Business */}
            <div className="bg-card rounded-xl border shadow-sm">
              <div className="p-5 border-b">
                <h3 className="font-semibold text-foreground">Renewal vs New Business</h3>
              </div>
              <div className="p-5">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyRevenue} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `${v / 1000}k`} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(v: number) => [`€${v.toLocaleString()}`, undefined]} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="revenue" name="Renewal Rev." fill="hsl(174, 62%, 34%)" radius={[3, 3, 0, 0]} stackId="a" />
                    <Bar dataKey="newBusiness" name="New Business" fill="hsl(210, 80%, 52%)" radius={[3, 3, 0, 0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Renewal count by month */}
            <div className="bg-card rounded-xl border shadow-sm">
              <div className="p-5 border-b">
                <h3 className="font-semibold text-foreground">Renewals Processed</h3>
              </div>
              <div className="p-5">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    <Bar dataKey="renewals" name="Renewals" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* SALES TAB */}
        <TabsContent value="sales" className="space-y-6 mt-4">
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="p-5 border-b">
              <h3 className="font-semibold text-foreground">Sales Performance</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50">
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Salesperson</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Target</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Deals</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Clients</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Conversion</th>
                    <th className="text-center px-5 py-3 font-medium text-muted-foreground">Achievement</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {salesPerformance.map(s => {
                    const pct = Math.round((s.revenue / s.target) * 100);
                    return (
                      <tr key={s.salesperson} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-5 py-3 font-medium text-foreground">{s.salesperson}</td>
                        <td className="px-5 py-3 text-right tabular-nums font-medium">€{s.revenue.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">€{s.target.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{s.deals}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{s.clients}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{s.conversion}%</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: pct >= 100 ? "hsl(152, 60%, 40%)" : pct >= 80 ? "hsl(38, 92%, 50%)" : "hsl(0, 72%, 51%)" }} />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground w-8">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sales chart */}
          <div className="bg-card rounded-xl border shadow-sm">
            <div className="p-5 border-b">
              <h3 className="font-semibold text-foreground">Revenue by Salesperson</h3>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={salesPerformance} layout="vertical" barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `€${v / 1000}k`} />
                  <YAxis type="category" dataKey="salesperson" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={110} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(v: number) => [`€${v.toLocaleString()}`, undefined]} />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(174, 62%, 34%)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="target" name="Target" fill="hsl(var(--border))" radius={[0, 4, 4, 0]} opacity={0.4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        {/* PRODUCTS TAB */}
        <TabsContent value="products" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {revenueByProduct.map((p, i) => (
              <div key={p.product} className="bg-card rounded-xl border shadow-sm p-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS[i] }} />
                  <p className="text-xs text-muted-foreground font-medium">{p.product}</p>
                </div>
                <p className="text-lg font-bold tabular-nums mt-1">€{(p.revenue / 1000).toFixed(0)}k</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{p.clients} clients · {p.pct}%</p>
              </div>
            ))}
          </div>

          <div className="bg-card rounded-xl border shadow-sm">
            <div className="p-5 border-b">
              <h3 className="font-semibold text-foreground">License Distribution</h3>
            </div>
            <div className="p-5 flex flex-col md:flex-row items-center gap-8">
              <ResponsiveContainer width={240} height={240}>
                <PieChart>
                  <Pie data={revenueByProduct} dataKey="clients" nameKey="product" cx="50%" cy="50%" outerRadius={100} innerRadius={60} strokeWidth={2} stroke="hsl(var(--card))" label={({ product, pct }) => `${product} (${pct}%)`}>
                    {revenueByProduct.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {revenueByProduct.map((p, i) => (
                  <div key={p.product}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{p.product}</span>
                      <span className="tabular-nums text-muted-foreground">€{p.revenue.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${p.pct}%`, backgroundColor: COLORS[i] }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
