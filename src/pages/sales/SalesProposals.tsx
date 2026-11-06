import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { useDirectDeals, useDirectProposals } from "./sales-data";

const statusVariant = (status: string): "default" | "secondary" | "outline" | "destructive" => {
  if (status === "Accepted" || status === "Won") return "default";
  if (status === "Lost") return "destructive";
  if (status === "Sent") return "secondary";
  return "outline";
};

/** Sales → Proposals: every proposal linked to a Direct opportunity. */
export default function SalesProposals() {
  const { deals, isLoading, isError } = useDirectDeals();
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const proposalsQ = useDirectProposals(deals.map((d) => d.id), !isLoading && !isError);

  if (isLoading || proposalsQ.isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Loading proposals…</div>;
  if (isError || proposalsQ.isError)
    return (
      <div className="p-6 text-sm text-destructive">
        Proposals unavailable — the data could not be loaded.
      </div>
    );

  const proposals = proposalsQ.data ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Sales Proposals</h1>
        <p className="text-sm text-muted-foreground">
          Commercial proposals linked to Direct Sales opportunities.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" /> {proposals.length} proposal
            {proposals.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {proposals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No proposals yet. Open an opportunity in the{" "}
              <Link to="/sales/pipeline" className="text-primary underline">
                Pipeline
              </Link>{" "}
              and create a proposal from its detail page.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 font-medium">Reference</th>
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 font-medium">Opportunity</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Year 1</th>
                  <th className="py-2 font-medium text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => {
                  const deal = p.deal_id ? dealById.get(p.deal_id) : undefined;
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 font-medium text-foreground">
                        {p.commercial_reference}
                      </td>
                      <td className="py-2">{p.client_name}</td>
                      <td className="py-2">
                        {deal ? (
                          <Link
                            to={`/sales/deals/${deal.id}`}
                            className="text-primary underline"
                          >
                            {deal.company_name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2">
                        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                      </td>
                      <td className="py-2 text-right">
                        {p.total_year_1 != null ? formatMoney(p.total_year_1) : "—"}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
