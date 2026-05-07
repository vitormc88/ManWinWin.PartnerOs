import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeDealHealth, HEALTH_META, STAGE_AGING } from "@/lib/deal-health";
import type { Deal } from "@/hooks/useDeals";
import { Activity, AlertTriangle, Clock, BellOff, Lightbulb, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function DealHealthBanner({ deal }: { deal: Deal }) {
  const { data } = useQuery({
    queryKey: ["deal-health-signals", deal.id],
    queryFn: async () => {
      const todayIso = new Date().toISOString().slice(0, 10);
      const [a, t, p] = await Promise.all([
        supabase.from("deal_activities").select("created_at").eq("deal_id", deal.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("deal_tasks").select("due_date, status, is_completed").eq("deal_id", deal.id),
        supabase.from("proposals").select("created_at").eq("lead_id", deal.id).order("created_at", { ascending: false }).limit(1),
      ]);
      let nextFollowUp: string | null = null;
      let overdue = false;
      (t.data || []).forEach((row: any) => {
        const done = row.status === "Done" || row.is_completed === true;
        if (done || !row.due_date) return;
        if (row.due_date < todayIso) overdue = true;
        else if (!nextFollowUp || row.due_date < nextFollowUp) nextFollowUp = row.due_date;
      });
      return {
        lastActivityAt: a.data?.[0]?.created_at ?? null,
        nextFollowUpAt: nextFollowUp,
        hasOverdueTask: overdue,
        latestProposalAt: p.data?.[0]?.created_at ?? null,
      };
    },
  });

  if (!data) return null;

  const stageEnteredAt = (deal as any).stage_entered_at ? new Date((deal as any).stage_entered_at) : null;
  const activityDate = data.lastActivityAt ? new Date(data.lastActivityAt) : null;
  const effectiveActivity =
    activityDate && stageEnteredAt
      ? new Date(Math.max(activityDate.getTime(), stageEnteredAt.getTime()))
      : (activityDate || stageEnteredAt || new Date(deal.created_at));

  const result = computeDealHealth({
    stage: deal.stage,
    status: deal.status,
    stageEnteredAt,
    createdAt: new Date(deal.created_at),
    lastActivityAt: effectiveActivity,
    nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null,
    hasOverdueTask: data.hasOverdueTask,
    latestProposalAt: data.latestProposalAt ? new Date(data.latestProposalAt) : null,
    hasOwner: !!(deal.assigned_salesperson && deal.assigned_salesperson.trim()),
    baseProbability: (deal as any).probability ?? null,
  });

  const meta = HEALTH_META[result.health];
  const stageThr = STAGE_AGING[deal.stage];
  const isPositive = result.health === "Hot" || result.health === "Healthy";
  const items = isPositive ? result.positives : result.reasons;

  return (
    <div className="bg-card rounded-xl border shadow-sm p-4 animate-reveal-up space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", meta.chip)}>
            <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
            {meta.label}
          </span>
          <span className="text-xs text-muted-foreground">Deal Health</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground tabular-nums">{result.daysInStage}d</span> in stage
            {stageThr && result.daysInStage >= stageThr.warn && (
              <span className={cn("ml-1", result.daysInStage >= stageThr.risk ? "text-red-600" : "text-amber-600")}>
                (warn ≥ {stageThr.warn}d)
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Last activity {result.daysSinceActivity !== null ? `${result.daysSinceActivity}d ago` : "—"}
          </span>
          <span className="flex items-center gap-1.5">
            <BellOff className="h-3.5 w-3.5" />
            {data.nextFollowUpAt
              ? `Next follow-up ${new Date(data.nextFollowUpAt).toLocaleDateString("en-GB")}`
              : "No follow-up scheduled"}
          </span>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
          {items.slice(0, 6).map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
              {isPositive
                ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
                : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-600 shrink-0" />}
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {result.suggestedAction && (
        <div className="flex items-start gap-2 rounded-lg bg-secondary/50 border px-3 py-2">
          <Lightbulb className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div className="text-xs">
            <p className="font-semibold text-foreground">Next best action</p>
            <p className="text-muted-foreground">
              {result.suggestedAction.label}
              {result.suggestedAction.hint && <span className="opacity-70"> · {result.suggestedAction.hint}</span>}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground tabular-nums pt-1 border-t">
        <span>Base probability <span className="font-semibold text-foreground">{result.baseProbability}%</span></span>
        <span>
          Health adjustment{" "}
          <span className={cn("font-semibold", result.probabilityAdjustment > 0 ? "text-emerald-600" : result.probabilityAdjustment < 0 ? "text-red-600" : "text-foreground")}>
            {result.probabilityAdjustment > 0 ? "+" : ""}{result.probabilityAdjustment}%
          </span>
        </span>
        <span>
          Effective <span className="font-semibold text-foreground">{result.effectiveProbability}%</span>
        </span>
      </div>
    </div>
  );
}
