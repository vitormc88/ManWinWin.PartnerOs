import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, Search, ShieldCheck, ShieldX, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useMyCertificates, useManagedCertificates } from "@/hooks/useAcademyCertificates";
import {
  certificateStatusLabel,
  formatCertificateDate,
  isCertificateValid,
  moduleVersionLabel,
  partnerLabel,
  type AcademyCertificate,
} from "@/lib/academy-certificates";

/** Legacy, manually-recorded partner certifications (separate source of truth). */
function useLegacyPartnerCertifications() {
  return useQuery({
    queryKey: ["partner_certifications", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_certifications")
        .select("*")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function Certifications() {
  const { profile, isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const mine = useMyCertificates();
  const managed = useManagedCertificates();
  const legacy = useLegacyPartnerCertifications();

  const myCerts = mine.data ?? [];
  const allCerts: AcademyCertificate[] = managed.data ?? [];
  const canSeeOthers = isAdmin || profile?.is_hq === true || allCerts.length > 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allCerts;
    return allCerts.filter(
      (c) =>
        c.learner_name.toLowerCase().includes(q) ||
        (c.partner_name ?? "").toLowerCase().includes(q) ||
        c.module_title.toLowerCase().includes(q) ||
        c.certificate_reference.toLowerCase().includes(q)
    );
  }, [allCerts, search]);

  const validCount = allCerts.filter((c) => isCertificateValid(c.status)).length;
  const revokedCount = allCerts.length - validCount;
  const learners = new Set(allCerts.map((c) => c.user_id)).size;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="animate-reveal-up">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Certifications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Partner Academy certificates, issued automatically when a learner passes a module certification.
        </p>
      </div>

      {/* My certificates */}
      <section className="space-y-3 animate-reveal-up stagger-1">
        <h2 className="text-sm font-semibold text-foreground">My certificates</h2>
        {mine.isLoading ? (
          <div className="bg-card rounded-xl border shadow-sm p-6 text-sm text-muted-foreground">Loading…</div>
        ) : myCerts.length === 0 ? (
          <div className="bg-card rounded-xl border shadow-sm p-6 text-sm text-muted-foreground">
            You have no Academy certificates yet. Complete a module certification in the{" "}
            <Link to="/academy" className="text-primary hover:underline">Partner Academy</Link>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myCerts.map((c) => (
              <Link
                key={c.id}
                to={`/certifications/${encodeURIComponent(c.certificate_reference)}`}
                className="bg-card rounded-xl border shadow-sm p-5 hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Award className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{c.module_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.certificate_reference} · {moduleVersionLabel(c.module_version)} · issued{" "}
                      {formatCertificateDate(c.issued_at)}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Badge variant={isCertificateValid(c.status) ? "success" : "destructive"}>
                        {certificateStatusLabel(c.status)}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">Weighted {c.score}%</Badge>
                      <Badge variant="outline" className="text-[11px]">Scenario {c.scenario_score}%</Badge>
                      <Badge variant="outline" className="text-[11px]">{partnerLabel(c)}</Badge>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {canSeeOthers && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-reveal-up stagger-2">
            {[
              { label: "Academy certificates", value: allCerts.length, icon: Award, color: "text-foreground" },
              { label: "Valid", value: validCount, icon: ShieldCheck, color: "text-emerald-600" },
              { label: "Certified learners", value: learners, icon: Users, color: "text-foreground" },
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

          <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 max-w-sm animate-reveal-up stagger-3">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search by learner, partner, module or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground"
            />
          </div>

          <div className="bg-card rounded-xl border shadow-sm overflow-hidden animate-reveal-up stagger-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50">
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Learner</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Partner</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Module</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Reference</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Weighted</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Scenario</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Issued</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                        No Academy certificates yet.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => (
                      <tr key={c.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-5 py-3 font-medium text-foreground">
                          {c.learner_name}
                          {c.learner_email && (
                            <p className="text-xs text-muted-foreground">{c.learner_email}</p>
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{partnerLabel(c)}</td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {c.module_title} · {moduleVersionLabel(c.module_version)}
                        </td>
                        <td className="px-5 py-3">
                          <Link
                            to={`/verify/${encodeURIComponent(c.certificate_reference)}`}
                            className="text-primary hover:underline"
                          >
                            {c.certificate_reference}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">{c.score}%</td>
                        <td className="px-5 py-3 text-right tabular-nums">{c.scenario_score}%</td>
                        <td className="px-5 py-3 text-muted-foreground">{formatCertificateDate(c.issued_at)}</td>
                        <td className="px-5 py-3">
                          <Badge variant={isCertificateValid(c.status) ? "success" : "destructive"}>
                            {certificateStatusLabel(c.status)}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {revokedCount > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldX className="h-3.5 w-3.5" /> {revokedCount} certificate(s) are no longer valid.
            </p>
          )}
        </>
      )}

      {/* Legacy, manually recorded certifications — separate source */}
      {(legacy.data?.length ?? 0) > 0 && (
        <section className="space-y-3 animate-reveal-up stagger-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> Legacy partner certifications
            </h2>
            <p className="text-xs text-muted-foreground">
              Manually recorded before the Partner Academy. Not issued or verified by the Academy.
            </p>
          </div>
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Certification</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Issued</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(legacy.data ?? []).map((c: Record<string, unknown>) => (
                  <tr key={String(c.id)} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 text-foreground">{String(c.user_name ?? "—")}</td>
                    <td className="px-5 py-3 text-muted-foreground">{String(c.certification_name ?? "—")}</td>
                    <td className="px-5 py-3 text-muted-foreground">{String(c.certification_type ?? "—")}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatCertificateDate(c.issue_date as string | null)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatCertificateDate(c.expiry_date as string | null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
