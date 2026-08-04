import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { usePipelineMonthly, lastUpdatedLabel } from "@/hooks/useAnalytics";
import { useHistoricalRevenueMonthly } from "@/hooks/useRevenueHistory";

/**
 * Revenue bars come from `client_revenue_history` (billed revenue), NOT from
 * won deals. Pipeline bars stay deal-derived and are unchanged.
 */
export function RevenueChart() {
  const revenue = useHistoricalRevenueMonthly();
  const pipeline = usePipelineMonthly();

  const map = new Map<string, { month: string; revenue: number; pipeline: number }>();
  revenue.points.forEach((p) => {
    map.set(p.month_key, { month: p.month_label, revenue: p.revenue, pipeline: 0 });
  });
  (pipeline.data || []).forEach((p) => {
    const existing = map.get(p.month_key);
    if (existing) existing.pipeline = p.pipeline_value || 0;
    else map.set(p.month_key, { month: p.month_label, revenue: 0, pipeline: p.pipeline_value || 0 });
  });
  const data = [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);

  const isLoading = revenue.isLoading || pipeline.isLoading;
  const dataUpdatedAt = Math.max(revenue.dataUpdatedAt || 0, pipeline.dataUpdatedAt || 0);
  const hasData = data.some((d) => d.revenue > 0 || d.pipeline > 0);

  return (
    <div className="bg-card rounded-xl border shadow-sm animate-reveal-up stagger-2">
      <div className="p-5 border-b flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Revenue &amp; Pipeline</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Billed revenue vs open pipeline · live data</p>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">{lastUpdatedLabel(dataUpdatedAt)}</span>
      </div>
      <div className="p-5">
        {isLoading ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : !hasData ? (
          <div className="h-[280px] flex flex-col items-center justify-center text-center px-4">
            <p className="text-sm font-medium text-foreground">No analytics data available yet</p>
            <p className="text-xs text-muted-foreground mt-1">Data will appear once revenue is billed or opportunities are opened.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
                formatter={(value: number) => [`€${value.toLocaleString()}`, undefined]}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="revenue" name="Revenue (Billed)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pipeline" name="Pipeline (Open)" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
