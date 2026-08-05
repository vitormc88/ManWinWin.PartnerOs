import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MissionContent } from "@/components/academy/MissionContent";
import {
  useAcademyMissions,
  useAcademyModules,
  useCompleteMission,
  useMyMissionProgress,
} from "@/hooks/useAcademy";
import { deriveModuleStatus, formatDuration, moduleProgressPct } from "@/lib/academy";

export default function AcademyMission() {
  const { slug, missionSlug } = useParams();
  const { data: modules = [], isLoading } = useAcademyModules();
  const mod = modules.find((m) => m.slug === slug);
  const { data: missions = [] } = useAcademyMissions(mod?.id);
  const { data: missionProgress = [] } = useMyMissionProgress();
  const complete = useCompleteMission();

  const completedIds = useMemo(
    () => new Set(missionProgress.filter((p) => p.is_completed).map((p) => p.mission_id)),
    [missionProgress]
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading mission…</p>;
  if (!mod) return <p className="text-sm text-muted-foreground">Module not found or not published.</p>;

  const ordered = [...missions].sort((a, b) => a.sort_order - b.sort_order);
  const index = ordered.findIndex((m) => m.slug === missionSlug);
  const mission = ordered[index];
  if (!mission) return <p className="text-sm text-muted-foreground">Mission not found or not published.</p>;

  const prev = index > 0 ? ordered[index - 1] : undefined;
  const next = index < ordered.length - 1 ? ordered[index + 1] : undefined;
  const isDone = completedIds.has(mission.id);

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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link to={`/onboarding/modules/${mod.slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {mod.title}
      </Link>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px]">Mission {mission.mission_number}</Badge>
          <Badge variant="outline" className="text-[11px]">
            <Clock className="h-3 w-3 mr-1" />{formatDuration(mission.estimated_duration_minutes)}
          </Badge>
          {isDone && (
            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[11px] dark:bg-emerald-900/30 dark:text-emerald-300">
              Completed
            </Badge>
          )}
        </div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{mission.title}</h1>
        {mission.short_description && <p className="text-sm text-muted-foreground">{mission.short_description}</p>}
      </div>

      <div className="bg-card rounded-xl border shadow-sm p-5">
        <MissionContent markdown={mission.content_markdown} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" asChild disabled={!prev}>
          {prev ? (
            <Link to={`/onboarding/modules/${mod.slug}/missions/${prev.slug}`}>
              <ArrowLeft className="h-4 w-4 mr-1" />Previous
            </Link>
          ) : (
            <span><ArrowLeft className="h-4 w-4 mr-1 inline" />Previous</span>
          )}
        </Button>

        <Button onClick={onToggleComplete} disabled={complete.isPending} variant={isDone ? "outline" : "default"}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {isDone ? "Mark as incomplete" : "Complete Mission"}
        </Button>

        <Button variant="outline" size="sm" asChild disabled={!next}>
          {next ? (
            <Link to={`/onboarding/modules/${mod.slug}/missions/${next.slug}`}>
              Next<ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          ) : (
            <span>Next<ArrowRight className="h-4 w-4 ml-1 inline" /></span>
          )}
        </Button>
      </div>
    </div>
  );
}
