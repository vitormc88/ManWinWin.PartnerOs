import { Activity, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecentLearningEvents } from "@/hooks/useAcademyLearningEvents";
import {
  LEARNING_EVENT_LABELS,
  anonymisedLearnerLabel,
  isLearningEventName,
} from "@/lib/academy-events";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/**
 * Admin-only QA window on the append-only learning event log for one mission.
 * Read access is enforced by RLS; this panel is purely observational.
 */
export function RecentLearningEvents({ missionId }: { missionId: string }) {
  const { data = [], isLoading, isError, refetch, isFetching } = useRecentLearningEvents(missionId, {
    limit: 25,
  });

  return (
    <section className="rounded-lg border bg-card p-3 space-y-2" aria-label="Recent learning events">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Recent learning events</h3>
        <Badge variant="outline" className="text-[11px]">Internal QA</Badge>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      ) : isError ? (
        <p className="text-xs text-muted-foreground">
          Events are visible to Academy admins only.
        </p>
      ) : data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No events recorded for this mission yet.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-2 py-1.5">When</th>
                <th className="text-left font-medium px-2 py-1.5">Event</th>
                <th className="text-left font-medium px-2 py-1.5">Step</th>
                <th className="text-left font-medium px-2 py-1.5">Learner</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                    {formatWhen(row.occurred_at)}
                  </td>
                  <td className="px-2 py-1.5 text-foreground">
                    {isLearningEventName(row.event_name)
                      ? LEARNING_EVENT_LABELS[row.event_name]
                      : row.event_name}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-muted-foreground">{row.step_id ?? "—"}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {anonymisedLearnerLabel(row.user_id)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Append-only telemetry for QA. It never affects progress, completion or certification.
      </p>
    </section>
  );
}

export default RecentLearningEvents;
