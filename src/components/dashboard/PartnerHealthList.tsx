import { partners } from "@/data/mock-data";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

const healthVariant = {
  Excellent: "success" as const,
  Good: "info" as const,
  "At Risk": "warning" as const,
  Critical: "destructive" as const,
};

export function PartnerHealthList() {
  const sorted = [...partners].sort((a, b) => a.engagementScore - b.engagementScore).slice(0, 5);

  return (
    <div className="bg-card rounded-xl border shadow-sm animate-reveal-up stagger-3">
      <div className="p-5 border-b">
        <h3 className="font-semibold text-foreground">Partner Health Monitor</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Lowest engagement scores</p>
      </div>
      <div className="divide-y">
        {sorted.map((p) => (
          <Link
            key={p.id}
            to={`/partners/${p.id}`}
            className="flex items-center justify-between px-5 py-3 hover:bg-secondary/50 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{p.company}</p>
              <p className="text-xs text-muted-foreground">{p.country} · {p.level}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-semibold tabular-nums text-foreground">{p.engagementScore}</span>
              <Badge variant={healthVariant[p.healthScore]}>{p.healthScore}</Badge>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
