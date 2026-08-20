import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, CheckCircle2, Circle, Clock, Lock, ListChecks, BarChart3, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ResourceList } from "@/components/academy/ResourceList";
import { AcademyBreadcrumbs } from "@/components/academy/AcademyBreadcrumbs";
import { AcademyState } from "@/components/academy/AcademyState";

import {
  useAcademyMissions,
  useAcademyModules,
  useAcademyPhases,
  useAcademyResources,
  useMyMissionProgress,
} from "@/hooks/useAcademy";
import { useAcademyItemAccess } from "@/hooks/useAcademyCertificates";
import { isItemUnlocked } from "@/lib/academy-access";
import {
  actionLabel,
  countableMissions,
  difficultyLabel,
  formatDuration,
  formatUpdatedAt,
  moduleProgressPct,
  nextMission,
} from "@/lib/academy";


export default function AcademyModule() {
  const { slug } = useParams();
  const modulesQuery = useAcademyModules();
  const { data: modules = [], isLoading } = modulesQuery;
  const { data: phases = [] } = useAcademyPhases();
  const mod = modules.find((m) => m.slug === slug);
  const missionsQuery = useAcademyMissions(mod?.id);
  const { data: missions = [] } = missionsQuery;
  const { data: resources = [] } = useAcademyResources(mod?.id);
  const { data: missionProgress = [] } = useMyMissionProgress();
  // Server-authoritative sequencing: the list mirrors exactly what the server
  // would allow, so a locked row can never be opened by URL either.
  const { data: access } = useAcademyItemAccess(mod?.id);


  const completedIds = useMemo(
    () => new Set(missionProgress.filter((p) => p.is_completed).map((p) => p.mission_id)),
    [missionProgress]
  );

  if (modulesQuery.isError)
    return <AcademyState kind="error" error={modulesQuery.error} onRetry={() => modulesQuery.refetch()} />;
  if (missionsQuery.isError)
    return <AcademyState kind="error" error={missionsQuery.error} onRetry={() => missionsQuery.refetch()} />;
  if (isLoading) return <AcademyState kind="loading" title="Loading module…" />;
  if (!mod)
    return <AcademyState kind="empty" title="Module not found" description="It may be unpublished or you may not have access." />;

  const phase = phases.find((p) => p.id === mod.phase_id);
  const pct = moduleProgressPct(missions, completedIds);
  const countable = countableMissions(missions);
  const doneCount = countable.filter((m) => completedIds.has(m.id)).length;
  const next = nextMission(missions, completedIds);
  const ordered = [...missions].sort((a, b) => a.sort_order - b.sort_order);
  const moduleResources = resources.filter((r) => !r.mission_id);


  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <AcademyBreadcrumbs
        items={[
          { label: "Partner Academy", to: "/academy" },
          ...(phase ? [{ label: phase.title }] : []),
          { label: mod.title },
        ]}
      />

      <div className="bg-card rounded-xl border shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            {phase && <p className="text-xs uppercase tracking-wide text-muted-foreground">{phase.title}</p>}
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{mod.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{mod.short_description}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            <BarChart3 className="h-3 w-3 mr-1" />{difficultyLabel(mod.difficulty)}
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            <Clock className="h-3 w-3 mr-1" />{formatDuration(mod.estimated_duration_minutes)}
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            <ListChecks className="h-3 w-3 mr-1" />{countable.length} missions
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            <Award className="h-3 w-3 mr-1" />
            {mod.certification_enabled ? "Certificate required" : "No certificate"}
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            <CalendarClock className="h-3 w-3 mr-1" />Updated {formatUpdatedAt(mod.updated_at)}
          </Badge>
        </div>

        {mod.full_description && <p className="text-sm text-foreground">{mod.full_description}</p>}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground tabular-nums">
              {doneCount} / {countable.length} completed
            </span>
            <span className="font-semibold tabular-nums">{pct}%</span>
          </div>
          <div className="flex items-center gap-3">
            <Progress value={pct} className="h-2 flex-1" />
            {next && (
              <Button asChild size="sm">
                <Link to={`/academy/modules/${mod.slug}/missions/${next.slug}`}>
                  {pct === 0 ? "Start Module" : actionLabel(pct)}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border shadow-sm divide-y">
        {ordered.map((m) => {
          const done = completedIds.has(m.id);
          const unlocked = isItemUnlocked(access, m.id);

          const row = (
            <div className="flex items-center gap-3 p-4">
              {!unlocked ? (
                <Lock className="h-4 w-4 text-muted-foreground/60 shrink-0" />
              ) : done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${done ? "text-muted-foreground" : "text-foreground"}`}>
                  <span className="text-muted-foreground tabular-nums mr-2">{m.mission_number}.</span>
                  {m.title}
                </p>
                {m.short_description && (
                  <p className="text-xs text-muted-foreground truncate">{m.short_description}</p>
                )}
              </div>
              {done && <span className="text-[11px] text-emerald-600 dark:text-emerald-400 shrink-0">Completed</span>}
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {formatDuration(m.estimated_duration_minutes)}
              </span>
            </div>
          );
          return !unlocked ? (
            <div key={m.id} className="opacity-60">{row}</div>
          ) : (
            <Link
              key={m.id}
              to={`/academy/modules/${mod.slug}/missions/${m.slug}`}
              className="block hover:bg-secondary/30 transition-colors"
            >
              {row}
            </Link>
          );
        })}
      </div>

      <ResourceList resources={moduleResources} />
    </div>
  );
}
