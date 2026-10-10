import { useEffect, useMemo, useState } from "react";
import { DollarSign, Users, TrendingUp, Activity, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { KPICard } from "@/components/dashboard/KPICard";
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
  const renewalLink = (r: any) =>
    `/renewals?renewal=${encodeURIComponent(r.id)}`;
  const label = (r: any) => {
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
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold">
          {isHQ ? "Dashboard" : `${ownName.data || "Your Partner"} Dashboard`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isHQ
            ? "Partner ecosystem overview"
            : "Your results and next actions"}{" "}
          · {now.toLocaleDateString("en-GB")}
        </p>
        <button
          className="text-xs text-foreground border rounded-md px-3 py-2 hover:bg-secondary mt-2"
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
          Refresh dashboard
        </button>
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
        <section className="bg-card border rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-4">
            <label className="text-sm">
              Year{" "}
              <select
                aria-label="Year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="ml-2 border rounded bg-background p-2"
              >
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Period{" "}
              <select
                aria-label="Period"
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="ml-2 border rounded bg-background p-2"
              >
                <option value="ytd">YTD / equivalent year-to-date</option>
                <option value="year">Full year</option>
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={`q${q}`}>
                    Q{q}
                  </option>
                ))}
              </select>
            </label>
            {showClients && (
              <label className="text-sm">
                Group by{" "}
                <select
                  aria-label="Group by"
                  value={grouping}
                  onChange={(e) => setGrouping(e.target.value as any)}
                  className="ml-2 border rounded bg-background p-2"
                >
                  <option value="month">Month</option>
                  <option value="quarter">Quarter</option>
                </select>
              </label>
            )}
            {showPartners && (
              <label className="text-sm">
                Partner{" "}
                <select
                  aria-label="Partner"
                  value={partner}
                  onChange={(e) => setPartner(e.target.value)}
                  className="ml-2 border rounded bg-background p-2"
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
              </label>
            )}
            {showClients && currencies.length > 1 && (
              <label className="text-sm">
                Revenue currency{" "}
                <select
                  value={selectedCurrency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="ml-2 border rounded bg-background p-2"
                >
                  {currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {showPartners && (
            <label className="text-xs flex gap-2">
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
          <p className="text-xs text-muted-foreground">
            {bounds.label} · Awards: {bounds.start} to {bounds.end}. Open
            pipeline and renewal urgency are current, not historical snapshots.
          </p>
        </section>
      )}
      {((showRenewals &&
        !renewalsQ.isLoading &&
        !renewalsQ.isError &&
        overdue.length > 0) ||
        (showPartners &&
          !healthQ.isLoading &&
          !healthQ.isError &&
          risks.length > 0)) && (
        <section className="border border-destructive/30 rounded-xl p-4 bg-destructive/5">
          <h2 className="font-semibold">Action Required</h2>
          <div className="flex gap-4 flex-wrap mt-2">
            {showRenewals && !renewalsQ.isError && overdue.length > 0 && (
              <Link
                className="text-destructive underline text-sm"
                to={`/renewals?deadline=Overdue${scope !== "all" ? `&partner=${scope}` : ""}`}
              >
                {overdue.length} overdue renewals
              </Link>
            )}
            {showPartners &&
              !healthQ.isError &&
              risks.map((r) => (
                <Link
                  className="text-destructive underline text-sm"
                  key={r.partner.id}
                  to={`/partners/${r.partner.id}`}
                >
                  {r.partner.company_name}: health requires attention
                </Link>
              ))}
          </div>
        </section>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {showClients && (
          <>
            <KPICard
              title={`Awarded Revenue · ${period.toUpperCase()}`}
              value={formatMoney(totals.total, { currency: selectedCurrency })}
              loading={revenueQ.isLoading}
              error={revenueQ.isError}
              change={delta}
              changeType={
                totals.total > prior.total
                  ? "positive"
                  : totals.total < prior.total
                    ? "negative"
                    : "neutral"
              }
              icon={Wallet}
            />
            <KPICard
              title="New Business · selected period"
              value={formatMoney(totals.nb, { currency: selectedCurrency })}
              loading={revenueQ.isLoading}
              error={revenueQ.isError}
              change="Year 1 · includes services"
              icon={DollarSign}
            />
            <KPICard
              title="Renewals · selected period"
              value={formatMoney(totals.renewals, {
                currency: selectedCurrency,
              })}
              loading={revenueQ.isLoading}
              error={revenueQ.isError}
              change="Year 2+ · awarded renewals"
              icon={Wallet}
            />
            {totals.other !== 0 && (
              <KPICard
                title="Other / unclassified awards"
                value={formatMoney(totals.other, {
                  currency: selectedCurrency,
                })}
                loading={revenueQ.isLoading}
                error={revenueQ.isError}
                icon={Wallet}
              />
            )}
          </>
        )}
        {showPipeline && (
          <Link to={pipelineLink}>
            <KPICard
              title="Open Pipeline · current"
              value={formatMoney(forecast.total)}
              change={`${forecast.open.length} open opportunities · EUR`}
              loading={dealsQ.isLoading}
              error={dealsQ.isError}
              icon={TrendingUp}
            />
          </Link>
        )}
        {showClients && (
          <Link
            to={`/clients?dashboard=active${scope !== "all" ? `&partner=${scope}` : ""}`}
          >
            <KPICard
              title="Active Clients · current"
              value={String(
                clients.filter((c) => c.status === "Active").length,
              )}
              change={`${clients.filter((c) => c.status === "Active" && c.is_premium).length} premium`}
              loading={clientsQ.isLoading}
              error={clientsQ.isError}
              icon={Activity}
            />
          </Link>
        )}
        {showPartners && (
          <KPICard
            title="Active Partners · current"
            value={String(healthRows.length)}
            change="Archived partners excluded"
            loading={partnersQ.isLoading}
            error={partnersQ.isError}
            icon={Users}
          />
        )}
      </div>
      {showClients && (
        <p className="text-xs text-muted-foreground">
          Awarded revenue is the recorded commercial value, not invoices,
          payments or partner commissions. Imported history keeps its original
          dates and values. Historical revenue includes archived relationships.
          Currency: {selectedCurrency}.
        </p>
      )}
      <div
        className={`grid grid-cols-1 ${showClients && showPartners ? "lg:grid-cols-3" : ""} gap-4`}
      >
        {showClients && (
          <div className={showPartners ? "lg:col-span-2" : ""}>
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
        {showPartners && (
          <PartnerHealthList
            rows={healthRows}
            loading={partnersQ.isLoading || healthQ.isLoading}
            error={partnersQ.isError || healthQ.isError}
            retry={() => {
              void partnersQ.refetch();
              void healthQ.refetch();
            }}
          />
        )}
      </div>
      {showPipeline && (
        <section className="bg-card rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold">Expected Closures · {bounds.label}</h2>
          <LoadState
            loading={dealsQ.isLoading}
            error={dealsQ.isError}
            retry={() => {
              void dealsQ.refetch();
            }}
          >
            {forecast.open.length > 0 &&
            forecast.missing.length === forecast.open.length ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="font-semibold">
                  Forecast unavailable — expected close dates missing
                </p>
                <p className="text-sm mt-1">
                  All {forecast.open.length} open opportunities lack a close
                  date. Current pipeline: {formatMoney(forecast.total)}. No
                  reliable period forecast can be calculated.
                </p>
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
                className="block text-amber-700 dark:text-amber-400 underline"
                to={`${pipelineLink.replace("dashboard=open", "dashboard=undated")}`}
              >
                {forecast.missing.length} opportunities without an expected
                close date — review
              </Link>
            )}
            {forecast.missing.length > 0 &&
              forecast.missing.length < forecast.open.length && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Partial forecast: undated opportunities are excluded from the
                  period values above.
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {showRenewals && (
          <section className="bg-card rounded-xl border p-5 space-y-3">
            <h2 className="font-semibold">Renewals · current urgency</h2>
            <LoadState
              loading={renewalsQ.isLoading}
              error={renewalsQ.isError}
              retry={() => {
                void renewalsQ.refetch();
              }}
            >
              <div className="grid grid-cols-2 gap-2">
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
                    className="rounded bg-secondary/50 p-3"
                    key={b.label}
                    to={`/renewals?deadline=${encodeURIComponent(b.deadline)}${scope !== "all" ? `&partner=${scope}` : ""}`}
                  >
                    <strong>{b.rows.length}</strong>
                    <p className="text-xs">{b.label}</p>
                  </Link>
                ))}
              </div>
              {[...overdue, ...soon].slice(0, 6).map((r) => (
                <Link
                  key={r.id}
                  className="block text-sm border-t pt-2"
                  to={renewalLink(r)}
                >
                  {label(r)}{" "}
                  <span className="text-muted-foreground">
                    ·{" "}
                    {r.days < 0 ? `${Math.abs(r.days)}d overdue` : `${r.days}d`}{" "}
                    · {r.assigned_owner || "Unassigned"}
                  </span>
                </Link>
              ))}
              {overdue.length === 0 && soon.length === 0 && (
                <p className="text-sm">
                  No overdue renewals or renewals due within 30 days.
                </p>
              )}
            </LoadState>
          </section>
        )}
        {showTasks && (
          <section className="bg-card rounded-xl border p-5 space-y-3">
            <h2 className="font-semibold">
              {isHQ ? "Team Next Actions" : "My Next Actions"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Ordered by priority, then earliest due date, then score. Tasks for
              the same renewal are grouped.
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
                        {` · score ${t.priority_score}`}
                      </p>
                    </Link>
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
                                {member.due_date?.slice(0, 10) || "No due date"}
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
          </section>
        )}
      </div>
      {!isHQ && (allow("onboarding") || allow("certifications")) && (
        <PartnerLearning
          academy={allow("onboarding")}
          certifications={allow("certifications")}
        />
      )}
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
                <Link className="block text-sm" key={n.id} to="/notifications">
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
              {formatMoney(lifetime.total, { currency: selectedCurrency })}.
              Selected-period awards{" "}
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
                    .filter((d) => d.status === "Won" && d.stage === "Won")
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
  );
}
