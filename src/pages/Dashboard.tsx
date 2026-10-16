import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import "./Dashboard.css";
import { Link } from "react-router-dom";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { PartnerHealthList } from "@/components/dashboard/PartnerHealthList";
import { PartnerLearning } from "@/components/dashboard/PartnerLearning";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { usePartners } from "@/hooks/usePartners";
import { useClients } from "@/hooks/useClients";
import { useDeals, useRenewals, useNotifications } from "@/hooks/useDeals";
import { usePartnerMetrics } from "@/hooks/usePartnerMetrics";
import {
  useDashboardRevenue,
  useDashboardTasks,
  useDashboardPartnerName,
} from "@/hooks/useDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { getRouteModule } from "@/lib/module-access";
import {
  periodBounds,
  comparisonBounds,
  revenueTotals,
  pipelineForecast,
  dashboardRenewals,
  partnerHealthRows,
  atRiskHealth,
  dashboardActions,
  type Period,
} from "@/lib/dashboard-metrics";
import { formatMoney } from "@/lib/money";
import { matchesPartnerFilter } from "@/lib/partner-identity";
import { authDealValue } from "@/lib/analytics-corrections";

function LoadState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: boolean;
  retry: () => void;
  children: React.ReactNode;
}) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      Data unavailable.{" "}
      <button className="underline" onClick={retry}>
        Retry
      </button>
    </p>
  ) : loading ? (
    <p className="text-sm text-muted-foreground" aria-busy="true">
      Loading…
    </p>
  ) : (
    <>{children}</>
  );
}
const scopeMatch = (id: string | null | undefined, scope: string) =>
  scope === "all" || (scope === "hq" ? !id : id === scope);
export default function Dashboard() {
  const { isHQ, profile, user } = useAuth();
  const { canView, isLoading: accessLoading } = useModuleAccess();
  const allow = (key: string) => !accessLoading && canView(key);
  const showPartners = isHQ && allow("partners"),
    showClients = allow("clients"),
    showPipeline = allow("pipeline"),
    showRenewals = allow("renewals"),
    showTasks = allow("tasks");
  const partnersQ = usePartners(undefined, { enabled: showPartners });
  const clientsQ = useClients(undefined, { enabled: showClients });
  const dealsQ = useDeals(undefined, { enabled: showPipeline });
  const renewalsQ = useRenewals(undefined, { enabled: showRenewals });
  const notificationsQ = useNotifications(allow("notifications"));
  const revenueQ = useDashboardRevenue(showClients);
  const healthQ = usePartnerMetrics(showPartners);
  const tasksQ = useDashboardTasks(showTasks, isHQ, user?.id);
  const ownName = useDashboardPartnerName(
    !isHQ && !accessLoading,
    profile?.partner_id,
  );
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [year, setYear] = useState(now.getFullYear());
  const [period, setPeriod] = useState<Period>("ytd");
  const [grouping, setGrouping] = useState<"month" | "quarter">("month");
  const [partner, setPartner] = useState("all");
  const [archived, setArchived] = useState(false);
  const [currency, setCurrency] = useState("EUR");
  const [healthOpen, setHealthOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  // Scope is resolved on every render so an HQ filter cannot survive an identity switch.
  const scope = isHQ && showPartners ? partner : "all";
  const partners = partnersQ.data ?? [];
  const clients = (showClients ? (clientsQ.data ?? []) : []).filter((c) =>
    matchesPartnerFilter(c, scope),
  );
  const deals = (showPipeline ? (dealsQ.data ?? []) : []).filter((d) =>
    scopeMatch(d.partner_id, scope),
  );
  const revenue = (showClients ? (revenueQ.data ?? []) : []).filter((r) =>
    scopeMatch(r.partner_id, scope),
  );
  const currencies = [
    ...new Set(revenue.map((r) => r.currency || "EUR")),
  ].sort();
  const selectedCurrency = currencies.includes(currency)
    ? currency
    : (currencies[0] ?? "EUR");
  const monetaryRows = revenue.filter(
    (r) => (r.currency || "EUR") === selectedCurrency,
  );
  const bounds = periodBounds(year, period, now),
    previous = comparisonBounds(year, period, now);
  const totals = revenueTotals(monetaryRows, bounds),
    prior = revenueTotals(monetaryRows, previous),
    lifetime = revenueTotals(monetaryRows);
  const forecastBounds = periodBounds(year, period, now, false);
  const forecast = pipelineForecast(deals, forecastBounds);
  const clientMap = useMemo(
    () =>
      new Map((showClients ? (clientsQ.data ?? []) : []).map((c) => [c.id, c])),
    [clientsQ.data, showClients],
  );
  const renewalRows = dashboardRenewals(renewalsQ.data ?? [], now).filter((r) =>
    matchesPartnerFilter(
      {
        partner_uuid:
          r.partner_uuid ?? clientMap.get(r.client_id)?.partner_uuid,
        partner_id: r.partner_id ?? clientMap.get(r.client_id)?.partner_id,
      },
      scope,
    ),
  );
  const overdue = renewalRows.filter((r) => r.days !== null && r.days < 0);
  const soon = renewalRows.filter(
    (r) => r.days !== null && r.days >= 0 && r.days <= 30,
  );
  const healthRows = partnerHealthRows(partners, healthQ.data ?? {}).filter(
    (r) => scopeMatch(r.partner.id, scope),
  );
  const risks = atRiskHealth(healthRows);
  const years = [
    ...new Set([
      now.getFullYear(),
      ...(showClients ? (revenueQ.data ?? []) : [])
        .map((r) => Number(r.revenue_date?.slice(0, 4)))
        .filter(Boolean),
      ...(showPipeline ? (dealsQ.data ?? []) : [])
        .map((d) => Number(d.expected_close_date?.slice(0, 4)))
        .filter(Boolean),
    ]),
  ].sort((a, b) => b - a);
  const renewalLink = (r: (typeof renewalRows)[number]) =>
    `/renewals?renewal=${encodeURIComponent(r.id)}`;
  const label = (r: (typeof renewalRows)[number]) => {
    const c = clientMap.get(r.client_id);
    return c
      ? `${c.client_code} — ${c.short_name || c.commercial_name}`
      : "Open renewal details";
  };
  const taskRows = dashboardActions(
    (tasksQ.data ?? []).filter((t) => {
      const route = t.related_route?.split("?")[0];
      const module = route ? getRouteModule(route)?.moduleKey : null;
      const sourceModule: Record<string, string> = {
        manual: "tasks",
        pipeline: "pipeline",
        renewal: "renewals",
        partner: "partners",
        lead: "incoming_leads",
        customer: "clients",
        certification: "certifications",
      };
      const required = module || sourceModule[t.source];
      return (
        !!required && allow(required) && (scope === "all" || !showPartners)
      );
    }),
  );
  const retryRevenue = () => {
    void revenueQ.refetch();
  };
  const delta =
    prior.total === 0
      ? `Previous equivalent period: ${formatMoney(prior.total, { currency: selectedCurrency })}`
      : `${(((totals.total - prior.total) / Math.abs(prior.total)) * 100).toFixed(1)}% vs equivalent period in ${year - 1}`;
  const pipelineLink = `/pipeline?dashboard=open${scope !== "all" ? `&partner_id=${encodeURIComponent(scope)}` : ""}`;
  return (
    <div className="dashboard-cockpit max-w-7xl mx-auto space-y-4 min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-1">
            {isHQ ? "Partner ecosystem" : "Partner workspace"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            {isHQ
              ? "Executive overview"
              : `${ownName.data || "Your Partner"} Dashboard`}
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            {now.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          <button
            className="inline-flex items-center justify-center text-foreground border rounded-md p-2 bg-card hover:bg-secondary"
            title="Refresh dashboard"
            onClick={() => {
              if (showClients) {
                void revenueQ.refetch();
                void clientsQ.refetch();
              }
              if (showPipeline) void dealsQ.refetch();
              if (showPartners) {
                void partnersQ.refetch();
                void healthQ.refetch();
              }
              if (showRenewals) void renewalsQ.refetch();
              if (showTasks) void tasksQ.refetch();
              if (allow("notifications")) void notificationsQ.refetch();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Refresh dashboard</span>
          </button>
        </div>
      </header>
      {accessLoading ? (
        <p aria-busy="true">Loading permissions…</p>
      ) : !showClients &&
        !showPipeline &&
        !showRenewals &&
        !showTasks &&
        !allow("announcements") ? (
        <p>
          No dashboard sections are available with your current permissions.
        </p>
      ) : null}
      {(showClients || showPipeline) && (
        <section
          aria-label="Dashboard filters"
          className="cockpit-toolbar flex flex-wrap items-center gap-x-2 gap-y-2 text-xs"
        >
          <CalendarDays
            className="w-4 h-4 text-muted-foreground shrink-0"
            aria-hidden="true"
          />
          <label className="sr-only" htmlFor="dashboard-year">
            Year
          </label>
          <select
            id="dashboard-year"
            aria-label="Year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="cockpit-filter font-semibold"
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <label className="sr-only" htmlFor="dashboard-period">
            Period
          </label>
          <select
            id="dashboard-period"
            aria-label="Period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="cockpit-filter font-semibold"
          >
            <option value="ytd">YTD</option>
            <option value="year">Full year</option>
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={`q${q}`}>
                Q{q}
              </option>
            ))}
          </select>
          <span className="hidden sm:inline text-muted-foreground mr-2">
            {new Date(bounds.start + "T12:00:00").toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })}{" "}
            –{" "}
            {new Date(bounds.end + "T12:00:00").toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })}
          </span>
          {showPartners && (
            <>
              <label className="sr-only" htmlFor="dashboard-partner">
                Partner
              </label>
              <select
                id="dashboard-partner"
                aria-label="Partner"
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
                className="cockpit-filter max-w-[210px] text-muted-foreground"
              >
                <option value="all">All partners + HQ Direct</option>
                <option value="hq">HQ Direct</option>
                {partners
                  .filter((p) => archived || p.status !== "Archived")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.company_name}
                      {p.status === "Archived" ? " (archived)" : ""}
                    </option>
                  ))}
              </select>
            </>
          )}
          {showClients && currencies.length > 1 && (
            <label className="text-muted-foreground">
              <span className="sr-only">Revenue currency</span>
              <select
                aria-label="Revenue currency"
                value={selectedCurrency}
                onChange={(e) => setCurrency(e.target.value)}
                className="cockpit-filter"
              >
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button className="ml-auto rounded-md border bg-card px-3 py-2 text-xs hover:bg-secondary">
                Scope & definitions
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[min(24rem,calc(100vw-2rem))] text-xs space-y-4"
            >
              <h2 className="font-semibold text-sm">Scope & definitions</h2>
              <p className="text-muted-foreground">
                {bounds.label} · Awards: {bounds.start} to {bounds.end}. Open
                pipeline and renewal urgency are current, not historical
                snapshots.
              </p>
              {showClients && (
                <label className="flex items-center justify-between gap-3">
                  Group by{" "}
                  <select
                    aria-label="Group by"
                    value={grouping}
                    onChange={(e) =>
                      setGrouping(e.target.value as "month" | "quarter")
                    }
                    className="rounded border bg-background p-2"
                  >
                    <option value="month">Month</option>
                    <option value="quarter">Quarter</option>
                  </select>
                </label>
              )}
              {showPartners && (
                <label className="flex gap-2 items-start">
                  <input
                    type="checkbox"
                    checked={archived}
                    onChange={(e) => {
                      setArchived(e.target.checked);
                      setPartner("all");
                    }}
                  />
                  Include archived partners in historical selection
                </label>
              )}
              {showClients && (
                <p className="border-t pt-3 text-muted-foreground leading-relaxed">
                  Awarded revenue is the recorded commercial value, not
                  invoices, payments or partner commissions. Imported history
                  keeps its original dates and values. Historical revenue
                  includes archived relationships. Currency: {selectedCurrency}.
                </p>
              )}
            </PopoverContent>
          </Popover>
        </section>
      )}
      <div
        className={`grid gap-4 ${showClients && showPipeline ? "lg:grid-cols-[1.2fr_1fr]" : "grid-cols-1"}`}
      >
        {showClients && (
          <section
            aria-labelledby="dashboard-awards-title"
            className="cockpit-awards bg-card border rounded-xl p-5 min-w-0"
          >
            <h2
              id="dashboard-awards-title"
              className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground"
            >
              Awarded Revenue · {period.toUpperCase()}
            </h2>
            <LoadState
              loading={revenueQ.isLoading}
              error={revenueQ.isError}
              retry={retryRevenue}
            >
              <p className="text-3xl sm:text-4xl font-semibold tracking-tight tabular-nums mt-3">
                {formatMoney(totals.total, { currency: selectedCurrency })}
              </p>
              <p
                className={`text-[11px] mt-2 ${totals.total < prior.total ? "text-destructive" : "text-teal-700 dark:text-teal-400"}`}
              >
                {delta}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t mt-4 pt-3">
                <div>
                  <h3 className="text-xs text-muted-foreground">
                    New Business · selected period
                  </h3>
                  <p className="text-lg font-semibold tabular-nums mt-1">
                    {formatMoney(totals.nb, { currency: selectedCurrency })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Year 1 · includes services
                  </p>
                </div>
                <div>
                  <h3 className="text-xs text-muted-foreground">
                    Renewals · selected period
                  </h3>
                  <p className="text-lg font-semibold tabular-nums mt-1">
                    {formatMoney(totals.renewals, {
                      currency: selectedCurrency,
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Year 2+ · awarded renewals
                  </p>
                </div>
                {totals.other !== 0 && (
                  <div className="sm:col-span-2">
                    <h3 className="text-xs text-muted-foreground">
                      Other / unclassified awards
                    </h3>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatMoney(totals.other, {
                        currency: selectedCurrency,
                      })}
                    </p>
                  </div>
                )}
              </div>
            </LoadState>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Commercial awards, not invoices or cash received.
            </p>
          </section>
        )}
        {showPipeline && (
          <section
            aria-labelledby="dashboard-pipeline-title"
            className="bg-card rounded-xl border p-5 space-y-3 min-w-0"
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                id="dashboard-pipeline-title"
                className="text-sm font-medium text-muted-foreground"
              >
                Open Pipeline · current
              </h2>
              <Link
                to={pipelineLink}
                className="text-xs text-primary inline-flex items-center gap-1"
              >
                View pipeline{" "}
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
            <LoadState
              loading={dealsQ.isLoading}
              error={dealsQ.isError}
              retry={() => {
                void dealsQ.refetch();
              }}
            >
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatMoney(forecast.total)}
              </p>
              <p className="text-xs text-muted-foreground">
                {forecast.open.length} open opportunities · EUR
              </p>
              {forecast.missing.length !== forecast.open.length && (
                <h3 className="text-xs font-semibold border-t pt-3">
                  Expected closures · {bounds.label}
                </h3>
              )}
              {forecast.open.length > 0 &&
              forecast.missing.length === forecast.open.length ? (
                <div className="flex gap-2.5 rounded-lg bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                  <CalendarDays
                    className="w-4 h-4 mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-xs font-semibold">
                      Forecast unavailable
                    </p>
                    <p className="text-[11px] mt-1">
                      {forecast.open.length} opportunities have no expected
                      close date.
                    </p>
                    <p className="sr-only">
                      No reliable period forecast can be calculated.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p>
                    {forecast.scheduled.length} currently open opportunities
                    scheduled {forecastBounds.start} to {forecastBounds.end} ·{" "}
                    {formatMoney(forecast.scheduledValue)} · weighted{" "}
                    {formatMoney(forecast.weighted)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Based on expected close dates and commercial probabilities.
                    This is a forecast of today's open opportunities, not past
                    pipeline or awarded revenue.
                  </p>
                </>
              )}
              {forecast.missing.length > 0 && (
                <Link
                  className="inline-flex items-center gap-2 text-xs hover:underline"
                  to={`${pipelineLink.replace("dashboard=open", "dashboard=undated")}`}
                >
                  <span className="sr-only">
                    {forecast.missing.length} opportunities without an expected
                    close date —{" "}
                  </span>
                  Review missing dates{" "}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
              {forecast.missing.length > 0 &&
                forecast.missing.length < forecast.open.length && (
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Partial forecast: undated opportunities are excluded from
                    the period values above.
                  </p>
                )}
              {forecast.scheduled.slice(0, 5).map((d) => (
                <Link
                  className="block text-sm text-primary"
                  key={d.id}
                  to={`/deals/${d.id}`}
                >
                  {d.company_name} · {d.expected_close_date} ·{" "}
                  {formatMoney(d.expected_value)}
                </Link>
              ))}
            </LoadState>
          </section>
        )}
      </div>
      {(showRenewals || showPartners || showTasks) && (
        <section aria-labelledby="dashboard-focus-title" className="space-y-2">
          <h2 id="dashboard-focus-title" className="text-sm font-semibold">
            Where attention is needed
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {showRenewals && (
              <div
                className={`rounded-xl p-3.5 ${!renewalsQ.isError && !renewalsQ.isLoading && overdue.length ? "bg-primary/5" : "border bg-card"}`}
              >
                <LoadState
                  loading={renewalsQ.isLoading}
                  error={renewalsQ.isError}
                  retry={() => {
                    void renewalsQ.refetch();
                  }}
                >
                  <Link
                    to={`/renewals?deadline=Overdue${scope !== "all" ? `&partner=${scope}` : ""}`}
                    className="flex items-center justify-between gap-3 hover:underline"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <strong
                        className={`text-2xl tabular-nums ${overdue.length ? "text-destructive" : ""}`}
                      >
                        {overdue.length}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        Overdue renewals
                      </span>
                    </span>
                    <ArrowUpRight
                      className="h-4 w-4 text-muted-foreground ml-auto shrink-0"
                      aria-hidden="true"
                    />
                  </Link>
                </LoadState>
              </div>
            )}
            {showPartners && (
              <div className="border rounded-xl bg-card p-4">
                <LoadState
                  loading={partnersQ.isLoading || healthQ.isLoading}
                  error={partnersQ.isError || healthQ.isError}
                  retry={() => {
                    void partnersQ.refetch();
                    void healthQ.refetch();
                  }}
                >
                  <a
                    href="#dashboard-partner-health"
                    onClick={() => setHealthOpen(true)}
                    className="flex items-center gap-3 hover:underline"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <strong className="text-2xl tabular-nums">
                        {risks.length}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        Partner health requires attention
                      </span>
                    </span>
                    <ArrowUpRight
                      className="h-4 w-4 text-muted-foreground ml-auto shrink-0"
                      aria-hidden="true"
                    />
                  </a>
                </LoadState>
              </div>
            )}
            {showTasks && (
              <a
                href="#dashboard-actions"
                onClick={() => setTasksOpen(true)}
                className="border rounded-xl bg-card p-4 flex items-center justify-between gap-3 hover:bg-secondary/50"
              >
                <span className="text-sm font-medium">
                  {isHQ ? "Review team actions" : "Review my actions"}
                  <span className="block text-xs font-normal text-muted-foreground mt-1">
                    Priorities, owners and due dates
                  </span>
                </span>
                <ArrowUpRight
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </a>
            )}
          </div>
        </section>
      )}
      <div
        className={`grid grid-cols-1 gap-4 items-start ${showClients && showRenewals ? "lg:grid-cols-[1.35fr_1fr]" : ""}`}
      >
        {showClients && (
          <div className="min-w-0">
            <RevenueChart
              rows={monetaryRows}
              year={year}
              period={period}
              grouping={grouping}
              currency={selectedCurrency}
              loading={revenueQ.isLoading}
              error={revenueQ.isError}
              retry={retryRevenue}
              updatedAt={revenueQ.dataUpdatedAt}
              now={now}
            />
          </div>
        )}
        {showRenewals && (
          <section className="bg-card rounded-xl border p-5 space-y-3 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-sm">Renewals to manage</h2>
              <span className="text-[10px] text-muted-foreground">
                ● Current
              </span>
            </div>
            <LoadState
              loading={renewalsQ.isLoading}
              error={renewalsQ.isError}
              retry={() => {
                void renewalsQ.refetch();
              }}
            >
              <div className="cockpit-renewal-buckets grid grid-cols-4 gap-1.5">
                {[
                  { label: "Overdue", rows: overdue, deadline: "Overdue" },
                  { label: "0–30 days", rows: soon, deadline: "Due Soon" },
                  {
                    label: "31–60 days",
                    rows: renewalRows.filter(
                      (r) => r.days !== null && r.days >= 31 && r.days <= 60,
                    ),
                    deadline: "31-60",
                  },
                  {
                    label: "61–90 days",
                    rows: renewalRows.filter(
                      (r) => r.days !== null && r.days >= 61 && r.days <= 90,
                    ),
                    deadline: "61-90",
                  },
                ].map((b) => (
                  <Link
                    className={`rounded-lg px-2 py-2.5 min-w-0 ${b.deadline === "Overdue" && b.rows.length ? "bg-primary/5 text-destructive" : "bg-secondary/40"}`}
                    key={b.label}
                    to={`/renewals?deadline=${encodeURIComponent(b.deadline)}${scope !== "all" ? `&partner=${scope}` : ""}`}
                  >
                    <strong>{b.rows.length}</strong>
                    <p className="text-[10px] whitespace-nowrap">
                      {b.label.replace(" days", "d")}
                    </p>
                  </Link>
                ))}
              </div>
              <div aria-label="Priority renewals">
                {[...overdue, ...soon].slice(0, 3).map((r) => {
                  const customer = clientMap.get(r.client_id);
                  return (
                    <Link
                      key={r.id}
                      className="flex items-center justify-between gap-3 border-t py-3 text-xs hover:text-primary"
                      to={renewalLink(r)}
                      title={`${label(r)} · ${r.assigned_owner || "Unassigned"}`}
                      aria-label={`${label(r)} · ${r.days < 0 ? `${Math.abs(r.days)}d overdue` : `${r.days}d`} · ${r.assigned_owner || "Unassigned"}`}
                    >
                      <span className="truncate min-w-0">
                        {customer?.short_name ||
                          customer?.commercial_name ||
                          "Open renewal details"}
                      </span>
                      <span
                        className={`shrink-0 tabular-nums text-[11px] ${r.days < 0 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {r.days < 0
                          ? `${Math.abs(r.days)}d overdue`
                          : `${r.days}d`}
                      </span>
                    </Link>
                  );
                })}
              </div>
              <Link
                className="inline-flex items-center gap-2 text-xs hover:underline pt-1"
                to={`/renewals${scope !== "all" ? `?partner=${encodeURIComponent(scope)}` : ""}`}
              >
                See customers & owners{" "}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              {overdue.length === 0 && soon.length === 0 && (
                <p className="text-sm">
                  No overdue renewals or renewals due within 30 days.
                </p>
              )}
            </LoadState>
          </section>
        )}
      </div>
      {(showClients || showPartners) && (
        <section
          aria-label="Current ecosystem"
          className="flex flex-wrap gap-x-8 gap-y-4 bg-card rounded-xl border p-4"
        >
          {showClients && (
            <LoadState
              loading={clientsQ.isLoading}
              error={clientsQ.isError}
              retry={() => {
                void clientsQ.refetch();
              }}
            >
              <Link
                className="flex items-baseline gap-2 text-sm hover:underline"
                to={`/clients?dashboard=active${scope !== "all" ? `&partner=${scope}` : ""}`}
              >
                <strong className="text-lg tabular-nums">
                  {clients.filter((c) => c.status === "Active").length}
                </strong>
                <span className="text-muted-foreground">Active clients</span>
                <span className="text-xs text-muted-foreground">
                  ·{" "}
                  {
                    clients.filter((c) => c.status === "Active" && c.is_premium)
                      .length
                  }{" "}
                  premium
                </span>
              </Link>
            </LoadState>
          )}
          {showPartners && (
            <LoadState
              loading={partnersQ.isLoading}
              error={partnersQ.isError}
              retry={() => {
                void partnersQ.refetch();
              }}
            >
              <a
                href="#dashboard-partner-health"
                onClick={() => setHealthOpen(true)}
                className="flex items-baseline gap-2 text-sm hover:underline"
              >
                <strong className="text-lg tabular-nums">
                  {healthRows.length}
                </strong>
                <span className="text-muted-foreground">Active partners</span>
                <span className="text-xs text-muted-foreground">
                  · archived excluded
                </span>
              </a>
            </LoadState>
          )}
        </section>
      )}
      <div
        className={`grid grid-cols-1 gap-4 items-start ${showPartners && showTasks ? "lg:grid-cols-2" : ""}`}
      >
        {showPartners && (
          <details
            id="dashboard-partner-health"
            open={healthOpen}
            onToggle={(e) => setHealthOpen(e.currentTarget.open)}
            className="group bg-card rounded-xl border p-5 min-w-0"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="font-semibold">Partner health details</span>
              <ChevronDown
                className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="pt-4">
              <PartnerHealthList
                rows={healthRows}
                limit={healthRows.length}
                embedded
                loading={partnersQ.isLoading || healthQ.isLoading}
                error={partnersQ.isError || healthQ.isError}
                retry={() => {
                  void partnersQ.refetch();
                  void healthQ.refetch();
                }}
              />
            </div>
          </details>
        )}
        {showTasks && (
          <details
            id="dashboard-actions"
            open={tasksOpen}
            onToggle={(e) => setTasksOpen(e.currentTarget.open)}
            className="group bg-card rounded-xl border p-5 min-w-0"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="font-semibold">
                {isHQ ? "Team Next Actions" : "My Next Actions"}
              </span>
              <ChevronDown
                aria-hidden="true"
                className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="space-y-3 pt-4">
              <p className="text-xs text-muted-foreground">
                Ordered by priority, then earliest due date, then score. Tasks
                for the same renewal are grouped.
              </p>
              <LoadState
                loading={tasksQ.isLoading}
                error={tasksQ.isError}
                retry={() => {
                  void tasksQ.refetch();
                }}
              >
                {scope !== "all" ? (
                  <p className="text-sm text-muted-foreground">
                    Team actions cover all partners.{" "}
                    <button
                      className="underline text-primary"
                      onClick={() => setPartner("all")}
                    >
                      Show all
                    </button>
                  </p>
                ) : taskRows.length === 0 ? (
                  <p>No open actions available in your accessible modules.</p>
                ) : (
                  taskRows.slice(0, 6).map((t) => (
                    <div key={t.id} className="border-t pt-2 space-y-1">
                      <Link
                        className="block text-sm hover:underline"
                        to={`/tasks?view=${isHQ ? "team" : "my"}&task=${encodeURIComponent(t.id)}`}
                      >
                        <span className="font-medium">{t.title}</span>
                        <p className="text-xs text-muted-foreground">
                          {t.priority} ·{" "}
                          {t.due_date?.slice(0, 10) || "No due date"}
                          {isHQ ? ` · ${t.owner_name || "Unassigned"}` : ""}
                        </p>
                      </Link>
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer w-fit">
                          Priority details
                        </summary>
                        <p className="mt-1">
                          Priority score: {t.priority_score}
                        </p>
                      </details>
                      {t.members.length > 1 && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer">
                            {t.members.length} tasks for this renewal — view
                            details
                          </summary>
                          <ul className="mt-2 space-y-2">
                            {t.members.map((member) => (
                              <li key={member.id}>
                                <Link
                                  className="hover:underline"
                                  to={`/tasks?view=${isHQ ? "team" : "my"}&task=${encodeURIComponent(member.id)}`}
                                >
                                  {member.title} ·{" "}
                                  {member.owner_name || "Unassigned"} ·{" "}
                                  {member.due_date?.slice(0, 10) ||
                                    "No due date"}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  ))
                )}
              </LoadState>
              <Link
                className="inline-block text-xs text-foreground border rounded-md px-3 py-2 hover:bg-secondary"
                to={`/tasks?view=${isHQ ? "team" : "my"}`}
              >
                View actions
              </Link>
            </div>
          </details>
        )}
      </div>
      {!isHQ && (allow("onboarding") || allow("certifications")) && (
        <PartnerLearning
          academy={allow("onboarding")}
          certifications={allow("certifications")}
        />
      )}
      {(showClients || allow("notifications") || allow("announcements")) && (
        <details className="group bg-card rounded-xl border p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-medium">
              Updates & historical context
              {allow("notifications") &&
              !notificationsQ.isError &&
              !notificationsQ.isLoading &&
              (notificationsQ.data ?? []).some((n) => !n.is_read)
                ? ` · ${(notificationsQ.data ?? []).filter((n) => !n.is_read).length} unread alerts`
                : ""}
              {allow("notifications") && notificationsQ.isError
                ? " · Alerts unavailable"
                : ""}
            </span>
            <ChevronDown
              className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="space-y-4 pt-4">
            {allow("notifications") && (
              <section className="bg-card rounded-xl border p-5 space-y-2">
                <h2 className="font-semibold">Recent Alerts</h2>
                <LoadState
                  loading={notificationsQ.isLoading}
                  error={notificationsQ.isError}
                  retry={() => {
                    void notificationsQ.refetch();
                  }}
                >
                  {(notificationsQ.data ?? [])
                    .filter((n) => !n.is_read)
                    .slice(0, 4)
                    .map((n) => (
                      <Link
                        className="block text-sm"
                        key={n.id}
                        to="/notifications"
                      >
                        {n.title}
                      </Link>
                    ))}
                  {!(notificationsQ.data ?? []).some((n) => !n.is_read) && (
                    <p className="text-sm text-muted-foreground">
                      No unread notifications.
                    </p>
                  )}
                </LoadState>
              </section>
            )}
            {showClients && (
              <details className="bg-card rounded-xl border p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Historical context and sales reconciliation
                </summary>
                <LoadState
                  loading={revenueQ.isLoading}
                  error={revenueQ.isError}
                  retry={retryRevenue}
                >
                  <p className="text-sm mt-3">
                    Lifetime awarded revenue:{" "}
                    {formatMoney(lifetime.total, {
                      currency: selectedCurrency,
                    })}
                    . Selected-period awards{" "}
                    {formatMoney(totals.total, { currency: selectedCurrency })};
                    equivalent {year - 1} period{" "}
                    {formatMoney(prior.total, { currency: selectedCurrency })}.
                  </p>
                </LoadState>
                {showPipeline && (
                  <LoadState
                    loading={dealsQ.isLoading}
                    error={dealsQ.isError}
                    retry={() => {
                      void dealsQ.refetch();
                    }}
                  >
                    <p className="text-xs mt-2">
                      Won Deal Value · all time:{" "}
                      {formatMoney(
                        deals
                          .filter(
                            (d) => d.status === "Won" && d.stage === "Won",
                          )
                          .reduce((s, d) => s + authDealValue(d), 0),
                      )}
                      . Sales metric only; never added to awarded revenue.
                    </p>
                  </LoadState>
                )}
              </details>
            )}
            {allow("announcements") && <RecentActivity />}
          </div>
        </details>
      )}
    </div>
  );
}
