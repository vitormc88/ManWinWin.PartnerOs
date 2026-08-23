import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MissionContent } from "@/components/academy/MissionContent";
import { MissionToc } from "@/components/academy/MissionToc";
import { ResourceList } from "@/components/academy/ResourceList";
import { AcademyBreadcrumbs } from "@/components/academy/AcademyBreadcrumbs";
import { CertificationPanel } from "@/components/academy/CertificationPanel";
import { MissionPlayerV2 } from "@/components/academy/MissionPlayerV2";
import {
  useAcademyMissions,
  useAcademyModules,
  useAcademyPhases,
  useAcademyResources,
  useCompleteMission,
  useMyMissionProgress,
  useToggleChecklistItem,
} from "@/hooks/useAcademy";
import { AcademyState } from "@/components/academy/AcademyState";
import {
  checklistCompletion,
  formatDuration,
  formatReadingTime,
  loadReadingPosition,
  saveReadingPosition,
  type ChecklistState,
} from "@/lib/academy";
import {
  MISSION_PLAYER_V2_STATE_KEY,
  mergePlayerState,
  parseMissionExperience,
  readPlayerState,
  type MissionPlayerV2State,
} from "@/lib/academy-player";
import { useAcademyItemAccess } from "@/hooks/useAcademyCertificates";
import { accessRowFor, isItemUnlocked, lockMessage } from "@/lib/academy-access";

/** Stable empty array so loading states don't invalidate memos every render. */
const EMPTY_PROGRESS: NonNullable<ReturnType<typeof useMyMissionProgress>["data"]> = [];


export default function AcademyMission() {
  const { slug, missionSlug } = useParams();
  const navigate = useNavigate();
  const modulesQuery = useAcademyModules();
  const { data: modules = [], isLoading } = modulesQuery;
  const { data: phases = [] } = useAcademyPhases();
  const mod = modules.find((m) => m.slug === slug);
  const missionsQuery = useAcademyMissions(mod?.id);
  const { data: missions = [] } = missionsQuery;
  const { data: resources = [] } = useAcademyResources(mod?.id);
  const { data: missionProgressData } = useMyMissionProgress();
  // Stable identity while the query is still loading, otherwise the memo below
  // (and its effect) would re-run on every render.
  const missionProgress = missionProgressData ?? EMPTY_PROGRESS;
  const complete = useCompleteMission();
  // Direct-route protection mirrors the server rule exactly.
  const { data: access, isLoading: accessLoading } = useAcademyItemAccess(mod?.id);
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
  const isCertification = mission?.item_kind === "certification";

  /** v2 activates only for a valid `academy-learning-experience-v2` payload. */
  const experience = useMemo(
    () => parseMissionExperience(mission?.content_json),
    [mission?.content_json]
  );

  const savedChecklist = useMemo<ChecklistState>(() => {
    const row = missionProgress.find((p) => p.mission_id === mission?.id);
    return (row?.checklist_state as ChecklistState) ?? {};
  }, [missionProgress, mission?.id]);

  const [checklist, setChecklist] = useState<ChecklistState>({});
  /** Always-current mirror so rapid successive persists never merge stale state. */
  const checklistRef = useRef<ChecklistState>({});
  useEffect(() => {
    // A refetch can land before an in-flight write is visible: union the server
    // state with what is already in the mirror instead of replacing it.
    const local = checklistRef.current;
    if (Object.keys(local).length === 0) {
      checklistRef.current = savedChecklist;
      setChecklist(savedChecklist);
      return;
    }
    const base: ChecklistState = { ...savedChecklist, ...local };
    // Let mergePlayerState union the two player states (server = base, local = patch).
    base[MISSION_PLAYER_V2_STATE_KEY] = savedChecklist[MISSION_PLAYER_V2_STATE_KEY];
    const merged = mergePlayerState(base, readPlayerState(local)) as ChecklistState;
    if (JSON.stringify(merged) === JSON.stringify(local)) return;
    checklistRef.current = merged;
    setChecklist(merged);
  }, [savedChecklist]);


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

  if (modulesQuery.isError)
    return <AcademyState kind="error" error={modulesQuery.error} onRetry={() => modulesQuery.refetch()} />;
  if (missionsQuery.isError)
    return <AcademyState kind="error" error={missionsQuery.error} onRetry={() => missionsQuery.refetch()} />;
  if (isLoading || (mod && missionsQuery.isLoading))
    return <AcademyState kind="loading" title="Loading mission…" />;
  if (!mod)
    return <AcademyState kind="empty" title="Module not found" description="It may be unpublished or you may not have access." />;
  if (!mission)
    return <AcademyState kind="empty" title="Mission not found" description="It may be unpublished or you may not have access." />;


  const phase = phases.find((p) => p.id === mod.phase_id);
  const accessRow = accessRowFor(access, mission.id);
  const unlocked = isItemUnlocked(access, mission.id);
  const prev = index > 0 ? ordered[index - 1] : undefined;
  const nextItem = index < ordered.length - 1 ? ordered[index + 1] : undefined;
  const nextUnlocked = nextItem ? isItemUnlocked(access, nextItem.id) : false;
  const isDone = completedIds.has(mission.id);
  const check = checklistCompletion(mission.content_markdown, checklist);
  const missionResources = resources.filter((r) => r.mission_id === mission.id);

  const onToggleChecklistItem = (itemId: string, checked: boolean) => {
    const next = { ...checklistRef.current, [itemId]: checked };
    checklistRef.current = next;
    setChecklist(next);
    toggleChecklist.mutate({ missionId: mission.id, checklistState: next });
  };

  const onToggleComplete = () => {
    complete.mutate({ missionId: mission.id, completed: !isDone });
  };


  if (accessLoading && !access) {
    return <AcademyState kind="loading" title="Checking your access…" />;
  }

  // Server-authoritative lock: the same rule that would refuse the write.
  if (!unlocked) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <AcademyBreadcrumbs
          items={[
            { label: "Partner Academy", to: "/academy" },
            ...(phase ? [{ label: phase.title }] : []),
            { label: mod.title, to: `/academy/modules/${mod.slug}` },
            { label: mission.title },
          ]}
        />
        <div className="bg-card rounded-xl border shadow-sm p-6 text-center space-y-2">
          <Lock className="h-5 w-5 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {lockMessage(accessRow) || "This item unlocks when you complete the previous one."}
          </p>
          {prev && (
            <Button size="sm" asChild>
              <Link to={`/academy/modules/${mod.slug}/missions/${prev.slug}`}>Go to previous mission</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Mission Player v2 (opt-in per mission via content_json) ─────────────
  if (experience && !isCertification) {
    const onPersistPlayer = (patch: Partial<MissionPlayerV2State>) => {
      const next = mergePlayerState(checklistRef.current, patch) as ChecklistState;
      checklistRef.current = next;
      setChecklist(next);
      toggleChecklist.mutate({ missionId: mission.id, checklistState: next });
    };

    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <AcademyBreadcrumbs
          items={[
            { label: "Partner Academy", to: "/academy" },
            ...(phase ? [{ label: phase.title }] : []),
            { label: mod.title, to: `/academy/modules/${mod.slug}` },
            { label: mission.title },
          ]}
        />
        <MissionPlayerV2
          experience={experience}
          markdown={mission.content_markdown}
          checklistState={checklist}
          onPersist={onPersistPlayer}
          isCompleted={isDone}
          isCompleting={complete.isPending}
          onComplete={onToggleComplete}
          onBackToModule={() => navigate(`/academy/modules/${mod.slug}`)}
        />
      </div>
    );
  }


  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <AcademyBreadcrumbs
        items={[
          { label: "Partner Academy", to: "/academy" },
          ...(phase ? [{ label: phase.title }] : []),
          { label: mod.title, to: `/academy/modules/${mod.slug}` },
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

      <MissionToc markdown={mission.content_markdown} hideLeadingH1 />

      <div className="bg-card rounded-xl border shadow-sm p-5 sm:p-8">
        <MissionContent
          markdown={mission.content_markdown}
          checklistState={checklist}
          onToggleChecklistItem={onToggleChecklistItem}
          hideLeadingH1
        />
      </div>

      {isCertification && <CertificationPanel moduleId={mod.id} moduleSlug={mod.slug} />}

      {missionResources.length > 0 && <ResourceList resources={missionResources} />}

      {!isCertification && check.total > 0 && !check.allDone && !isDone && (
        <p className="text-xs text-muted-foreground text-center">
          Complete all checklist items to finish this mission.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {prev ? (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/academy/modules/${mod.slug}/missions/${prev.slug}`}>
              <ArrowLeft className="h-4 w-4 mr-1" />Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ArrowLeft className="h-4 w-4 mr-1" />Previous
          </Button>
        )}

        {!isCertification && (
          <Button
            onClick={onToggleComplete}
            disabled={complete.isPending || (!isDone && !check.allDone)}
            variant={isDone ? "outline" : "default"}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {isDone ? "Mark as incomplete" : "Complete Mission"}
          </Button>
        )}

        {nextItem ? (
          <Button variant="outline" size="sm" asChild disabled={!nextUnlocked}>
            <Link to={`/academy/modules/${mod.slug}/missions/${nextItem.slug}`}>
              Next<ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/academy/modules/${mod.slug}`}>
              Back to module<ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
