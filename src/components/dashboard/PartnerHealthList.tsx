import { usePartners } from "@/hooks/usePartners";
import { usePartnerMetrics } from "@/hooks/usePartnerMetrics";
import { COUNTRY_NAME_BY_CODE } from "@/data/iso-countries";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

export function PartnerHealthList() {
  const { data: partners = [], isLoading } = usePartners();
  const { data: metrics = {} } = usePartnerMetrics();

  const withScores = partners.map(p => ({ p, score: metrics[p.id]?.health_score ?? 0 }));
  const sorted = [...withScores].sort((a, b) => a.score - b.score).slice(0, 5);

  const getVariant = (score: number) => {
    if (score >= 80) return "success" as const;
    if (score >= 60) return "info" as const;
    if (score >= 40) return "warning" as const;
    return "destructive" as const;
  };

  const getLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "At Risk";
    return "Critical";
  };

  return (
    <div className="bg-card rounded-xl border shadow-sm animate-reveal-up stagger-3">
      <div className="p-5 border-b">
        <h3 className="font-semibold text-foreground">Partner Health Monitor</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Lowest engagement scores</p>
      </div>
      <div className="divide-y">
        {isLoading ? (
          <div className="p-5 text-center text-sm text-muted-foreground">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="p-5 text-center text-sm text-muted-foreground">No partners found</div>
        ) : sorted.map(({ p, score }) => (
          <Link
            key={p.id}
            to={`/partners/${p.id}`}
            className="flex items-center justify-between px-5 py-3 hover:bg-secondary/50 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{p.company_name}</p>
              <p className="text-xs text-muted-foreground">{(p.country ? COUNTRY_NAME_BY_CODE[p.country] ?? p.country : "")} · {p.partnership_level}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-semibold tabular-nums text-foreground">{score}</span>
              <Badge variant={getVariant(score)}>{getLabel(score)}</Badge>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
