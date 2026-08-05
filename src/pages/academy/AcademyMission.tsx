import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MissionContent } from "@/components/academy/MissionContent";
import { MissionToc } from "@/components/academy/MissionToc";
import { ResourceList } from "@/components/academy/ResourceList";
import { AcademyBreadcrumbs } from "@/components/academy/AcademyBreadcrumbs";
import {
  useAcademyMissions,
  useAcademyModules,
  useAcademyPhases,
  useAcademyResources,
  useCompleteMission,
  useMyMissionProgress,
  useToggleChecklistItem,
} from "@/hooks/useAcademy";
import {
  checklistCompletion,
  deriveModuleStatus,
  formatDuration,
  formatReadingTime,
  isMissionUnlocked,
  loadReadingPosition,
  moduleProgressPct,
  saveReadingPosition,
  type ChecklistState,
} from "@/lib/academy";


export default function AcademyMission() {
  const { slug, missionSlug } = useParams();
  const { data: modules = [], isLoading } = useAcademyModules();
  const { data: phases = [] } = useAcademyPhases();
  const mod = modules.find((m) => m.slug === slug);
  const { data: missions = [] } = useAcademyMissions(mod?.id);
  const { data: resources = [] } = useAcademyResources(mod?.id);
  const { data: missionProgress = [] } = useMyMissionProgress();
  const complete = useCompleteMission();
  const toggleChecklist = useToggleChecklistItem();

  const completedIds = useMemo(
    () => new Set(missionProgress.filter((p) => p.is_completed).map((p) => p.mission_id)),
    [missionProgress]
  );

  const ordered = useMemo(
    () => [...missions].sort((a, b) => a.sort_order - b.sort_order),
    [missions]
  );
  const index = ordered.findIndex((m) => m.slug === missionSlug);
  const mission = index >= 0 ? ordered[index] : undefined;

  const savedChecklist = useMemo<ChecklistState>(() => {
    const row = missionProgress.find((p) => p.mission_id === mission?.id);
    return (row?.checklist_state as ChecklistState) ?? {};
  }, [missionProgress, mission?.id]);

  const [checklist, setChecklist] = useState<ChecklistState>({});
  useEffect(() => setChecklist(savedChecklist), [savedChecklist]);

  // ── Reading position memory (per mission, per browser) ──────────────────
  const missionId = mission?.id;
  const [resumedFrom, setResumedFrom] = useState(0);
  const restoredFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!missionId || restoredFor.current === missionId) return;
    restoredFor.current = missionId;
    const y = loadReadingPosition(missionId);
    setResumedFrom(y);
    if (y > 0) {
      const t = window.setTimeout(() => window.scrollTo({ top: y, behavior: "auto" }), 120);
      return () => window.clearTimeout(t);
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [missionId]);

  useEffect(() => {
    if (!missionId) return;
    let frame = 0;
    const onScroll = () => {
      window.clearTimeout(frame);
      frame = window.setTimeout(() => saveReadingPosition(missionId, window.scrollY), 250);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [missionId]);



  if (isLoading) return <p className="text-sm text-muted-foreground">Loading mission…</p>;
  if (!mod) return <p className="text-sm text-muted-foreground">Module not found or not published.</p>;
  if (!mission) return <p className="text-sm text-muted-foreground">Mission not found or not published.</p>;

  const phase = phases.find((p) => p.id === mod.phase_id);
  const unlocked = isMissionUnlocked(ordered, mission, completedIds);
  const prev = index > 0 ? ordered[index - 1] : undefined;
  const nextItem = index < ordered.length - 1 ? ordered[index + 1] : undefined;
  const nextUnlocked = nextItem ? isMissionUnlocked(ordered, nextItem, completedIds) : false;
  const isDone = completedIds.has(mission.id);
  const check = checklistCompletion(mission.content_markdown, checklist);
  const missionResources = resources.filter((r) => r.mission_id === mission.id);

  const onToggleChecklistItem = (itemId: string, checked: boolean) => {
    const next = { ...checklist, [itemId]: checked };
    setChecklist(next);
    toggleChecklist.mutate({ missionId: mission.id, moduleId: mod.id, checklistState: next });
  };

  const onToggleComplete = () => {
    const nextCompleted = new Set(completedIds);
    if (isDone) nextCompleted.delete(mission.id);
    else nextCompleted.add(mission.id);
    const pct = moduleProgressPct(missions, nextCompleted);
    complete.mutate({
      missionId: mission.id,
      moduleId: mod.id,
      completed: !isDone,
      progressPct: pct,
      moduleStatus: deriveModuleStatus(pct),
    });
  };

  if (!unlocked) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <AcademyBreadcrumbs
          items={[
            { label: "Partner Academy", to: "/onboarding" },
            ...(phase ? [{ label: phase.title }] : []),
            { label: mod.title, to: `/onboarding/modules/${mod.slug}` },
            { label: mission.title },
          ]}
        />
        <div className="bg-card rounded-xl border shadow-sm p-6 text-center space-y-2">
          <Lock className="h-5 w-5 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            This mission unlocks when you complete the previous one.
          </p>
          {prev && (
            <Button size="sm" asChild>
              <Link to={`/onboarding/modules/${mod.slug}/missions/${prev.slug}`}>Go to previous mission</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <AcademyBreadcrumbs
        items={[
          { label: "Partner Academy", to: "/onboarding" },
          ...(phase ? [{ label: phase.title }] : []),
          { label: mod.title, to: `/onboarding/modules/${mod.slug}` },
          { label: mission.title },
        ]}
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            Mission {mission.mission_number} of {ordered.length}
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            <Clock className="h-3 w-3 mr-1" />
            {formatDuration(mission.estimated_duration_minutes)}
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            <BookOpen className="h-3 w-3 mr-1" />
            {formatReadingTime(mission.content_markdown)}
          </Badge>

          <Badge
            className={`text-[11px] border-0 ${
              isDone
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {isDone ? "Completed" : "In progress"}
          </Badge>
          {check.total > 0 && (
            <Badge variant="outline" className="text-[11px]">
              Checklist {check.done} / {check.total}
            </Badge>
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">{mission.title}</h1>
        {mission.short_description && (
          <p className="text-sm sm:text-base text-muted-foreground">{mission.short_description}</p>
        )}
        {resumedFrom > 0 && (
          <p className="text-xs text-muted-foreground">
            Resumed where you left off.{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                setResumedFrom(0);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Back to top
            </button>
          </p>
        )}
      </div>

      <MissionToc markdown={mission.content_markdown} />

      <div className="bg-card rounded-xl border shadow-sm p-5 sm:p-8">
        <MissionContent
          markdown={mission.content_markdown}
          checklistState={checklist}
          onToggleChecklistItem={onToggleChecklistItem}
        />
      </div>


      {missionResources.length > 0 && <ResourceList resources={missionResources} />}

      {check.total > 0 && !check.allDone && !isDone && (
        <p className="text-xs text-muted-foreground text-center">
          Complete all checklist items to finish this mission.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {prev ? (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/onboarding/modules/${mod.slug}/missions/${prev.slug}`}>
              <ArrowLeft className="h-4 w-4 mr-1" />Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ArrowLeft className="h-4 w-4 mr-1" />Previous
          </Button>
        )}

        <Button
          onClick={onToggleComplete}
          disabled={complete.isPending || (!isDone && !check.allDone)}
          variant={isDone ? "outline" : "default"}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {isDone ? "Mark as incomplete" : "Complete Mission"}
        </Button>

        {nextItem ? (
          <Button variant="outline" size="sm" asChild disabled={!nextUnlocked}>
            <Link to={`/onboarding/modules/${mod.slug}/missions/${nextItem.slug}`}>
              Next<ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/onboarding/modules/${mod.slug}`}>
              Back to module<ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
