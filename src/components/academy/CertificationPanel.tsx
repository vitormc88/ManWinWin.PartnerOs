import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award, Clock, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AcademyState } from "@/components/academy/AcademyState";
import { useCertEligibility, useStartCertification } from "@/hooks/useAcademyCertification";
import {
  certButtonEnabled,
  certButtonLabel,
  certDurationLabel,
  certSettings,
  formatAttemptDateTime,
  isRawScoring,
  requiredCorrectAnswers,
} from "@/lib/academy-certification";


/**
 * Qualification Module Certification launcher, rendered inside the existing
 * "Module Certification" Academy item. Every state comes from the server.
 */
export function CertificationPanel({
  moduleId,
  moduleSlug,
}: {
  moduleId: string;
  moduleSlug: string;
}) {
  const navigate = useNavigate();
  const eligibility = useCertEligibility(moduleId);
  const start = useStartCertification();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const e = eligibility.data;

  if (eligibility.isError)
    return (
      <AcademyState
        kind="error"
        title="Could not load certification status"
        error={eligibility.error}
        onRetry={() => eligibility.refetch()}
      />
    );
  if (eligibility.isLoading || !e)
    return <AcademyState kind="loading" title="Checking certification eligibility…" />;

  const cfg = certSettings(e.settings);


  const onClick = () => {
    if (e.state === "passed") {
      navigate(
        `/academy/modules/${moduleSlug}/certification/result/${e.certification?.attempt_id ?? e.last_attempt_id}`
      );
      return;
    }
    if (e.state === "resume" && e.active_attempt_id) {
      navigate(`/academy/modules/${moduleSlug}/certification/attempt/${e.active_attempt_id}`);
      return;
    }
    setConfirmOpen(true);
  };

  const beginAttempt = () => {
    start.mutate(moduleId, {
      onSuccess: (attemptId) =>
        navigate(`/academy/modules/${moduleSlug}/certification/attempt/${attemptId}`),
    });
  };

  return (
    <div className="bg-card rounded-xl border shadow-sm p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Award className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Module Certification</h2>
          <p className="text-sm text-muted-foreground">
            {cfg.question_count} questions · {certDurationLabel(cfg)} · pass at {cfg.pass_score}%
            {isRawScoring(cfg)
              ? ` (${requiredCorrectAnswers(cfg)} of ${cfg.question_count} correct answers).`
              : cfg.scenario_pass_score !== null
                ? ` weighted and ${cfg.scenario_pass_score}% Scenario Analysis.`
                : ` weighted.`}
          </p>

        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[11px]">
          Learning items {e.required_done}/{e.required_total}
        </Badge>
        {e.attempts_used > 0 && (
          <Badge variant="outline" className="text-[11px]">
            Attempts used: {e.attempts_used}
          </Badge>
        )}
        {e.state === "passed" && e.certification && (
          <Badge variant="outline" className="text-[11px]">
            <ShieldCheck className="h-3 w-3 mr-1" />
            {e.certification.certificate_reference}
          </Badge>
        )}
        {e.state === "waiting" && (
          <Badge variant="outline" className="text-[11px]">
            <Clock className="h-3 w-3 mr-1" />
            Next attempt {formatAttemptDateTime(e.next_attempt_at)}
          </Badge>
        )}
      </div>

      {e.state === "locked" && e.missing_items.length > 0 && (
        <div className="rounded-lg border border-dashed p-3 space-y-1">
          <p className="text-xs font-medium text-foreground flex items-center gap-1">
            <Lock className="h-3.5 w-3.5" /> Still to complete
          </p>
          <ul className="text-xs text-muted-foreground list-disc pl-5">
            {e.missing_items.map((m) => (
              <li key={m.id}>{m.title}</li>
            ))}
          </ul>
        </div>
      )}

      <Button
        size="lg"
        className="w-full"
        disabled={!certButtonEnabled(e) || start.isPending}
        onClick={onClick}
      >
        {certButtonLabel(e)}
      </Button>

      {e.state !== "passed" && e.last_attempt_id && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() =>
            navigate(`/academy/modules/${moduleSlug}/certification/result/${e.last_attempt_id}`)
          }
        >
          View last result
        </Button>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-destructive" />
              Before you start
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  You have {cfg.time_limit_minutes} minutes to answer {cfg.question_count}{" "}
                  questions. The timer runs on the server and keeps counting if you close the page.
                </p>

                <p>
                  Questions are shown one at a time. Once you confirm an answer you{" "}
                  <strong>cannot go back</strong> to that question or change it.
                </p>
                <p>The attempt is submitted automatically when the time runs out.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={beginAttempt}>I understand — start</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
