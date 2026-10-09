import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  revenueSeries,
  type Period,
  type RevenueEntry,
} from "@/lib/dashboard-metrics";
import { formatMoney } from "@/lib/money";
import { lastUpdatedLabel } from "@/hooks/useAnalytics";

export function RevenueChart({
  rows,
  year,
  period,
  grouping,
  currency,
  loading,
  error,
  retry,
  updatedAt,
  now,
}: {
  rows: RevenueEntry[];
  year: number;
  period: Period;
  grouping: "month" | "quarter";
  currency: string;
  loading: boolean;
  error: boolean;
  retry: () => void;
  updatedAt: number;
  now: Date;
}) {
  const data = revenueSeries(rows, year, period, grouping, now);
  return (
    <section className="bg-card rounded-xl border shadow-sm p-5 space-y-4">
      <div className="flex justify-between gap-3">
        <div>
          <h2 className="font-semibold">Awarded Revenue</h2>
          <p className="text-xs text-muted-foreground">
            New business and renewals · {currency} · commercial awards
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {updatedAt ? lastUpdatedLabel(updatedAt) : "Not loaded"}
        </span>
      </div>
      {error ? (
        <div role="alert">
          Revenue unavailable.{" "}
          <button className="text-primary underline" onClick={retry}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <p aria-busy="true">Loading revenue…</p>
      ) : (
        <>
          {!data.some((d) => d.total !== 0) && (
            <p className="text-sm text-muted-foreground">
              No awarded revenue recorded in this period.
            </p>
          )}
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
              />
              <XAxis dataKey="label" />
              <YAxis
                tickFormatter={(v) =>
                  formatMoney(v, { currency, compact: true })
                }
                width={75}
              />
              <Tooltip
                formatter={(v: number) => formatMoney(v, { currency })}
              />
              <Legend />
              <Bar
                dataKey="nb"
                name="New Business"
                stackId="awards"
                fill="hsl(var(--primary))"
              />
              <Bar
                dataKey="renewals"
                name="Renewals"
                stackId="awards"
                fill="hsl(var(--info))"
              />
              {data.some((d) => d.other !== 0) && (
                <Bar
                  dataKey="other"
                  name="Other / unclassified"
                  stackId="awards"
                  fill="hsl(var(--muted-foreground))"
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </section>
  );
}
