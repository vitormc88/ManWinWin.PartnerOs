import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, Clock, Lock, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  useAcademyMissions,
  useAcademyModules,
  useAcademyPhases,
  useAcademyResources,
  useMyMissionProgress,
} from "@/hooks/useAcademy";
import { actionLabel, formatDuration, moduleProgressPct, nextMission } from "@/lib/academy";

export default function AcademyModule() {
  const { slug } = useParams();
  const { data: modules = [], isLoading } = useAcademyModules();
  const { data: phases = [] } = useAcademyPhases();
  const mod = modules.find((m) => m.slug === slug);
  const { data: missions = [] } = useAcademyMissions(mod?.id);
  const { data: resources = [] } = useAcademyResources(mod?.id);
  const { data: missionProgress = [] } = useMyMissionProgress();

  const completedIds = useMemo(
    () => new Set(missionProgress.filter((p) => p.is_completed).map((p) => p.mission_id)),
    [missionProgress]
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading module…</p>;
  if (!mod) return <p className="text-sm text-muted-foreground">Module not found or not published.</p>;

  const phase = phases.find((p) => p.id === mod.phase_id);
  const pct = moduleProgressPct(missions, completedIds);
  const next = nextMission(missions, completedIds);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/onboarding" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Partner Academy
      </Link>

      <div className="bg-card rounded-xl border shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            {phase && <p className="text-xs uppercase tracking-wide text-muted-foreground">{phase.title}</p>}
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{mod.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{mod.short_description}</p>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">
            <Clock className="h-3 w-3 mr-1" />{formatDuration(mod.estimated_duration_minutes)}
          </Badge>
        </div>
        {mod.full_description && <p className="text-sm text-foreground">{mod.full_description}</p>}
        <div className="flex items-center gap-3">
          <Progress value={pct} className="h-2 flex-1" />
          <span className="text-xs font-semibold tabular-nums w-9 text-right">{pct}%</span>
          {next && (
            <Button asChild size="sm">
              <Link to={`/onboarding/modules/${mod.slug}/missions/${next.slug}`}>{actionLabel(pct)}</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl border shadow-sm divide-y">
        {missions.map((m) => {
          const done = completedIds.has(m.id);
          const row = (
            <div className="flex items-center gap-3 p-4">
              {m.is_locked ? (
                <Lock className="h-4 w-4 text-muted-foreground/60 shrink-0" />
              ) : done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${done ? "text-muted-foreground" : "text-foreground"}`}>{m.title}</p>
                {m.short_description && <p className="text-xs text-muted-foreground truncate">{m.short_description}</p>}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {formatDuration(m.estimated_duration_minutes)}
              </span>
            </div>
          );
          return m.is_locked ? (
            <div key={m.id} className="opacity-60">{row}</div>
          ) : (
            <Link key={m.id} to={`/onboarding/modules/${mod.slug}/missions/${m.slug}`} className="block hover:bg-secondary/30 transition-colors">
              {row}
            </Link>
          );
        })}
      </div>

      {resources.length > 0 && (
        <div className="bg-card rounded-xl border shadow-sm p-5 space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Resources</h2>
          {resources.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm text-foreground">
              {r.is_downloadable && <Download className="h-3.5 w-3.5 text-muted-foreground" />}
              <span>{r.title}</span>
              <Badge variant="outline" className="text-[10px]">{r.resource_type}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
