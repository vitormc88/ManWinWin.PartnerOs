import { mockCertifications, certLevelNames } from "@/data/partner-engagement-data";
import { Badge } from "@/components/ui/badge";
import { Award, Clock, AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { useState } from "react";

const statusVariant = {
  Completed: "success" as const,
  "In Progress": "warning" as const,
  Expired: "destructive" as const,
};

const levelBadgeClass: Record<number, string> = {
  1: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  2: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  3: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

export default function Certifications() {
  const [search, setSearch] = useState("");

  const filtered = mockCertifications.filter(
    (c) =>
      c.partnerName.toLowerCase().includes(search.toLowerCase()) ||
      c.userName.toLowerCase().includes(search.toLowerCase())
  );

  const completed = mockCertifications.filter((c) => c.status === "Completed").length;
  const inProgress = mockCertifications.filter((c) => c.status === "In Progress").length;
  const expired = mockCertifications.filter((c) => c.status === "Expired").length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="animate-reveal-up">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Certifications</h1>
        <p className="text-sm text-muted-foreground mt-1">Partner capability tracking and validation</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 animate-reveal-up stagger-1">
        {[
          { label: "Total Certifications", value: mockCertifications.length, icon: Award, color: "text-foreground" },
          { label: "Completed", value: completed, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "In Progress", value: inProgress, icon: Clock, color: "text-amber-600" },
          { label: "Expired", value: expired, icon: AlertTriangle, color: "text-destructive" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-card rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            </div>
            <div>
              <p className={`text-xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Certification Levels Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-reveal-up stagger-2">
        {[1, 2, 3].map((level) => {
          const certs = mockCertifications.filter((c) => c.level === level);
          const completedInLevel = certs.filter((c) => c.status === "Completed").length;
          return (
            <div key={level} className="bg-card rounded-xl border shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-flex items-center justify-center h-8 w-8 rounded-lg text-sm font-bold ${levelBadgeClass[level]} border-0`}>
                  L{level}
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{certLevelNames[level]}</p>
                  <p className="text-xs text-muted-foreground">{completedInLevel} of {certs.length} completed</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {level === 1 && <p className="text-xs text-muted-foreground">Can pitch, qualify leads, run basic demos</p>}
                {level === 2 && <p className="text-xs text-muted-foreground">Can configure system, support implementation</p>}
                {level === 3 && <p className="text-xs text-muted-foreground">Full autonomy, complex implementations, co-selling</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 max-w-sm animate-reveal-up stagger-3">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Search by partner or user..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground"
        />
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden animate-reveal-up stagger-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Partner</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Level</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Certification</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Score</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Awarded</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((cert) => (
                <tr key={cert.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3 font-medium text-foreground">{cert.partnerName}</td>
                  <td className="px-5 py-3">
                    <p className="text-foreground">{cert.userName}</p>
                    <p className="text-xs text-muted-foreground">{cert.userEmail}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${levelBadgeClass[cert.level]} border-0`}>
                      L{cert.level} — {cert.levelName}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{cert.certName}</td>
                  <td className="px-5 py-3">
                    <Badge variant={statusVariant[cert.status]}>{cert.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-foreground">
                    {cert.score != null ? `${cert.score}%` : "—"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{cert.awardedAt ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{cert.expiresAt ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
