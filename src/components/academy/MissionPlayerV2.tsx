import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Headphones,
  Lightbulb,
  ListChecks,
  Play,
  Sparkles,
  Target,
  Wrench,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { MissionContent } from "@/components/academy/MissionContent";
import { MissionMedia } from "@/components/academy/MissionMedia";
import type { TrackLearningEvent } from "@/hooks/useAcademyLearningEvents";
import {
  STEP_TYPE_LABELS,
  canFinishMission,
  emptyPlayerState,
  isApplyDraftSaved,
  isChoiceCorrect,
  isReasoningCorrect,
  journeyProgress,
  optionById,
  readPlayerState,
  resumeStepIndex,
  type MissionExperienceV2,
  type MissionPlayerV2State,
  type PlayerStep,
} from "@/lib/academy-player";

const noopTrack: TrackLearningEvent = () => {};

interface Props {
  experience: MissionExperienceV2;
  /** Untouched legacy markdown, rendered as the Deep Dive / Full Lesson. */
  markdown: string | null | undefined;
  /** Raw checklist_state row value (all namespaces). */
  checklistState: unknown;
  /** Persists a namespaced patch through academy_set_checklist_state. */
  onPersist: (patch: Partial<MissionPlayerV2State>) => void;
  isCompleted: boolean;
  isCompleting?: boolean;
  onComplete: () => void;
  /** Optional link back to the module overview. */
  onBackToModule?: () => void;
  /** Optional, failure-isolated learning telemetry sink. */
  onEvent?: TrackLearningEvent;
}


export function MissionPlayerV2({
  experience,
  markdown,
  checklistState,
  onPersist,
  isCompleted,
  isCompleting,
  onComplete,
  onBackToModule,
  onEvent,
}: Props) {
  const track = onEvent ?? noopTrack;
  const saved = useMemo(() => readPlayerState(checklistState), [checklistState]);
  const [state, setState] = useState<MissionPlayerV2State>(saved);
  const [hydrated, setHydrated] = useState(false);
  const [index, setIndex] = useState(0);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);


  // Resume from server state; keep syncing if the row arrives (or refreshes) later.
  const savedKey = useMemo(() => JSON.stringify(saved), [saved]);
  useEffect(() => {
    setState((prev) => {
      const next: MissionPlayerV2State = {
        ...saved,
        choices: { ...saved.choices, ...prev.choices },
        reasoning: { ...saved.reasoning, ...prev.reasoning },
        notes: { ...saved.notes, ...prev.notes },
        completed: Array.from(new Set([...saved.completed, ...prev.completed])),
        apply: saved.apply.saved_at ? saved.apply : prev.apply,
        started: saved.started || prev.started,
        currentStepId: prev.currentStepId ?? saved.currentStepId,
      };
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
    // Only lock in the resume position once real saved state has arrived.
    const hasSavedState =
      saved.started || saved.completed.length > 0 || Boolean(saved.currentStepId);
    if (!hydrated && hasSavedState) {
      setIndex(resumeStepIndex(experience, saved));
      setHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const steps = experience.steps;
  const step = steps[Math.min(index, steps.length - 1)];
  const progress = journeyProgress(experience, state);
  const finished = isCompleted;
  const applySaved = isApplyDraftSaved(experience, state);
  const canFinish = canFinishMission(experience, state) && applySaved;

  const update = (patch: Partial<MissionPlayerV2State>) => {
    setState((prev) => {
      const next: MissionPlayerV2State = {
        ...prev,
        ...patch,
        choices: { ...prev.choices, ...(patch.choices ?? {}) },
        reasoning: { ...prev.reasoning, ...(patch.reasoning ?? {}) },
        notes: { ...prev.notes, ...(patch.notes ?? {}) },
        completed: Array.from(new Set([...prev.completed, ...(patch.completed ?? [])])),
        apply: patch.apply ? { ...prev.apply, ...patch.apply } : prev.apply,
      };
      return next;
    });
    onPersist(patch);
  };

  const goTo = (nextIndex: number) => {
    const bounded = Math.max(0, Math.min(steps.length - 1, nextIndex));
    setIndex(bounded);
    setJourneyOpen(false);
    update({ currentStepId: steps[bounded].id, started: true });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const markStepDone = (id: string) => update({ completed: [id] });

  // ── Learning telemetry (observability only; never affects progress) ──────
  const startEmitted = useRef(false);
  const emitStart = useCallback(
    (resumed: boolean) => {
      if (startEmitted.current) return;
      startEmitted.current = true;
      track(resumed ? "mission_resumed" : "mission_started", {
        once: true,
        properties: { resumed, steps_total: steps.length, completion_pct: progress },
      });
    },
    [track, steps.length, progress]
  );

  const hasSavedState = saved.started || saved.completed.length > 0 || Boolean(saved.currentStepId);
  useEffect(() => {
    if (hasSavedState) emitStart(true);
  }, [hasSavedState, emitStart]);

  // Step views — de-duplicated per session so scrolling back is not noisy.
  const currentStepId = state.started && !finished ? step?.id : undefined;
  useEffect(() => {
    if (!currentStepId) return;
    const viewed = steps.find((s) => s.id === currentStepId);
    if (!viewed) return;
    track("step_viewed", {
      stepId: viewed.id,
      once: true,
      properties: {
        step_type: viewed.type,
        step_index: steps.indexOf(viewed) + 1,
        steps_total: steps.length,
      },
    });
    if (viewed.type === "apply") {
      track("apply_started", { stepId: viewed.id, once: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStepId]);

  // Step completions — only those newly earned in this session.
  const serverCompleted = useMemo(() => new Set(saved.completed), [saved.completed]);
  const completionEmitted = useRef<Set<string>>(new Set());
  const completedKey = state.completed.join("|");
  useEffect(() => {
    for (const id of state.completed) {
      if (serverCompleted.has(id) || completionEmitted.current.has(id)) continue;
      completionEmitted.current.add(id);
      const done = steps.find((s) => s.id === id);
      track("step_completed", {
        stepId: id,
        once: true,
        properties: { step_type: done?.type, completion_pct: progress },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedKey]);

  const setDeepDive = useCallback(
    (open: boolean, source?: string) => {
      setDeepDiveOpen(open);
      track(open ? "deep_dive_opened" : "deep_dive_closed", {
        stepId: step?.id ?? null,
        properties: source ? { source } : undefined,
      });
    },
    [track, step?.id]
  );



  // ── Intro screen ────────────────────────────────────────────────────────
  if (!state.started && !finished) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-card rounded-2xl border shadow-sm p-6 sm:p-10 space-y-5 text-center">
          {experience.intro?.eyebrow && (
            <Badge variant="outline" className="text-[11px]">{experience.intro.eyebrow}</Badge>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {experience.intro?.headline ?? experience.title}
          </h1>
          {experience.subtitle && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{experience.subtitle}</p>
          )}
          {experience.intro?.description && (
            <p className="text-sm sm:text-base text-muted-foreground">{experience.intro.description}</p>
          )}
          {(experience.intro?.bullets?.length ?? 0) > 0 && (
            <ul className="text-left mx-auto max-w-md space-y-2">
              {experience.intro!.bullets!.map((b, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button onClick={() => { emitStart(false); update({ started: true, currentStepId: steps[0].id }); setIndex(0); }}>
              {experience.intro?.startLabel ?? "Start mission"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button variant="outline" onClick={() => setDeepDive(true, "button")}>
              <BookOpen className="h-4 w-4 mr-2" />
              {experience.deepDiveTitle ?? "Full lesson"}
            </Button>
          </div>
        </div>
        <DeepDiveSheet
          open={deepDiveOpen}
          onOpenChange={(v) => setDeepDive(v)}
          title={experience.deepDiveTitle ?? "Full Lesson"}
          markdown={markdown}
        />
      </div>
    );
  }

  // ── Mission complete ────────────────────────────────────────────────────
  if (finished) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-card rounded-2xl border shadow-sm p-6 sm:p-10 space-y-5 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Mission complete</h1>
          <p className="text-sm text-muted-foreground">
            {experience.title} — your first-touch draft is saved to this mission and stays available
            for review.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {onBackToModule && (
              <Button onClick={onBackToModule}>
                Back to module<ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
            <Button variant="outline" onClick={() => setDeepDive(true, "button")}>
              <BookOpen className="h-4 w-4 mr-2" />Review full lesson
            </Button>
            <Button variant="ghost" onClick={onComplete} disabled={isCompleting}>
              Mark as incomplete
            </Button>
          </div>
        </div>
        <DeepDiveSheet
          open={deepDiveOpen}
          onOpenChange={(v) => setDeepDive(v)}
          title={experience.deepDiveTitle ?? "Full Lesson"}
          markdown={markdown}
        />
      </div>
    );
  }

  const journey = (
    <nav aria-label="Mission journey" className="space-y-1">
      {steps.map((s, i) => {
        const done = state.completed.includes(s.id);
        const active = i === index;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => goTo(i)}
            aria-current={active ? "step" : undefined}
            className={cn(
              "w-full text-left rounded-lg px-3 py-2 text-sm flex items-start gap-2 transition-colors",
              active ? "bg-secondary text-foreground font-medium" : "hover:bg-secondary/60 text-muted-foreground"
            )}
          >
            {done ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            ) : (
              <Circle className="h-4 w-4 mt-0.5 shrink-0 opacity-50" />
            )}
            <span className="min-w-0">
              <span className="block truncate">{s.navLabel ?? s.title}</span>
              <span className="block text-[11px] opacity-70">{STEP_TYPE_LABELS[s.type]}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );

  const tools = (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Headphones className="h-4 w-4 text-primary" />
          {experience.audioBrief?.title ?? "Mission audio brief"}
        </div>
        <p className="text-xs text-muted-foreground">
          {experience.audioBrief?.duration ?? "—"} · Audio version of this mission.
        </p>
        <MissionMedia
          kind="audio"
          assetKey={experience.audioBrief?.assetKey}
          captionsAssetKey={experience.audioBrief?.captionsAssetKey}
          transcript={experience.audioBrief?.transcript}
          label={experience.audioBrief?.title ?? "Mission audio brief"}
          placeholder={<Badge variant="outline" className="text-[11px]">Coming soon</Badge>}
          onStarted={({ assetKey, durationBucket }) =>
            track("audio_started", {
              once: true,
              properties: { asset_key: assetKey, media_kind: "audio", duration_bucket: durationBucket },
            })
          }
          onCompleted={({ assetKey, positionBucket }) =>
            track("audio_completed", {
              once: true,
              properties: { asset_key: assetKey, media_kind: "audio", position_bucket: positionBucket },
            })
          }
        />
      </div>


      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BookOpen className="h-4 w-4 text-primary" />
          {experience.deepDiveTitle ?? "Full lesson"}
        </div>
        <p className="text-xs text-muted-foreground">
          The complete written lesson, unchanged, for deeper reading.
        </p>
        <Button size="sm" variant="outline" className="w-full" onClick={() => { setToolsOpen(false); setDeepDive(true, "tools"); }}>
          Open Deep Dive
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ListChecks className="h-4 w-4 text-primary" />
          Your progress
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground">
          {progress}% completed · Apply draft {applySaved ? "saved" : "not saved yet"}.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            Viewing step {index + 1} of {steps.length}
          </Badge>
          <Badge variant="outline" className="text-[11px]">{STEP_TYPE_LABELS[step.type]}</Badge>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{experience.title}</h1>
        <div className="space-y-1">
          <Progress
            value={progress}
            className="h-1.5"
            aria-label={`Mission progress: ${progress}% completed`}
          />
          <p className="text-[11px] text-muted-foreground">{progress}% completed</p>
        </div>
      </div>

      {/* Mobile panel triggers */}
      <div className="flex gap-2 lg:hidden">
        <Sheet open={journeyOpen} onOpenChange={setJourneyOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1">
              <ListChecks className="h-4 w-4 mr-2" />Journey
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[85vw] sm:w-96 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Mission journey</SheetTitle>
              <SheetDescription>
                Viewing step {index + 1} of {steps.length} · {progress}% completed.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">{journey}</div>
          </SheetContent>
        </Sheet>
        <Sheet open={toolsOpen} onOpenChange={setToolsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1">
              <Wrench className="h-4 w-4 mr-2" />Tools
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[85vw] sm:w-96 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Mission tools</SheetTitle>
              <SheetDescription>Audio brief, full lesson and your progress.</SheetDescription>
            </SheetHeader>
            <div className="mt-4">{tools}</div>
          </SheetContent>
        </Sheet>
      </div>


      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-3">
              Mission journey
            </p>
            {journey}
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          <StepView
            step={step}
            state={state}
            onUpdate={update}
            onStepDone={markStepDone}
            track={track}
          />


          {/* Desktop navigation */}
          <div className="hidden lg:flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => goTo(index - 1)} disabled={index === 0}>
              <ArrowLeft className="h-4 w-4 mr-1" />Previous
            </Button>
            {index < steps.length - 1 ? (
              <Button onClick={() => goTo(index + 1)}>
                Continue<ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={onComplete} disabled={!canFinish || isCompleting}>
                <CheckCircle2 className="h-4 w-4 mr-2" />Complete Mission
              </Button>
            )}
          </div>
          {index === steps.length - 1 && !canFinish && (
            <p className="text-xs text-muted-foreground text-center">
              Save your first-touch draft to finish this mission.
            </p>
          )}
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-4">{tools}</div>
        </aside>
      </div>

      {/* Mobile fixed navigation */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur p-3 flex items-center gap-3">
        <Button variant="outline" className="flex-1" onClick={() => goTo(index - 1)} disabled={index === 0}>
          <ArrowLeft className="h-4 w-4 mr-1" />Previous
        </Button>
        {index < steps.length - 1 ? (
          <Button className="flex-1" onClick={() => goTo(index + 1)}>
            Continue<ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button className="flex-1" onClick={onComplete} disabled={!canFinish || isCompleting}>
            <CheckCircle2 className="h-4 w-4 mr-1" />Complete
          </Button>
        )}
      </div>

      <DeepDiveSheet
        open={deepDiveOpen}
        onOpenChange={(v) => setDeepDive(v)}
        title={experience.deepDiveTitle ?? "Full Lesson"}
        markdown={markdown}
      />
    </div>
  );
}

// ── Deep dive ─────────────────────────────────────────────────────────────

function DeepDiveSheet({
  open,
  onOpenChange,
  title,
  markdown,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  markdown: string | null | undefined;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            The complete written lesson for this mission, for deeper reading.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <MissionContent markdown={markdown} readOnlyChecklist hideLeadingH1 />
        </div>
      </SheetContent>
    </Sheet>
  );

}

// ── Step rendering ────────────────────────────────────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-card rounded-xl border shadow-sm p-5 sm:p-7", className)}>{children}</div>;
}

function StepView({
  step,
  state,
  onUpdate,
  onStepDone,
  track,
}: {
  step: PlayerStep;
  state: MissionPlayerV2State;
  onUpdate: (patch: Partial<MissionPlayerV2State>) => void;
  onStepDone: (id: string) => void;
  track: TrackLearningEvent;
}) {
  switch (step.type) {
    case "hook":
      return <HookStep step={step} onStepDone={onStepDone} track={track} />;
    case "learn":
      return <LearnStep step={step} onStepDone={onStepDone} />;
    case "interactive-framework":
      return <FrameworkStep step={step} onStepDone={onStepDone} />;
    case "challenge":
    case "knowledge-check":
      return <ChoiceStep step={step} state={state} onUpdate={onUpdate} track={track} />;
    case "scenario":
      return <ScenarioStep step={step} state={state} onUpdate={onUpdate} track={track} />;
    case "ai-moment":
    case "takeaway":
      return <NoteStep step={step} state={state} onUpdate={onUpdate} />;
    case "apply":
      return <ApplyStep step={step} state={state} onUpdate={onUpdate} track={track} />;
    default:
      return null;
  }
}


function StepHeading({ step }: { step: PlayerStep }) {
  return (
    <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">{step.title}</h2>
  );
}

function SeenOnMount({ id, onStepDone }: { id: string; onStepDone: (id: string) => void }) {
  useEffect(() => {
    onStepDone(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return null;
}

function HookStep({ step, onStepDone }: { step: PlayerStep; onStepDone: (id: string) => void }) {
  return (
    <Card className="space-y-5">
      <SeenOnMount id={step.id} onStepDone={onStepDone} />
      <StepHeading step={step} />
      {step.scenario && <p className="text-sm sm:text-base text-muted-foreground">{step.scenario}</p>}
      {step.video && (
        <div
          className="relative rounded-xl border bg-secondary/60 aspect-video flex flex-col items-center justify-center gap-2"
          role="img"
          aria-label={`Video placeholder: ${step.video.label}`}
        >
          <div className="h-12 w-12 rounded-full bg-background/90 border flex items-center justify-center shadow-sm">
            <Play className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">{step.video.label}</p>
          <Badge variant="outline" className="text-[11px] bg-background">{step.video.duration}</Badge>
          <span className="absolute bottom-3 text-[11px] text-muted-foreground">Video coming soon</span>
        </div>
      )}
      {step.insight && (
        <div className="rounded-xl border bg-secondary/40 p-4 flex gap-3">
          <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <p className="text-sm text-foreground">{step.insight}</p>
        </div>
      )}
    </Card>
  );
}

function LearnStep({ step, onStepDone }: { step: PlayerStep; onStepDone: (id: string) => void }) {
  return (
    <Card className="space-y-4">
      <SeenOnMount id={step.id} onStepDone={onStepDone} />
      <StepHeading step={step} />
      {step.body && <p className="text-sm sm:text-base text-muted-foreground">{step.body}</p>}
      {step.bullets && (
        <ul className="space-y-2">
          {step.bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FrameworkStep({ step, onStepDone }: { step: PlayerStep; onStepDone: (id: string) => void }) {
  const items = step.items ?? [];
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);
  return (
    <Card className="space-y-4">
      <SeenOnMount id={step.id} onStepDone={onStepDone} />
      <StepHeading step={step} />
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item, i) => {
          const open = openId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : item.id)}
              className={cn(
                "text-left rounded-xl border p-4 transition-colors",
                open ? "border-primary/50 bg-secondary/50" : "hover:bg-secondary/40"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-foreground">{item.title}</span>
                <ChevronRight className={cn("h-4 w-4 ml-auto transition-transform", open && "rotate-90")} />
              </div>
              {open && (
                <p className="mt-2 text-sm text-muted-foreground">{item.question}</p>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Feedback({ correct, text }: { correct: boolean; text: string }) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border p-4 flex gap-3 text-sm",
        correct
          ? "border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200"
          : "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
      )}
    >
      {correct ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <X className="h-4 w-4 mt-0.5 shrink-0" />}
      <span>{text}</span>
    </div>
  );
}

function OptionButton({
  label,
  text,
  selected,
  state: visual,
  onClick,
}: {
  label?: string;
  text: string;
  selected: boolean;
  state: "neutral" | "correct" | "incorrect";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "w-full text-left rounded-xl border p-4 text-sm transition-colors",
        visual === "correct" && "border-emerald-500/50 bg-emerald-50/60 dark:bg-emerald-900/20",
        visual === "incorrect" && "border-amber-500/50 bg-amber-50/60 dark:bg-amber-900/20",
        visual === "neutral" && (selected ? "border-primary/50 bg-secondary/50" : "hover:bg-secondary/40")
      )}
    >
      {label && (
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          {label}
        </span>
      )}
      <span className="text-foreground">{text}</span>
    </button>
  );
}

function ChoiceStep({
  step,
  state,
  onUpdate,
}: {
  step: PlayerStep;
  state: MissionPlayerV2State;
  onUpdate: (patch: Partial<MissionPlayerV2State>) => void;
}) {
  const selected = state.choices[step.id];
  const correct = isChoiceCorrect(step, selected);
  const option = optionById(step, selected);
  const feedback =
    option?.feedback ?? (correct ? step.correctFeedback : step.incorrectFeedback) ?? "";

  return (
    <Card className="space-y-4">
      <StepHeading step={step} />
      {step.prompt && <p className="text-sm sm:text-base text-muted-foreground">{step.prompt}</p>}
      <div className="space-y-2">
        {(step.options ?? []).map((o) => (
          <OptionButton
            key={o.id}
            label={o.label}
            text={o.text}
            selected={selected === o.id}
            state={
              !selected ? "neutral" : o.id === selected ? (o.correct ? "correct" : "incorrect") : "neutral"
            }
            onClick={() =>
              onUpdate({ choices: { [step.id]: o.id }, completed: [step.id] })
            }
          />
        ))}
      </div>
      {selected && feedback && <Feedback correct={correct} text={feedback} />}
    </Card>
  );
}

function ScenarioStep({
  step,
  state,
  onUpdate,
}: {
  step: PlayerStep;
  state: MissionPlayerV2State;
  onUpdate: (patch: Partial<MissionPlayerV2State>) => void;
}) {
  const selected = state.choices[step.id];
  const option = optionById(step, selected);
  const correct = option?.correct === true;
  const picked = state.reasoning[step.id] ?? [];
  const reasoningOptions = step.reasoningOptions ?? [];
  const reasoningDone = picked.length > 0;
  const reasoningCorrect = isReasoningCorrect(step, picked);

  const toggleReason = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    onUpdate({
      reasoning: { [step.id]: next },
      completed: correct && next.length > 0 ? [step.id] : [],
    });
  };

  return (
    <Card className="space-y-4">
      <StepHeading step={step} />
      {step.prompt && <p className="text-sm sm:text-base text-muted-foreground">{step.prompt}</p>}
      <div className="space-y-2">
        {(step.options ?? []).map((o) => (
          <OptionButton
            key={o.id}
            label={o.label}
            text={o.text}
            selected={selected === o.id}
            state={!selected ? "neutral" : o.id === selected ? (o.correct ? "correct" : "incorrect") : "neutral"}
            onClick={() => onUpdate({ choices: { [step.id]: o.id } })}
          />
        ))}
      </div>
      {selected && option?.feedback && <Feedback correct={correct} text={option.feedback} />}

      {correct && reasoningOptions.length > 0 && (
        <div className="space-y-3 pt-2">
          <Separator />
          <p className="text-sm font-medium text-foreground">
            {step.reasoningPrompt ?? "Why does this work?"}
          </p>
          <div className="space-y-2">
            {reasoningOptions.map((o) => {
              const checked = picked.includes(o.id);
              return (
                <label
                  key={o.id}
                  className="flex items-start gap-3 rounded-xl border p-3 text-sm cursor-pointer hover:bg-secondary/40"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleReason(o.id)}
                    aria-label={o.text}
                    className="mt-0.5"
                  />
                  <span className="text-foreground">{o.text}</span>
                  {reasoningDone && (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {o.correct ? "Correct reason" : "Not a reason"}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          {reasoningDone && (
            <Feedback
              correct={reasoningCorrect}
              text={
                reasoningCorrect
                  ? step.reasoningFeedback ?? "Exactly."
                  : "Review the selections: keep the reasons grounded in evidence, plausibility and a proportionate ask."
              }
            />
          )}
        </div>
      )}
    </Card>
  );
}

function NoteStep({
  step,
  state,
  onUpdate,
}: {
  step: PlayerStep;
  state: MissionPlayerV2State;
  onUpdate: (patch: Partial<MissionPlayerV2State>) => void;
}) {
  const savedNote = state.notes[step.id] ?? "";
  const [value, setValue] = useState(savedNote);
  useEffect(() => setValue(savedNote), [savedNote]);
  const dirty = value !== savedNote;

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        {step.type === "ai-moment" ? (
          <Sparkles className="h-4 w-4 text-primary" />
        ) : (
          <Target className="h-4 w-4 text-primary" />
        )}
        <StepHeading step={step} />
      </div>
      {step.quote && (
        <blockquote className="border-l-2 border-primary pl-4 text-base sm:text-lg font-medium text-foreground">
          {step.quote}
        </blockquote>
      )}
      {step.prompt && (
        <div className="rounded-xl border bg-secondary/40 p-4 text-sm text-foreground">{step.prompt}</div>
      )}
      {step.rule && (
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{step.rule}</p>
      )}
      {step.bullets && (
        <ul className="space-y-2">
          {step.bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <Label htmlFor={`note-${step.id}`}>{step.noteLabel ?? "Your notes"}</Label>
        <Textarea
          id={`note-${step.id}`}
          rows={5}
          value={value}
          placeholder={step.notePlaceholder}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => onUpdate({ notes: { [step.id]: value }, completed: [step.id] })}
            disabled={!value.trim() || !dirty}
          >
            {step.saveLabel ?? "Save"}
          </Button>
          {!dirty && savedNote && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />Saved
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Saved to this mission only. Nothing is sent from PartnerOS.
        </p>
      </div>
    </Card>
  );
}

function ApplyStep({
  step,
  state,
  onUpdate,
}: {
  step: PlayerStep;
  state: MissionPlayerV2State;
  onUpdate: (patch: Partial<MissionPlayerV2State>) => void;
}) {
  const savedApply = state.apply;
  const [account, setAccount] = useState(savedApply.account ?? "");
  const [values, setValues] = useState<Record<string, string>>(savedApply.values ?? {});

  const savedValuesKey = JSON.stringify(savedApply.values ?? {});
  useEffect(() => {
    setAccount(savedApply.account ?? "");
    setValues(JSON.parse(savedValuesKey) as Record<string, string>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedApply.account, savedValuesKey]);

  const missing =
    (step.requireAccountName && !account.trim()) ||
    (step.fields ?? []).some((f) => f.required !== false && !(values[f.id] ?? "").trim());

  return (
    <Card className="space-y-4">
      <StepHeading step={step} />
      {step.intro && <p className="text-sm text-muted-foreground">{step.intro}</p>}
      {step.requireAccountName && (
        <div className="space-y-1.5">
          <Label htmlFor="apply-account">{step.accountLabel ?? "Account name"}</Label>
          <Input id="apply-account" value={account} onChange={(e) => setAccount(e.target.value)} />
        </div>
      )}
      {(step.fields ?? []).map((f) => (
        <div key={f.id} className="space-y-1.5">
          <Label htmlFor={`apply-${f.id}`}>{f.label}</Label>
          <Textarea
            id={`apply-${f.id}`}
            rows={3}
            placeholder={f.placeholder}
            value={values[f.id] ?? ""}
            onChange={(e) => setValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={missing}
          onClick={() =>
            onUpdate({
              apply: { account, values, saved_at: new Date().toISOString() },
              completed: [step.id],
            })
          }
        >
          {step.saveLabel ?? "Save draft"}
        </Button>
        {savedApply.saved_at && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />Draft saved
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Drafts are saved to your mission progress only — PartnerOS never sends them.
      </p>
    </Card>
  );
}

export default MissionPlayerV2;
