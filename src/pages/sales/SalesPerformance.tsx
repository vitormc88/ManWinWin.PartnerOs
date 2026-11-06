import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { useSalesCapability, useDirectSalesOwners } from "@/hooks/useSalesCapability";
import { useAllProfilesMap } from "@/hooks/useAssignableUsers";
import { getOwnerDisplay } from "@/lib/owner-display";
import { useAuth } from "@/contexts/AuthContext";
import { useDirectDeals, perOwnerStats, dealProbability, isOpenDeal } from "./sales-data";

/**
 * Sales → Performance: per-seller view of the Direct pipeline.
 * Managers see the whole team; sellers see their own row.
 */
export default function SalesPerformance() {
  const { user } = useAuth();
  const salesCap = useSalesCapability();
  const { deals, isLoading, isError } = useDirectDeals();
  const { data: owners = [] } = useDirectSalesOwners(salesCap.isManager);
  const { data: profilesMap } = useAllProfilesMap();

  if (isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Loading Performance…</div>;
  if (isError)
    return (
      <div className="p-6 text-sm text-destructive">
        Performance unavailable — the opportunity data could not be loaded.
      </div>
    );

  const stats = perOwnerStats(deals);
  const visible = salesCap.isManager
    ? stats
    : stats.filter((s) => s.ownerId === user?.id);
  const ownerName = (id: string | null) => {
    if (!id) return "Unassigned";
    const known = owners.find((o) => o.id === id);
    return known?.full_name ?? getOwnerDisplay({ assigned_user_id: id }, profilesMap);
  };
  const winRate = (won: number, lost: number) =>
    won + lost === 0 ? "—" : `${Math.round((won / (won + lost)) * 100)}%`;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Sales Performance</h1>
        <p className="text-sm text-muted-foreground">
          {salesCap.isManager
            ? "How each seller's Direct pipeline is performing."
            : "Your Direct pipeline performance."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" /> Seller performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Direct opportunities assigned yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 font-medium">Sales Owner</th>
                  <th className="py-2 font-medium text-right">Open</th>
                  <th className="py-2 font-medium text-right">Pipeline</th>
                  <th className="py-2 font-medium text-right">Weighted</th>
                  <th className="py-2 font-medium text-right">Avg. Probability</th>
                  <th className="py-2 font-medium text-right">Won</th>
                  <th className="py-2 font-medium text-right">Lost</th>
                  <th className="py-2 font-medium text-right">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const openDeals = deals.filter(
                    (d) => (d.assigned_user_id ?? null) === s.ownerId && isOpenDeal(d),
                  );
                  const avgProb =
                    openDeals.length === 0
                      ? "—"
                      : `${Math.round(
                          openDeals.reduce((sum, d) => sum + dealProbability(d), 0) /
                            openDeals.length,
                        )}%`;
                  return (
                    <tr key={s.ownerId ?? "unassigned"} className="border-b last:border-0">
                      <td className="py-2 text-foreground">
                        {ownerName(s.ownerId)}
                        {s.ownerId === user?.id && (
                          <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                        )}
                      </td>
                      <td className="py-2 text-right">{s.open}</td>
                      <td className="py-2 text-right">
                        {formatMoney(s.pipeline, { compact: true })}
                      </td>
                      <td className="py-2 text-right">
                        {formatMoney(s.weighted, { compact: true })}
                      </td>
                      <td className="py-2 text-right">{avgProb}</td>
                      <td className="py-2 text-right">{s.won}</td>
                      <td className="py-2 text-right">{s.lost}</td>
                      <td className="py-2 text-right">{winRate(s.won, s.lost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Win rate is won ÷ (won + lost); with no closed outcomes it shows “—”. Direct closing is
        not enabled yet, so won/lost figures will populate once closing is available.
      </p>
    </div>
  );
}
