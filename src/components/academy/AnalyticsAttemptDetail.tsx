import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Download, Lock, XCircle } from "lucide-react";
import { useAcademyAttemptDetail } from "@/hooks/useAcademyAnalytics";
import {
  answerToText,
  downloadCsv,
  formatDateTime,
  formatPct,
  toCsv,
} from "@/lib/academy-analytics";

interface Props {
  attemptId: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Certification attempt detail. Correct answers and explanations are only
 * present in the payload when the server grants academy_correct_answers_view.
 */
export function AnalyticsAttemptDetail({ attemptId, onOpenChange }: Props) {
  const { data, isLoading, isError, error } = useAcademyAttemptDetail(attemptId ?? undefined);

  const exportCsv = () => {
    if (!data) return;
    const rows = data.questions.map((q) => ({
      position: q.position,
      question_code: q.question_code ?? "",
      question_text: q.question_text,
      category: q.category,
      question_type: q.question_type,
      difficulty: q.difficulty,
      weight: q.weight,
      selected_answer: answerToText(q.selected_answer),
      is_correct: q.is_correct ? "yes" : "no",
      awarded_score: q.awarded_score,
      response_seconds: q.response_seconds ?? "",
      correct_answer: data.reveals_correct_answers ? answerToText(q.correct_answer) : "",
    }));
    downloadCsv(`academy-attempt-${data.attempt_number}-${data.attempt_id.slice(0, 8)}`, toCsv(rows));
  };

  return (
    <Dialog open={!!attemptId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Certification attempt detail</DialogTitle>
        </DialogHeader>

        {isLoading && <Skeleton className="h-64 w-full" />}

        {isError && (
          <p className="text-sm text-destructive">
            {(error as Error)?.message ?? "Unable to load this attempt."}
          </p>
        )}

        {data && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {data.learner_name ?? "Learner"} — {data.module_title ?? "Module"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Attempt #{data.attempt_number} · Submitted {formatDateTime(data.submitted_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={data.passed ? "default" : "destructive"}>
                  {data.passed ? "Passed" : "Not passed"}
                </Badge>
                <Badge variant="secondary">Total {formatPct(data.weighted_score)}</Badge>
                <Badge variant="secondary">Scenario {formatPct(data.scenario_score)}</Badge>
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  <Download className="mr-2 h-4 w-4" /> CSV
                </Button>
              </div>
            </div>

            {!data.reveals_correct_answers && (
              <p className="flex items-center gap-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                Correct answers and explanations are hidden — you do not have the
                “See correct answers” permission.
              </p>
            )}

            <ScrollArea className="h-[52vh] pr-3">
              <ol className="space-y-3">
                {data.questions.map((q) => (
                  <li key={q.question_id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {q.position}. {q.question_code ?? ""} · {q.category} · {q.difficulty} · weight {q.weight}
                          {q.mission_title ? ` · ${q.mission_title}` : ""}
                        </p>
                        {q.scenario_text && (
                          <p className="text-xs italic text-muted-foreground">{q.scenario_text}</p>
                        )}
                        <p className="text-sm font-medium text-foreground">{q.question_text}</p>
                      </div>
                      {q.is_correct ? (
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <XCircle className="mt-1 h-4 w-4 shrink-0 text-destructive" />
                      )}
                    </div>

                    <div className="mt-2 space-y-1 text-sm">
                      <p>
                        <span className="text-muted-foreground">Answered: </span>
                        {answerToText(q.selected_answer)}
                        {q.response_seconds !== null && (
                          <span className="text-muted-foreground"> · {q.response_seconds}s</span>
                        )}
                      </p>
                      {data.reveals_correct_answers && (
                        <>
                          <p>
                            <span className="text-muted-foreground">Correct: </span>
                            {answerToText(q.correct_answer)}
                          </p>
                          {q.explanation && (
                            <p className="text-xs text-muted-foreground">{q.explanation}</p>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
