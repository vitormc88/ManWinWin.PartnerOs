import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { revenueByMonth } from "@/data/mock-data";

export function RevenueChart() {
  return (
    <div className="bg-card rounded-xl border shadow-sm animate-reveal-up stagger-2">
      <div className="p-5 border-b">
        <h3 className="font-semibold text-foreground">Revenue & Pipeline</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Last 6 months performance</p>
      </div>
      <div className="p-5">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={revenueByMonth} barGap={4}>
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
            <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="pipeline" name="Pipeline" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} opacity={0.6} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
