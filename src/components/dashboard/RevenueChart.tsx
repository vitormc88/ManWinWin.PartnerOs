import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
    <section
      aria-label="Awarded revenue chart"
      className="bg-card rounded-xl border p-5 space-y-4 min-w-0"
    >
      <div className="flex justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Awarded revenue</h2>
        </div>
        <span
          className="text-[10px] text-muted-foreground text-right"
          title={updatedAt ? lastUpdatedLabel(updatedAt) : "Not loaded"}
        >
          {year} {period.toUpperCase()} · {currency}
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
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={data}
              maxBarSize={26}
              margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
              accessibilityLayer
            >
              <CartesianGrid
                vertical={false}
                stroke="hsl(var(--border) / 0.65)"
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: 11,
                  fill: "hsl(var(--muted-foreground))",
                  fontFamily: "inherit",
                }}
                tickMargin={9}
                minTickGap={8}
                height={30}
              />
              <YAxis
                tickFormatter={(v) =>
                  formatMoney(v, { currency, compact: true })
                }
                width={58}
                tickCount={5}
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: 10,
                  fill: "hsl(var(--muted-foreground))",
                  fontFamily: "inherit",
                }}
              />
              <Tooltip
                formatter={(v: number) => formatMoney(v, { currency })}
                cursor={{ fill: "hsl(var(--secondary) / 0.5)" }}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  borderColor: "hsl(var(--border))",
                  background: "hsl(var(--card))",
                  color: "hsl(var(--foreground))",
                }}
                labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              />
              <Bar
                dataKey="nb"
                name="New Business"
                stackId="awards"
                fill="hsl(var(--primary))"
                isAnimationActive={false}
              />
              <Bar
                dataKey="renewals"
                name="Renewals"
                stackId="awards"
                fill="hsl(var(--info))"
                isAnimationActive={false}
              />
              {data.some((d) => d.other !== 0) && (
                <Bar
                  dataKey="other"
                  name="Other / unclassified"
                  stackId="awards"
                  fill="hsl(var(--muted-foreground))"
                  isAnimationActive={false}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
          <ul
            aria-label="Revenue chart legend"
            className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground"
          >
            <li className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-sm bg-primary/80"
              />
              New business
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-sm bg-info/80"
              />
              Renewals
            </li>
            {data.some((d) => d.other !== 0) && (
              <li className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-sm bg-muted-foreground"
                />
                Other / unclassified
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
