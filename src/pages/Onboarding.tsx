import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Clock, GraduationCap, Settings2, Target } from "lucide-react";
import { PartnerLifecyclePanel } from "@/components/academy/PartnerLifecyclePanel";
import { useAcademyMissions, useAcademyModules, useAcademyPhases, useMyMissionProgress } from "@/hooks/useAcademy";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import {
  actionLabel,
  countableMissions,
  formatDuration,
  moduleProgressPct,
  simpleStatus,
  deriveModuleStatus,
  type AcademyModule,
} from "@/lib/academy";

const statusStyles: Record<string, string> = {
  "Not Started": "bg-muted text-muted-foreground",
  "In Progress": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

export default function Onboarding() {
  const { canAdmin } = useModuleAccess();
  const isAcademyAdmin = canAdmin("onboarding");

  const { data: phases = [], isLoading: phasesLoading } = useAcademyPhases();
  const { data: modules = [], isLoading: modulesLoading } = useAcademyModules();
  const { data: missions = [], isLoading: missionsLoading } = useAcademyMissions();
  const { data: missionProgress = [] } = useMyMissionProgress();

  const completedIds = useMemo(
    () => new Set(missionProgress.filter((p) => p.is_completed).map((p) => p.mission_id)),
    [missionProgress]
  );

  const loading = phasesLoading || modulesLoading || missionsLoading;

  const moduleStats = useMemo(() => {
    const map = new Map<string, { pct: number; missionCount: number }>();
    modules.forEach((m) => {
      const mine = missions.filter((x) => x.module_id === m.id);
      map.set(m.id, {
        pct: moduleProgressPct(mine, completedIds),
        missionCount: countableMissions(mine).length,
      });
    });
    return map;
  }, [modules, missions, completedIds]);

  const overallPct = useMemo(() => {
    const countable = missions.filter((m) => m.status === "published" && !m.is_locked);
    if (countable.length === 0) return 0;
    return Math.round((countable.filter((m) => completedIds.has(m.id)).length / countable.length) * 100);
  }, [missions, completedIds]);

  const recommended = useMemo(
    () =>
      modules
        .filter((m) => m.status === "published")
        .sort((a, b) => a.sort_order - b.sort_order)
        .find((m) => (moduleStats.get(m.id)?.pct ?? 0) < 100),
    [modules, moduleStats]
  );

  const renderModuleCard = (mod: AcademyModule) => {
    const stats = moduleStats.get(mod.id) ?? { pct: 0, missionCount: 0 };
    const status = simpleStatus(deriveModuleStatus(stats.pct));
    return (
      <div key={mod.id} className="bg-card rounded-xl border shadow-sm p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{mod.title}</p>
            <p className="text-sm text-muted-foreground mt-1">{mod.short_description}</p>
          </div>
          <Badge className={`${statusStyles[status]} border-0 text-xs shrink-0`}>{status}</Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDuration(mod.estimated_duration_minutes)}</span>
          <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{stats.missionCount} missions</span>
          {mod.status !== "published" && <Badge variant="outline" className="text-[10px]">{mod.status}</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <Progress value={stats.pct} className="h-2 flex-1" />
          <span className="text-xs font-semibold tabular-nums w-9 text-right">{stats.pct}%</span>
        </div>
        <Button asChild size="sm" className="self-start">
          <Link to={`/onboarding/modules/${mod.slug}`}>{actionLabel(stats.pct)}</Link>
        </Button>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Partner Academy</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Structured enablement: phases, modules and missions for partner teams.
          </p>
        </div>
        {isAcademyAdmin && (
          <Button asChild variant="outline" size="sm">
            <Link to="/onboarding/admin"><Settings2 className="h-4 w-4 mr-2" />Manage content</Link>
          </Button>
        )}
      </div>

      <Tabs defaultValue="academy" className="space-y-6">
        <TabsList>
          <TabsTrigger value="academy">Academy</TabsTrigger>
          <TabsTrigger value="lifecycle">Partner Lifecycle</TabsTrigger>
        </TabsList>

        <TabsContent value="academy" className="space-y-6">
          <div className="bg-card rounded-xl border shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-lg bg-secondary flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-foreground">{loading ? "—" : `${overallPct}%`}</p>
                <p className="text-xs text-muted-foreground">Overall progress</p>
              </div>
            </div>
            <div className="flex-1">
              <Progress value={overallPct} className="h-2" />
            </div>
            {recommended && (
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-muted-foreground">Recommended next</p>
                  <p className="text-sm font-medium text-foreground">{recommended.title}</p>
                </div>
                <Button asChild size="sm">
                  <Link to={`/onboarding/modules/${recommended.slug}`}>
                    {actionLabel(moduleStats.get(recommended.id)?.pct ?? 0)}
                  </Link>
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading academy content…</div>
          ) : modules.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-8 text-center">
              <BookOpen className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No published academy content yet.</p>
            </div>
          ) : (
            phases.map((phase) => {
              const phaseModules = modules
                .filter((m) => m.phase_id === phase.id)
                .sort((a, b) => a.sort_order - b.sort_order);
              if (phaseModules.length === 0) return null;
              return (
                <section key={phase.id} className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{phase.title}</h2>
                    {phase.description && <p className="text-sm text-muted-foreground">{phase.description}</p>}
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {phaseModules.map(renderModuleCard)}
                  </div>
                </section>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="lifecycle">
          <PartnerLifecyclePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
