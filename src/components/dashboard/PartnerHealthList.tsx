import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { healthBand } from "@/lib/partner-health-config";
import { partnerHealthRows } from "@/lib/dashboard-metrics";

export function PartnerHealthList({
  rows,
  loading,
  error,
  retry,
}: {
  rows: ReturnType<typeof partnerHealthRows>;
  loading: boolean;
  error: boolean;
  retry: () => void;
}) {
  return (
    <section className="bg-card rounded-xl border shadow-sm p-5 space-y-3">
      <h2 className="font-semibold">Partner Health Monitor</h2>
      <p className="text-xs text-muted-foreground">
        Active partners · relationship, momentum and engagement
      </p>
      {error ? (
        <p role="alert">
          Health unavailable.{" "}
          <button className="text-primary underline" onClick={retry}>
            Retry
          </button>
        </p>
      ) : loading ? (
        <p aria-busy="true">Loading health…</p>
      ) : rows.length === 0 ? (
        <p>No active partners in this scope.</p>
      ) : (
        rows.slice(0, 5).map(({ partner, metric }) => (
          <Link
            key={partner.id}
            to={`/partners/${partner.id}`}
            className="block border-t pt-3"
          >
            <div className="flex justify-between gap-2">
              <span className="font-medium">{partner.company_name}</span>
              <Badge
                variant={
                  !metric
                    ? "secondary"
                    : healthBand(metric.health_score) === "at_risk"
                      ? "destructive"
                      : healthBand(metric.health_score) === "healthy"
                        ? "success"
                        : "warning"
                }
              >
                {metric
                  ? `${metric.health_score} · ${healthBand(metric.health_score) === "at_risk" ? "At risk" : healthBand(metric.health_score) === "healthy" ? "Healthy" : "Moderate"}`
                  : "Not assessed"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metric?.negative_factors?.slice(0, 2).join(" · ") ||
                "Open partner details to review next actions."}
            </p>
          </Link>
        ))
      )}
    </section>
  );
}
