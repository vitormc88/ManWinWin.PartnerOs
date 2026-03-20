import { partners, PartnerStatus, HealthScore } from "@/data/mock-data";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Search, Filter } from "lucide-react";
import { useState } from "react";

const statusVariant: Record<PartnerStatus, "success" | "ghost" | "warning" | "destructive"> = {
  Active: "success",
  Inactive: "ghost",
  Ghosting: "destructive",
  Negotiation: "warning",
};

const healthVariant: Record<HealthScore, "success" | "info" | "warning" | "destructive"> = {
  Excellent: "success",
  Good: "info",
  "At Risk": "warning",
  Critical: "destructive",
};

export default function Partners() {
  const [search, setSearch] = useState("");

  const filtered = partners.filter(
    (p) =>
      p.company.toLowerCase().includes(search.toLowerCase()) ||
      p.country.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Partner CRM</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {partners.length} partners · {partners.filter((p) => p.status === "Active").length} active
          </p>
        </div>
        <button className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors active:scale-[0.97]">
          + Add Partner
        </button>
      </div>

      <div className="flex items-center gap-3 animate-reveal-up stagger-1">
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 flex-1 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search by company or country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground"
          />
        </div>
        <button className="h-9 px-3 rounded-lg border bg-card text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors flex items-center gap-2">
          <Filter className="h-3.5 w-3.5" />
          Filters
        </button>
      </div>

      <div className="bg-card rounded-xl border shadow-sm overflow-hidden animate-reveal-up stagger-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Country</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Level</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Pipeline</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Health</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Manager</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3">
                    <Link to={`/partners/${p.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                      {p.company}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{p.country}</td>
                  <td className="px-5 py-3">
                    <Badge variant="outline" className="text-xs font-normal">
                      {p.level}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={statusVariant[p.status]}>{p.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-foreground">
                    €{p.revenue.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                    €{p.pipeline.toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor:
                            p.healthScore === "Excellent"
                              ? "hsl(var(--success))"
                              : p.healthScore === "Good"
                              ? "hsl(var(--info))"
                              : p.healthScore === "At Risk"
                              ? "hsl(var(--warning))"
                              : "hsl(var(--destructive))",
                        }}
                      />
                      <span className="text-xs">{p.engagementScore}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{p.manager}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
