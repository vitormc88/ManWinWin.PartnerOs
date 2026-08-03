import { useMemo, useState, useEffect } from "react";
import { useDealActivities } from "@/hooks/useCommissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Phone, Mail, MessageSquare, Calendar, FileText, MonitorPlay, MessagesSquare,
  Tag as TagIcon, DollarSign, Wrench, Lock, CheckCircle2, MoreHorizontal,
  Plus, ChevronDown, Search, ListPlus, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ACTIVITY_TYPE_OPTIONS, ACTIVITY_TYPE_LABELS, ACTIVITY_TAGS, TAG_STYLE,
  isSystemActivity, logDealActivity,
} from "@/lib/activity-log";
import { activityStreamSummary } from "@/lib/activity-stream";
import { useAuth } from "@/contexts/AuthContext";
import { useMyEffectivePermissions } from "@/hooks/useRoleTemplates";
import { canEdit } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { followUpDefaultsForStage } from "@/lib/followup-defaults";
import { useCreateDealTask } from "@/hooks/useDealTasksCRUD";

interface Props {
  dealId: string;
  dealStage?: string;
  defaultAssigneeId?: string | null;
}

function activityIcon(type: string) {
  const cls = "h-3.5 w-3.5";
  switch (type) {
    case "call":                  return <Phone className={cn(cls, "text-blue-500")} />;
    case "email":                 return <Mail className={cn(cls, "text-amber-500")} />;
    case "meeting":               return <Calendar className={cn(cls, "text-emerald-500")} />;
    case "whatsapp":              return <MessagesSquare className={cn(cls, "text-green-500")} />;
    case "demo":                  return <MonitorPlay className={cn(cls, "text-violet-500")} />;
    case "proposal_sent":
    case "proposal_discussion":   return <FileText className={cn(cls, "text-indigo-500")} />;
    case "pricing_discussion":    return <DollarSign className={cn(cls, "text-amber-600")} />;
    case "technical_discussion":  return <Wrench className={cn(cls, "text-cyan-500")} />;
    case "internal_note":         return <Lock className={cn(cls, "text-slate-500")} />;
    case "decision":              return <CheckCircle2 className={cn(cls, "text-emerald-600")} />;
    case "follow_up":             return <ListPlus className={cn(cls, "text-blue-500")} />;
    case "system":                return <FileText className={cn(cls, "text-muted-foreground")} />;
    default:                      return <MessageSquare className={cn(cls, "text-muted-foreground")} />;
  }
}

export function DealCommunicationTab({ dealId, dealStage, defaultAssigneeId }: Props) {
  const { data: activities = [] } = useDealActivities(dealId);
  const { user, profile } = useAuth();
  const currentUserName = profile?.full_name || profile?.email || user?.email || "";
  const { data: perms } = useMyEffectivePermissions();
  const canEditPipeline = canEdit(perms, "pipeline");
  const qc = useQueryClient();
  const createTask = useCreateDealTask();

  const [showAdd, setShowAdd] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterAuthor, setFilterAuthor] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    activity_type: "call",
    subject: "",
    description: "",
    performed_by: currentUserName,
    tags: [] as string[],
    activity_date: new Date().toISOString().slice(0, 16),
    participants: "",
    create_followup: false,
  });
  useEffect(() => {
    setForm((f) => ({ ...f, performed_by: f.performed_by || currentUserName }));
  }, [currentUserName]);

  const authors = useMemo(
    () => Array.from(new Set(activities.map((a: any) => a.performed_by).filter(Boolean))) as string[],
    [activities],
  );

  const filtered = useMemo(() => {
    let list = [...activities];
    if (filterType !== "all") list = list.filter((a: any) => a.activity_type === filterType);
    if (filterAuthor !== "all") list = list.filter((a: any) => a.performed_by === filterAuthor);
    if (filterTag !== "all") list = list.filter((a: any) => Array.isArray(a.tags) && a.tags.includes(filterTag));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a: any) =>
        (a.subject || "").toLowerCase().includes(q) ||
        (a.description || "").toLowerCase().includes(q),
      );
    }
    list.sort((a: any, b: any) => {
      const aT = new Date(a.activity_date || a.created_at).getTime();
      const bT = new Date(b.activity_date || b.created_at).getTime();
      return order === "newest" ? bT - aT : aT - bT;
    });
    return list;
  }, [activities, filterType, filterAuthor, filterTag, order, search]);

  const submit = async () => {
    if (!form.subject.trim()) { toast.error("Subject required"); return; }
    const participants = form.participants
      .split(",").map((s) => s.trim()).filter(Boolean);
    await logDealActivity({
      dealId,
      activityType: form.activity_type,
      subject: form.subject.trim(),
      description: form.description.trim() || null,
      performedBy: form.performed_by || currentUserName,
      tags: form.tags,
      activityDate: form.activity_date ? new Date(form.activity_date) : new Date(),
      participants,
    });
    qc.invalidateQueries({ queryKey: ["deal_activities", dealId] });
    qc.invalidateQueries({ queryKey: ["deal-health-signals", dealId] });
    qc.invalidateQueries({ queryKey: ["deals-health"] });
    toast.success("Communication logged");

    if (form.create_followup) {
      const defaults = followUpDefaultsForStage(dealStage || "");
      await createTask.mutateAsync({
        deal_id: dealId,
        title: defaults.title,
        description: `Follow-up from: ${form.subject.trim()}`,
        priority: defaults.priority,
        category: defaults.category,
        due_date: defaults.dueDate,
        assigned_user_id: defaultAssigneeId || user?.id || null,
        created_by: user?.id || undefined,
        assigned_user_name: currentUserName,
      });
      toast.success("Follow-up task created");
    }

    setShowAdd(false);
    setForm({
      activity_type: "call", subject: "", description: "",
      performed_by: currentUserName, tags: [],
      activity_date: new Date().toISOString().slice(0, 16),
      participants: "", create_followup: false,
    });
  };

  const toggleTag = (t: string) =>
    setForm((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }));

  const deleteActivity = async (id: string) => {
    await supabase.from("deal_activities").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["deal_activities", dealId] });
    qc.invalidateQueries({ queryKey: ["deals-health"] });
    toast.success("Entry removed");
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-card rounded-xl border shadow-sm p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search interactions…"
            className="pl-8 h-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ACTIVITY_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAuthor} onValueChange={setFilterAuthor}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="All authors" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All authors</SelectItem>
            {authors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTag} onValueChange={setFilterTag}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="All tags" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {ACTIVITY_TAGS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={order} onValueChange={(v) => setOrder(v as any)}>
          <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
          </SelectContent>
        </Select>
        {canEditPipeline && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />Log Communication
          </Button>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-card rounded-xl border shadow-sm p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Activity Timeline</h3>
          <p className="text-xs text-muted-foreground">
            Full audit stream — {activityStreamSummary(activities as any)}. System activity is
            recorded automatically and does not count as a customer interaction.
          </p>
        </div>

        <div className="space-y-0">
          {filtered.map((a: any, i: number) => {
            const sys = isSystemActivity(a.activity_type);
            const when = new Date(a.activity_date || a.created_at);
            return (
              <TimelineEntry
                key={a.id}
                activity={a}
                index={i}
                last={i === filtered.length - 1}
                when={when}
                isSystem={sys}
                canEdit={canEditPipeline}
                onDelete={() => deleteActivity(a.id)}
              />
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No interactions match your filters.
            </p>
          )}
        </div>
      </div>

      {/* Log Communication dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Log Communication</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.activity_type} onValueChange={(v) => setForm((f) => ({ ...f, activity_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPE_OPTIONS.filter((o) => o.value !== "system").map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>When</Label>
                <Input type="datetime-local" value={form.activity_date}
                  onChange={(e) => setForm((f) => ({ ...f, activity_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Subject *</Label>
              <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="e.g. Discovery call with maintenance team" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={4} value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What was discussed, what decisions were made, next steps…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Logged by</Label>
                <Input value={form.performed_by}
                  onChange={(e) => setForm((f) => ({ ...f, performed_by: e.target.value }))} />
              </div>
              <div>
                <Label>Participants</Label>
                <Input value={form.participants}
                  onChange={(e) => setForm((f) => ({ ...f, participants: e.target.value }))}
                  placeholder="comma separated" />
              </div>
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><TagIcon className="h-3.5 w-3.5" />Insight tags</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {ACTIVITY_TAGS.map((t) => {
                  const active = form.tags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className={cn(
                        "text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                        active ? TAG_STYLE[t] : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted",
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm pt-1">
              <input type="checkbox" checked={form.create_followup}
                onChange={(e) => setForm((f) => ({ ...f, create_followup: e.target.checked }))}
                className="rounded" />
              Create follow-up task from this activity
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={submit}>Log Communication</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimelineEntry({
  activity, last, when, isSystem, canEdit, onDelete,
}: {
  activity: any; index: number; last: boolean; when: Date;
  isSystem: boolean; canEdit: boolean; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!activity.description || (activity.participants && activity.participants.length > 0);
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn(
          "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
          isSystem ? "bg-muted/50 ring-1 ring-border" : "bg-secondary",
        )}>
          {activityIcon(activity.activity_type)}
        </div>
        {!last && <div className="w-px flex-1 bg-border my-1" />}
      </div>
      <div className={cn("pb-4 flex-1 min-w-0", isSystem && "opacity-75")}>
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn(
            "text-sm",
            isSystem ? "text-muted-foreground" : "text-foreground font-medium",
          )}>{activity.subject}</p>
          <Badge variant="outline" className="text-[10px]">
            {ACTIVITY_TYPE_LABELS[activity.activity_type] || activity.activity_type}
          </Badge>
          {isSystem && <Badge variant="ghost" className="text-[10px]">System</Badge>}
          {Array.isArray(activity.tags) && activity.tags.map((t: string) => (
            <span key={t} className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full border",
              TAG_STYLE[t] || "bg-muted text-muted-foreground border-transparent",
            )}>{t}</span>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {activity.performed_by || "—"} ·{" "}
          {when.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          {activity.participants?.length ? ` · with ${activity.participants.join(", ")}` : ""}
        </p>
        {hasDetail && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <button className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1">
                <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
                {open ? "Hide details" : "Show details"}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {activity.description && (
                <p className="text-sm text-foreground/80 whitespace-pre-wrap mt-1">{activity.description}</p>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
        {canEdit && !isSystem && (
          <button onClick={onDelete}
            className="text-[10px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1 mt-1 ml-3">
            <Trash2 className="h-3 w-3" />Delete
          </button>
        )}
      </div>
    </div>
  );
}
