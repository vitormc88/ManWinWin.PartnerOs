import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  useAnswerQuestion,
  useAttemptState,
  useSubmitAttempt,
} from "@/hooks/useAcademyCertification";
import {
  categoryLabel,
  certClassificationBuckets,
  formatCountdown,
  isAnswerComplete,
  type CertExamQuestion,
} from "@/lib/academy-certification";


/** One-question-at-a-time, server-timed certification runner. */
export default function AcademyCertificationExam() {
  const { slug, attemptId } = useParams();
  const navigate = useNavigate();
  const state = useAttemptState(attemptId);
  const answer = useAnswerQuestion(attemptId);
  const submit = useSubmitAttempt();

  const [draft, setDraft] = useState<unknown>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const autoSubmitted = useRef(false);

  const data = state.data;

  // Timer is seeded from the server every refetch; the browser only ticks it down.
  useEffect(() => {
    if (data?.seconds_remaining == null) return;
    setRemaining(data.seconds_remaining);
  }, [data?.seconds_remaining]);

  useEffect(() => {
    if (remaining == null) return;
    const t = window.setInterval(() => setRemaining((r) => (r == null ? r : Math.max(0, r - 1))), 1000);
    return () => window.clearInterval(t);
  }, [remaining == null]);

  const current: CertExamQuestion | undefined = useMemo(
    () => data?.questions?.find((q) => !q.answered),
    [data]
  );

  useEffect(() => setDraft(null), [current?.question_id]);

  // Auto-submit when the server-derived time runs out.
  useEffect(() => {
    if (!attemptId || autoSubmitted.current) return;
    if (data?.status !== "in_progress") return;
    if (remaining !== 0) return;
    autoSubmitted.current = true;
    submit.mutate(attemptId, {
      onSettled: () => navigate(`/academy/modules/${slug}/certification/result/${attemptId}`),
    });
  }, [remaining, data?.status, attemptId, slug, navigate, submit]);

  if (state.isError)
    return <AcademyState kind="error" error={state.error} onRetry={() => state.refetch()} />;
  if (state.isLoading || !data) return <AcademyState kind="loading" title="Loading your attempt…" />;

  if (data.status !== "in_progress") {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <AcademyState
          kind="empty"
          title="This attempt is closed"
          description="Open the result page to see your score."
        />
        <Button
          className="mt-4 w-full"
          onClick={() => navigate(`/academy/modules/${slug}/certification/result/${attemptId}`)}
        >
          View result
        </Button>
      </div>
    );
  }

  const answered = data.answered_count;
  const total = data.total_questions;
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  const low = (remaining ?? 0) <= 120;

  const confirmAnswer = () => {
    if (!current) return;
    answer.mutate(
      { questionId: current.question_id, answer: draft },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          if (answered + 1 >= total) setConfirmSubmit(true);
        },
      }
    );
  };

  const doSubmit = () => {
    if (!attemptId) return;
    submit.mutate(attemptId, {
      onSettled: () => navigate(`/academy/modules/${slug}/certification/result/${attemptId}`),
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="bg-card rounded-xl border shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Qualification Module Certification · Attempt {data.attempt_number}
            </p>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              Question {Math.min(answered + 1, total)} of {total}
            </p>
          </div>
          <Badge
            variant={low ? "destructive" : "outline"}
            className="text-sm tabular-nums px-3 py-1"
          >
            <Clock className="h-3.5 w-3.5 mr-1" />
            {formatCountdown(remaining ?? 0)}
          </Badge>
        </div>
        <Progress value={pct} className="h-2" />
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Confirmed answers are final — you cannot return to a previous question.
        </p>
      </div>

      {current ? (
        <div className="bg-card rounded-xl border shadow-sm p-5 space-y-4">
          <Badge variant="outline" className="text-[11px]">
            {categoryLabel(current.category)}
          </Badge>

          {current.scenario_text && (
            <div className="rounded-lg bg-secondary/40 border p-3 text-sm text-foreground whitespace-pre-wrap">
              {current.scenario_text}
            </div>
          )}

          <p className="text-base font-medium text-foreground whitespace-pre-wrap">
            {current.question_text}
          </p>

          <QuestionInput question={current} value={draft} onChange={setDraft} />

          <Button
            className="w-full"
            disabled={!isAnswerComplete(current, draft) || answer.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {answer.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm answer
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border shadow-sm p-5 space-y-3 text-center">
          <p className="text-sm text-foreground">All questions answered.</p>
          <Button className="w-full" onClick={() => setConfirmSubmit(true)}>
            Submit certification
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm this answer?</AlertDialogTitle>
            <AlertDialogDescription>
              Once confirmed, this answer is final and you move on to the next question.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAnswer}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit your certification?</AlertDialogTitle>
            <AlertDialogDescription>
              Your attempt will be scored immediately. Unanswered questions count as incorrect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={doSubmit}>Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: CertExamQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const type = question.question_type;

  if (type === "multiple_select" || type === "scenario_multiple_select" || type === "record_review") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Select all that apply.</p>
        {question.options.map((o) => (
          <label key={o} className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer">
            <Checkbox
              checked={selected.includes(o)}
              onCheckedChange={(c) =>
                onChange(c ? [...selected, o] : selected.filter((x) => x !== o))
              }
            />
            <span className="text-sm text-foreground">{o}</span>
          </label>
        ))}
      </div>
    );
  }

  if (type === "ordering") {
    const order = Array.isArray(value) ? (value as string[]) : [];
    const remaining = question.options.filter((o) => !order.includes(o));
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Click the items in the correct order.</p>
        <ol className="space-y-1">
          {order.map((o, i) => (
            <li key={o} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
              <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
              {o}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {remaining.map((o) => (
            <Button key={o} type="button" variant="outline" size="sm" onClick={() => onChange([...order, o])}>
              {o}
            </Button>
          ))}
        </div>
        {order.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
            Reset order
          </Button>
        )}
      </div>
    );
  }

  if (type === "classification") {
    const map = (value ?? {}) as Record<string, string>;
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Classify every item.</p>
        {question.options.map((o) => (
          <div key={o} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm text-foreground">{o}</span>
            <Select value={map[o] ?? ""} onValueChange={(v) => onChange({ ...map, [o]: v })}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICATION_BUCKETS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    );
  }

  return (
    <RadioGroup value={(value as string) ?? ""} onValueChange={onChange} className="space-y-2">
      {question.options.map((o) => (
        <Label key={o} className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer font-normal">
          <RadioGroupItem value={o} />
          <span className="text-sm text-foreground">{o}</span>
        </Label>
      ))}
    </RadioGroup>
  );
}
