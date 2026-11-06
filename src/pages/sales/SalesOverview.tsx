import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Flame, TrendingUp, Trophy, FileText, Kanban } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { stageLabel } from "@/lib/pipeline-gates";
import { useSalesCapability } from "@/hooks/useSalesCapability";
import { useAllProfilesMap } from "@/hooks/useAssignableUsers";
import { getOwnerDisplay } from "@/lib/owner-display";
import { useAuth } from "@/contexts/AuthContext";
import {
  useDirectDeals,
  useDirectProposals,
  isOpenDeal,
  weightedValue,
  attentionItems,
  likelyToClose,
  perOwnerStats,
} from "./sales-data";
import { authDealValue } from "@/lib/analytics-corrections";

const OPEN_PROPOSAL_STATUSES = new Set(["Draft", "Validated", "Ready", "Sent"]);

export default function SalesOverview() {
  const { user } = useAuth();
  const salesCap = useSalesCapability();
  const { deals, isLoading, isError } = useDirectDeals();
  const { data: proposals = [] } = useDirectProposals(
    deals.map((d) => d.id),
    !isLoading && !isError,
  );
  const { data: profilesMap } = useAllProfilesMap();

  if (isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Loading Sales Overview…</div>;
  if (isError)
    return (
      <div className="p-6 text-sm text-destructive">
        Sales Overview unavailable — the opportunity data could not be loaded.
      </div>
    );

  const open = deals.filter(isOpenDeal);
  const pipeline = open.reduce((s, d) => s + authDealValue(d), 0);
  const weighted = open.reduce((s, d) => s + weightedValue(d), 0);
  const openProposals = proposals.filter((p) => OPEN_PROPOSAL_STATUSES.has(p.status));
  const won = deals.filter((d) => d.status === "Won");
  const wonValue = won.reduce((s, d) => s + authDealValue(d), 0);
  const attention = attentionItems(deals);
  const likely = likelyToClose(deals);
  const owners = perOwnerStats(deals);
  const ownerName = (id: string | null) =>
    id ? getOwnerDisplay({ assigned_user_id: id }, profilesMap) : "Unassigned";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Sales Overview</h1>
        <p className="text-sm text-muted-foreground">
          Direct Sales workspace — what you're working on, what needs attention, and what is
          likely to close.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={Kanban} label="Open Pipeline" value={formatMoney(pipeline, { compact: true })} />
        <Kpi
          icon={TrendingUp}
          label="Weighted Pipeline"
          value={formatMoney(weighted, { compact: true })}
        />
        <Kpi icon={Flame} label="Open Opportunities" value={String(open.length)} />
        <Kpi icon={FileText} label="Proposals In Play" value={String(openProposals.length)} />
        <Kpi
          icon={Trophy}
          label="Closed Won"
          value={won.length === 0 ? "—" : `${won.length} · ${formatMoney(wonValue, { compact: true })}`}
          hint={won.length === 0 ? "Direct closing is not enabled yet" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Needs attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {attention.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing overdue or stuck right now.
              </p>
            )}
            {attention.slice(0, 6).map(({ deal, reason, days }) => (
              <Link
                key={deal.id}
                to={`/sales/deals/${deal.id}`}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span className="font-medium text-foreground">{deal.company_name}</span>
                <Badge variant="outline" className="text-destructive border-destructive/40">
                  {reason === "overdue-close" ? `close overdue ${days}d` : `stuck ${days}d`}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-4 w-4 text-primary" /> Likely to close
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {likely.length === 0 && (
              <p className="text-sm text-muted-foreground">No open opportunities yet.</p>
            )}
            {likely.map((d) => (
              <Link
                key={d.id}
                to={`/sales/deals/${d.id}`}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span className="font-medium text-foreground">{d.company_name}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Badge variant="secondary">{stageLabel(d.stage)}</Badge>
                  {formatMoney(authDealValue(d), { compact: true })}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {salesCap.isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            {owners.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Direct opportunities yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 font-medium">Sales Owner</th>
                    <th className="py-2 font-medium text-right">Open</th>
                    <th className="py-2 font-medium text-right">Pipeline</th>
                    <th className="py-2 font-medium text-right">Weighted</th>
                    <th className="py-2 font-medium text-right">Won</th>
                    <th className="py-2 font-medium text-right">Lost</th>
                  </tr>
                </thead>
                <tbody>
                  {owners.map((o) => (
                    <tr key={o.ownerId ?? "unassigned"} className="border-b last:border-0">
                      <td className="py-2 text-foreground">
                        {ownerName(o.ownerId)}
                        {o.ownerId === user?.id && (
                          <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                        )}
                      </td>
                      <td className="py-2 text-right">{o.open}</td>
                      <td className="py-2 text-right">{formatMoney(o.pipeline, { compact: true })}</td>
                      <td className="py-2 text-right">{formatMoney(o.weighted, { compact: true })}</td>
                      <td className="py-2 text-right">{o.won}</td>
                      <td className="py-2 text-right">{o.lost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Kanban;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
