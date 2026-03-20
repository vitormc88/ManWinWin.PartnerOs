import { useState } from "react";
import { mockOnboarding, onboardingStages, type OnboardingStage } from "@/data/partner-engagement-data";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Clock, AlertTriangle, ChevronDown, ChevronRight, Users, Rocket } from "lucide-react";

const stageColors: Record<string, string> = {
  Interested: "bg-muted text-muted-foreground",
  Qualified: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Agreement Signed": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Onboarding Started": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "Training in Progress": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  Certified: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "First Deal Registered": "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  "First Deal Won": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  "Active Partner": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

export default function Onboarding() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const inProgress = mockOnboarding.filter((o) => o.progressPct < 100);
  const completed = mockOnboarding.filter((o) => o.progressPct === 100);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="animate-reveal-up">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Partner Onboarding</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {inProgress.length} in progress · {completed.length} completed
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 animate-reveal-up stagger-1">
        {[
          { label: "In Progress", value: inProgress.length, icon: Clock, color: "text-amber-600" },
          { label: "Completed", value: completed.length, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "Avg Progress", value: `${Math.round(mockOnboarding.reduce((s, o) => s + o.progressPct, 0) / mockOnboarding.length)}%`, icon: Rocket, color: "text-primary" },
          { label: "Total Partners", value: mockOnboarding.length, icon: Users, color: "text-foreground" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-card rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            </div>
            <div>
              <p className={`text-xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Stage Pipeline Visual */}
      <div className="bg-card rounded-xl border shadow-sm p-5 animate-reveal-up stagger-2">
        <h3 className="font-semibold text-foreground mb-4">Onboarding Pipeline</h3>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {onboardingStages.map((stage, i) => {
            const count = mockOnboarding.filter((o) => o.stage === stage).length;
            return (
              <div key={stage} className="flex-1 min-w-[100px]">
                <div className={`text-center py-2 px-1 rounded-lg text-xs font-medium ${stageColors[stage]} ${count > 0 ? "ring-1 ring-current/20" : "opacity-50"}`}>
                  <p className="text-lg font-bold tabular-nums">{count}</p>
                  <p className="truncate">{stage}</p>
                </div>
                {i < onboardingStages.length - 1 && (
                  <div className="flex items-center justify-center text-muted-foreground/30 mt-0.5">→</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Partner Onboarding Cards */}
      <div className="space-y-3 animate-reveal-up stagger-3">
        {mockOnboarding.map((ob) => {
          const expanded = expandedId === ob.id;
          const categories = [...new Set(ob.checklist.map((c) => c.category))];

          return (
            <div key={ob.id} className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <button
                onClick={() => setExpandedId(expanded ? null : ob.id)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors active:scale-[0.995]"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{ob.partnerName}</p>
                    <p className="text-xs text-muted-foreground">{ob.assignedManager} · Started {ob.startedAt}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="w-32 hidden sm:block">
                    <Progress value={ob.progressPct} className="h-2" />
                  </div>
                  <span className="text-sm font-bold tabular-nums text-foreground w-10 text-right">{ob.progressPct}%</span>
                  <Badge className={`${stageColors[ob.stage]} border-0 text-xs`}>{ob.stage}</Badge>
                  {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>

              {expanded && (
                <div className="px-5 pb-5 border-t">
                  {/* Stage progress bar */}
                  <div className="flex items-center gap-0.5 my-4 overflow-x-auto">
                    {onboardingStages.map((s, i) => {
                      const currentIdx = onboardingStages.indexOf(ob.stage);
                      const isPast = i < currentIdx;
                      const isCurrent = i === currentIdx;
                      return (
                        <div key={s} className={`h-1.5 flex-1 rounded-full min-w-[20px] ${isPast ? "bg-emerald-500" : isCurrent ? "bg-primary" : "bg-muted"}`} />
                      );
                    })}
                  </div>

                  {/* Checklist by category */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {categories.map((cat) => {
                      const items = ob.checklist.filter((c) => c.category === cat);
                      const done = items.filter((c) => c.isCompleted).length;
                      return (
                        <div key={cat} className="bg-secondary/30 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">{cat}</p>
                            <span className="text-[11px] text-muted-foreground tabular-nums">{done}/{items.length}</span>
                          </div>
                          <div className="space-y-1.5">
                            {items.map((item) => (
                              <div key={item.id} className="flex items-center gap-2">
                                {item.isCompleted ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                ) : (
                                  <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                                )}
                                <span className={`text-sm ${item.isCompleted ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                  {item.taskName}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Stalled warning */}
                  {ob.progressPct > 0 && ob.progressPct < 50 && (
                    <div className="mt-4 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Onboarding may be stalling. Consider scheduling a check-in with the partner.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
