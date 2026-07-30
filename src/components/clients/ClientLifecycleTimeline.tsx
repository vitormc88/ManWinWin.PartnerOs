import { useLifecycleEvents, type LifecycleEvent } from "@/hooks/useLifecycleEvents";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { buildTimeline, resolveTimelineDates, HISTORICAL_DATE_UNKNOWN_LABEL, type TimelineDates } from "@/lib/timeline-dates";
import {
  Trophy,
  UserPlus,
  Link2,
  Package,
  FileText,
  Bell,
  RefreshCw,
  XCircle,
  FilePlus,
  Pencil,
  Receipt,
} from "lucide-react";

const ICONS: Record<string, { icon: any; color: string }> = {
  proposal_won: { icon: Trophy, color: "text-success" },
  client_created: { icon: UserPlus, color: "text-primary" },
  client_linked: { icon: Link2, color: "text-primary" },
  license_created: { icon: Package, color: "text-primary" },
  license_updated: { icon: Pencil, color: "text-muted-foreground" },
  license_closed: { icon: XCircle, color: "text-destructive" },
  contract_created: { icon: FileText, color: "text-primary" },
  contract_updated: { icon: Pencil, color: "text-muted-foreground" },
  contract_line_added: { icon: FilePlus, color: "text-muted-foreground" },
  renewal_scheduled: { icon: Bell, color: "text-warning" },
  renewal_renewed: { icon: RefreshCw, color: "text-success" },
  invoice_issued: { icon: Receipt, color: "text-muted-foreground" },
};

function eventVisual(type: string) {
  return ICONS[type] || { icon: FileText, color: "text-muted-foreground" };
}

interface Props {
  clientId: string;
  limit?: number;
  onViewAll?: () => void;
}

export function ClientLifecycleTimeline({ clientId, limit, onViewAll }: Props) {
  const { data: events = [], isLoading } = useLifecycleEvents(clientId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
        No lifecycle events yet. Events appear when a proposal is converted, a license is created, or a renewal is scheduled.
      </div>
    );
  }

  const ordered = buildTimeline(events as any);
  const visible = limit ? ordered.slice(0, limit) : ordered;
  const hasMore = limit ? ordered.length > limit : false;

  return (
    <div className="space-y-3">
      <ol className="relative border-l border-border ml-3 space-y-3">
        {visible.map(({ event, dates }) => (
          <TimelineRow key={event.id} event={event} dates={dates} />
        ))}
      </ol>
      {hasMore && (
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs text-primary hover:underline font-medium"
        >
          View Full Timeline → ({events.length - visible.length} more)
        </button>
      )}
    </div>
  );
}

function TimelineRow({ event, dates }: { event: LifecycleEvent; dates?: TimelineDates }) {
  const d = dates ?? resolveTimelineDates(event as any);
  const v = eventVisual(event.event_type);
  const Icon = v.icon;
  return (
    <li className="ml-4">
      <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-border">
        <Icon className={`h-3 w-3 ${v.color}`} />
      </span>
      <div className="rounded-lg border bg-card px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{event.event_title}</p>
          <span className="text-[10px] whitespace-nowrap text-muted-foreground">
            {d.hasRealDate
              ? new Date(d.occurredAt!).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
              : HISTORICAL_DATE_UNKNOWN_LABEL}
          </span>
        </div>
        {event.event_description && (
          <p className="text-xs text-muted-foreground mt-0.5">{event.event_description}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {event.source_proposal_number && (
            <Badge variant="outline" className="text-[10px]">Proposal {event.source_proposal_number}</Badge>
          )}
          {d.technicalLabel && (
            <span className="text-[10px] text-muted-foreground">{d.technicalLabel}</span>
          )}
          {event.actor_name && (
            <span className="text-[10px] text-muted-foreground">by {event.actor_name}</span>
          )}
        </div>
      </div>
    </li>
  );
}
