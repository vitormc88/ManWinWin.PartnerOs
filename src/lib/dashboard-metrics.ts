import { isClosedComponent } from "./renewal-active-cycle";
import { renewalDays } from "./renewal-pipeline";
import {
  isActivePipelineStage,
  resolveDealProbability,
} from "@/data/pipeline-stages";
import { healthBand } from "./partner-health-config";

export type Period = "ytd" | "year" | "q1" | "q2" | "q3" | "q4";
export type RevenueEntry = {
  id: string;
  client_id: string;
  partner_id: string | null;
  currency: string;
  amount: number | string;
  revenue_date: string | null;
  revenue_type: string | null;
  renewal_id: string | null;
};
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export function periodBounds(
  year: number,
  period: Period,
  now = new Date(),
  realised = true,
) {
  const quarter = /^q([1-4])$/.exec(period);
  const startMonth = quarter ? (Number(quarter[1]) - 1) * 3 + 1 : 1;
  const endMonth = quarter ? startMonth + 2 : 12;
  const start = iso(year, startMonth, 1);
  let end = iso(
    year,
    endMonth,
    new Date(Date.UTC(year, endMonth, 0)).getUTCDate(),
  );
  if (period === "ytd")
    end = iso(
      year,
      now.getMonth() + 1,
      Math.min(
        now.getDate(),
        new Date(Date.UTC(year, now.getMonth() + 1, 0)).getUTCDate(),
      ),
    );
  // Awards after today are not realised results, including when viewing a full year.
  const today = iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
  if (realised && end > today) end = today;
  return {
    start,
    end,
    label: `${year} · ${period === "year" ? "Full year" : period.toUpperCase()}`,
  };
}
export function inPeriod(
  date: string | null | undefined,
  bounds: { start: string; end: string },
) {
  const day = date?.slice(0, 10);
  return !!day && day >= bounds.start && day <= bounds.end;
}
export function comparisonBounds(
  year: number,
  period: Period,
  now = new Date(),
) {
  const current = periodBounds(year, period, now);
  if (current.end < current.start) {
    const prior = periodBounds(year - 1, period, now);
    const before = new Date(`${prior.start}T00:00:00Z`);
    before.setUTCDate(before.getUTCDate() - 1);
    return { ...prior, end: before.toISOString().slice(0, 10) };
  }
  const [, , day] = current.end.split("-").map(Number);
  const month = Number(current.end.slice(5, 7));
  return {
    ...periodBounds(year - 1, period, now),
    end: iso(
      year - 1,
      month,
      Math.min(day, new Date(Date.UTC(year - 1, month, 0)).getUTCDate()),
    ),
  };
}
export function revenueTotals(
  rows: RevenueEntry[],
  bounds?: { start: string; end: string },
) {
  let nb = 0,
    renewals = 0,
    other = 0;
  for (const r of rows) {
    if (bounds && !inPeriod(r.revenue_date, bounds)) continue;
    const amount = Number(r.amount) || 0;
    if (r.renewal_id || r.revenue_type === "renewal") renewals += amount;
    else if (r.revenue_type === "initial_sale") nb += amount;
    else other += amount;
  }
  return { nb, renewals, other, total: nb + renewals + other };
}
export function openPipeline<T extends { status: string; stage: string }>(
  deals: T[],
) {
  return deals.filter(
    (d) => d.status === "Open" && isActivePipelineStage(d.stage),
  );
}
export function pipelineForecast(
  deals: any[],
  bounds: { start: string; end: string },
) {
  const open = openPipeline(deals);
  const scheduled = open.filter((d) => inPeriod(d.expected_close_date, bounds));
  const value = (d: any) => Number(d.expected_value) || 0;
  return {
    open,
    scheduled,
    total: open.reduce((s, d) => s + value(d), 0),
    scheduledValue: scheduled.reduce((s, d) => s + value(d), 0),
    weighted: scheduled.reduce(
      (s, d) => s + (value(d) * resolveDealProbability(d)) / 100,
      0,
    ),
    missing: open.filter((d) => !d.expected_close_date),
  };
}
export function dashboardRenewals(rows: any[], now = new Date()) {
  return rows
    .filter((r) => !isClosedComponent(r) && !r.superseded_by_renewal_id)
    .map((r) => ({ ...r, days: renewalDays(r.renewal_date, now) }))
    .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));
}
export function partnerHealthRows(
  partners: any[],
  metrics: Record<string, any>,
) {
  return partners
    .filter((p) => p.status === "Active" && p.is_active !== false)
    .map((p) => ({ partner: p, metric: metrics[p.id] ?? null }))
    .sort(
      (a, b) =>
        (a.metric?.health_score ?? Infinity) -
        (b.metric?.health_score ?? Infinity),
    );
}
export function atRiskHealth(rows: ReturnType<typeof partnerHealthRows>) {
  return rows.filter(
    (r) => r.metric && healthBand(r.metric.health_score) === "at_risk",
  );
}
export function revenueSeries(
  rows: RevenueEntry[],
  year: number,
  period: Period,
  grouping: "month" | "quarter",
  now = new Date(),
) {
  const bounds = periodBounds(year, period, now);
  const months = /^q/.test(period)
    ? [
        Number(period.slice(1)) * 3 - 2,
        Number(period.slice(1)) * 3 - 1,
        Number(period.slice(1)) * 3,
      ]
    : Array.from({ length: 12 }, (_, i) => i + 1);
  return [
    ...new Set(
      months.map((m) => (grouping === "quarter" ? Math.ceil(m / 3) : m)),
    ),
  ]
    .filter(
      (n) =>
        iso(year, grouping === "quarter" ? (n - 1) * 3 + 1 : n, 1) <=
        bounds.end,
    )
    .map((n) => {
      const m = grouping === "quarter" ? (n - 1) * 3 + 1 : n;
      const last = grouping === "quarter" ? m + 2 : m;
      const bucket = {
        start: iso(year, m, 1),
        end: iso(year, last, new Date(Date.UTC(year, last, 0)).getUTCDate()),
      };
      const selected = rows.filter(
        (r) =>
          inPeriod(r.revenue_date, bounds) && inPeriod(r.revenue_date, bucket),
      );
      return {
        label:
          grouping === "quarter"
            ? `Q${n}`
            : new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-GB", {
                month: "short",
                timeZone: "UTC",
              }),
        ...revenueTotals(selected),
      };
    });
}
