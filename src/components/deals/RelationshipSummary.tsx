import { useDealActivities } from "@/hooks/useCommissions";
import { useLeadProposals } from "@/hooks/useProposals";
import { Badge } from "@/components/ui/badge";
import { isMeaningfulCustomerInteraction, isSystemActivity, TAG_STYLE } from "@/lib/activity-log";
import { MessageSquare, Tag as TagIcon, FileText, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveProposalLifecycle } from "@/lib/proposal-lifecycle";

interface Props { dealId: string; }

function relTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function RelationshipSummary({ dealId }: Props) {
  const { data: activities = [] } = useDealActivities(dealId);
  const { data: proposals = [] } = useLeadProposals(dealId);

  const lastCustomer = activities.find((a: any) => isMeaningfulCustomerInteraction(a.activity_type));
  const lastMeaningful = activities.find((a: any) => !isSystemActivity(a.activity_type));
  const openTags = new Set<string>();
  activities.slice(0, 20).forEach((a: any) => {
    if (Array.isArray(a.tags)) a.tags.forEach((t: string) => openTags.add(t));
  });
  const competitor = activities.find((a: any) => Array.isArray(a.tags) && a.tags.includes("Competitor Mentioned"));

  const last30 = activities.filter((a: any) => {
    const t = new Date(a.activity_date || a.created_at).getTime();
    return Date.now() - t < 30 * 86400000;
  });
  // Customer interaction count excludes internal/system events (lead, task,
  // stage change, proposal generated) — those stay visible in activity history.
  const humanCount = last30.filter((a: any) => isMeaningfulCustomerInteraction(a.activity_type)).length;

  const latestProposal = [...proposals]
    .filter((p: any) => p.status !== "Lost")
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const lifecycle = resolveProposalLifecycle(proposals as any, activities as any);

  const Item = ({ icon, label, value, muted = false }: any) => (
    <div className="flex items-start gap-2 min-w-0">
      <div className="h-7 w-7 rounded-md bg-secondary/60 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("text-xs truncate", muted ? "text-muted-foreground" : "text-foreground font-medium")}>
          {value || "—"}
        </p>
      </div>
    </div>
  );

  return (
    <div className="bg-card rounded-xl border shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Relationship Summary</h3>
        <span className="text-[10px] text-muted-foreground">last 30d · {humanCount} customer interactions</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Item
          icon={<MessageSquare className="h-3.5 w-3.5 text-blue-500" />}
          label="Last customer touch"
          value={lastCustomer
            ? `${lastCustomer.subject} · ${relTime(new Date(lastCustomer.activity_date || lastCustomer.created_at))}`
            : "No customer interaction"}
          muted={!lastCustomer}
        />
        <Item
          icon={<Activity className="h-3.5 w-3.5 text-emerald-500" />}
          label="Last meaningful activity"
          value={lastMeaningful
            ? `${lastMeaningful.subject} · ${relTime(new Date(lastMeaningful.activity_date || lastMeaningful.created_at))}`
            : "—"}
          muted={!lastMeaningful}
        />
        <Item
          icon={<FileText className="h-3.5 w-3.5 text-indigo-500" />}
          label={lifecycle.state === "sent" ? "Proposal sent" : "Proposal generated"}
          value={latestProposal
            ? `v${latestProposal.version || 1} · ${lifecycle.state === "sent" ? "sent" : "ready"} · ${relTime(
                lifecycle.state === "sent" && lifecycle.sentAt ? lifecycle.sentAt : new Date(latestProposal.created_at)
              )}`
            : "No proposal yet"}
          muted={!latestProposal}
        />
        <Item
          icon={<TagIcon className="h-3.5 w-3.5 text-amber-500" />}
          label="Competitor"
          value={competitor ? "Mentioned recently" : "Not mentioned"}
          muted={!competitor}
        />
      </div>
      {openTags.size > 0 && (
        <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Recent signals</span>
          {Array.from(openTags).slice(0, 8).map((t) => (
            <span key={t} className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full border",
              TAG_STYLE[t] || "bg-muted text-muted-foreground border-transparent",
            )}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
