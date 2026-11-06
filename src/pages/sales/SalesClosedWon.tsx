import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { useDirectDeals } from "./sales-data";
import { authDealValue } from "@/lib/analytics-corrections";

/** Sales → Closed Won: Direct opportunities closed as Won. */
export default function SalesClosedWon() {
  const { deals, isLoading, isError } = useDirectDeals();

  if (isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Loading Closed Won…</div>;
  if (isError)
    return (
      <div className="p-6 text-sm text-destructive">
        Closed Won unavailable — the opportunity data could not be loaded.
      </div>
    );

  const won = deals.filter((d) => d.status === "Won");
  const total = won.reduce((s, d) => s + authDealValue(d), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Closed Won</h1>
        <p className="text-sm text-muted-foreground">
          Direct Sales opportunities that have been won.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-primary" />
            {won.length === 0
              ? "No won opportunities yet"
              : `${won.length} won · ${formatMoney(total, { compact: true })}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {won.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Direct closing is not enabled yet — opportunities can't be marked as Won from the
              Direct pipeline in this iteration. Once Direct closing is enabled, won deals will
              appear here. Continue working in the{" "}
              <Link to="/sales/pipeline" className="text-primary underline">
                Pipeline
              </Link>
              .
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 font-medium">Opportunity</th>
                  <th className="py-2 font-medium text-right">Value</th>
                  <th className="py-2 font-medium text-right">Closed</th>
                </tr>
              </thead>
              <tbody>
                {won.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="py-2">
                      <Link to={`/sales/deals/${d.id}`} className="text-primary underline">
                        {d.company_name}
                      </Link>
                    </td>
                    <td className="py-2 text-right">{formatMoney(authDealValue(d))}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {d.status_changed_at
                        ? new Date(d.status_changed_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
