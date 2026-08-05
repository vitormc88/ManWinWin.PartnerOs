import { Link, useNavigate, useParams } from "react-router-dom";
import { Award, ArrowLeft, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AcademyState } from "@/components/academy/AcademyState";
import { AcademyBreadcrumbs } from "@/components/academy/AcademyBreadcrumbs";
import { useAttemptResult } from "@/hooks/useAcademyCertification";
import { useAcademyModules } from "@/hooks/useAcademy";
import {
  CERT_PASS_SCORE,
  CERT_SCENARIO_PASS_SCORE,
  categoryLabel,
  formatAttemptDateTime,
  weakCategories,
} from "@/lib/academy-certification";

/** Passed / not-passed result for one certification attempt. */
export default function AcademyCertificationResult() {
  const { slug, attemptId } = useParams();
  const navigate = useNavigate();
  const result = useAttemptResult(attemptId);
  const { data: modules = [] } = useAcademyModules();

  if (result.isError)
    return <AcademyState kind="error" error={result.error} onRetry={() => result.refetch()} />;
  if (result.isLoading || !result.data)
    return <AcademyState kind="loading" title="Loading your result…" />;

  const r = result.data;
  const passed = r.passed;
  const current = modules.find((m) => m.id === r.module_id);
  const nextModule = current
    ? modules
        .filter((m) => m.status === "published" && m.sort_order > current.sort_order)
        .sort((a, b) => a.sort_order - b.sort_order)[0]
    : undefined;
  const weak = weakCategories(r.category_scores);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <AcademyBreadcrumbs
        items={[
          { label: "Partner Academy", to: "/onboarding" },
          ...(current ? [{ label: current.title }] : []),
          { label: "Certification result" },
        ]}
      />

      <div className="bg-card rounded-xl border shadow-sm p-5 space-y-4">
        <div className="flex items-start gap-3">
          {passed ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
          ) : (
            <XCircle className="h-6 w-6 text-destructive shrink-0" />
          )}
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Certification status: {passed ? "Passed" : "Not Passed"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Qualification Module Certification · Attempt {r.attempt_number}
              {r.submitted_at ? ` · ${formatAttemptDateTime(r.submitted_at)}` : ""}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <ScoreTile label="Weighted score" value={`${r.weighted_score}%`} hint={`Required ${CERT_PASS_SCORE}%`} />
          <ScoreTile
            label="Scenario Analysis"
            value={`${r.scenario_score}%`}
            hint={`Required ${CERT_SCENARIO_PASS_SCORE}%`}
          />
          <ScoreTile label="Correct answers" value={`${r.raw_score} / ${r.total_questions}`} hint="Raw count" />
        </div>

        {passed && r.certification && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <Award className="h-4 w-4 text-emerald-500" /> Digital completion record
            </p>
            <p className="text-xs text-muted-foreground">
              Reference {r.certification.certificate_reference} · issued{" "}
              {formatAttemptDateTime(r.certification.issued_at)}
            </p>
          </div>
        )}

        {!passed && r.next_attempt_at && (
          <div className="rounded-lg border border-dashed p-3">
            <p className="text-sm text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" /> Next eligible attempt:{" "}
              <strong>{formatAttemptDateTime(r.next_attempt_at)}</strong>
            </p>
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border shadow-sm p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Performance by category</h2>
        {Object.entries(r.category_scores ?? {}).map(([key, v]) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground">{categoryLabel(key)}</span>
              <span className="tabular-nums font-medium">{v.pct}%</span>
            </div>
            <Progress value={v.pct} className="h-1.5" />
          </div>
        ))}
      </div>

      {!passed && (
        <div className="bg-card rounded-xl border shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Weak areas to review</h2>
          {weak.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {weak.map((w) => (
                <Badge key={w.category} variant="outline" className="text-[11px]">
                  {categoryLabel(w.category)} · {w.pct}%
                </Badge>
              ))}
            </div>
          )}
          {r.weak_areas.length > 0 ? (
            <ul className="space-y-1">
              {r.weak_areas.map((m) => (
                <li key={m.mission_id}>
                  <Link
                    to={`/onboarding/modules/${current?.slug}/missions/${m.slug}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {m.title}
                  </Link>
                  <span className="text-xs text-muted-foreground"> · {m.missed} missed</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No single mission stands out — review the Module Summary before retaking.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => navigate(`/onboarding/modules/${slug}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          {passed ? "Review Module" : "Return to Module"}
        </Button>
        {!passed && r.weak_areas[0] && (
          <Button asChild>
            <Link to={`/onboarding/modules/${current?.slug}/missions/${r.weak_areas[0].slug}`}>
              Review Weak Areas
            </Link>
          </Button>
        )}
        {passed && nextModule && (
          <Button asChild>
            <Link to={`/onboarding/modules/${nextModule.slug}`}>Continue to Next Module</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function ScoreTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
