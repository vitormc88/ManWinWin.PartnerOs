import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow, isToday, isPast, parseISO } from "date-fns";
import {
  Phone, Mail, Calendar as CalendarIcon, FileText, RefreshCcw, Users as UsersIcon,
  AlertTriangle, Pin, CheckCircle2, Clock, ExternalLink, Plus, Search, MoreHorizontal,
  TrendingUp, Inbox, ListFilter,
} from "lucide-react";
import {
  useTasks, useTodaysFocus, useWorkload, useTeamWorkload,
  useCompleteTask, useRescheduleTask, useAssignTask, useCreateManualTask,
  type UnifiedTask, type TaskView, type TaskPriority, type TaskSource,
} from "@/hooks/useTasks";
import { useUsers } from "@/hooks/useUsers";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ---------- helpers ---------- */

const TYPE_META: Record<string, { icon: any; label: string }> = {
  call: { icon: Phone, label: "Call" },
  email: { icon: Mail, label: "Follow-up Email" },
  meeting: { icon: CalendarIcon, label: "Meeting" },
  proposal: { icon: FileText, label: "Proposal" },
  renewal: { icon: RefreshCcw, label: "Renewal" },
  review: { icon: UsersIcon, label: "Partner Review" },
  customer: { icon: UsersIcon, label: "Customer" },
  escalation: { icon: AlertTriangle, label: "Escalation" },
  manual: { icon: Pin, label: "Manual" },
};

const SOURCE_LABEL: Record<TaskSource, string> = {
  manual: "Manual",
  lead: "Incoming Leads",
  pipeline: "Pipeline",
  partner: "Partners",
  renewal: "Renewals",
  customer: "Customers",
  certification: "Certifications",
};

const PRIORITY_ACCENT: Record<TaskPriority, string> = {
  Critical: "bg-destructive",
  High: "bg-warning",
  Medium: "bg-primary/40",
  Low: "bg-transparent",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  Critical: "text-destructive",
  High: "text-warning-foreground/80",
  Medium: "text-muted-foreground",
  Low: "text-muted-foreground",
};

function formatDue(due: string | null) {
  if (!due) return { label: "No date", tone: "muted" as const };
  const d = parseISO(due);
  if (isPast(d) && !isToday(d)) {
    return { label: `Overdue · ${formatDistanceToNow(d)}`, tone: "danger" as const };
  }
  if (isToday(d)) return { label: `Today · ${format(d, "HH:mm")}`, tone: "warn" as const };
  return { label: format(d, "MMM d"), tone: "muted" as const };
}

function formatEur(n: number) {
  if (!n) return "€0";
  if (n >= 1000) return `€${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `€${n.toFixed(0)}`;
}

function formatDuration(min: number) {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type GroupKey = "priority" | "due" | "company" | "module" | "owner";

function groupTasks(rows: UnifiedTask[], key: GroupKey) {
  const groups = new Map<string, UnifiedTask[]>();
  for (const t of rows) {
    let k: string;
    switch (key) {
      case "priority": k = t.priority; break;
      case "due":
        if (!t.due_date) k = "No date";
        else if (isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))) k = "Overdue";
        else if (isToday(parseISO(t.due_date))) k = "Today";
        else k = format(parseISO(t.due_date), "EEE, MMM d");
        break;
      case "company": k = t.company_name || "Unassigned company"; break;
      case "module": k = SOURCE_LABEL[t.source] || t.source; break;
      case "owner": k = t.owner_name || "Unassigned"; break;
    }
    const arr = groups.get(k) || [];
    arr.push(t);
    groups.set(k, arr);
  }
  return Array.from(groups.entries());
}

/* ---------- Focus header ---------- */

function TodaysFocus() {
  const { data } = useTodaysFocus();
  const items = [
    { label: "Open", value: data?.total ?? 0, tone: "text-foreground" },
    { label: "Critical", value: data?.critical ?? 0, tone: "text-destructive", emphasize: true },
    { label: "Due today", value: data?.dueToday ?? 0, tone: "text-warning-foreground" },
    { label: "Revenue at stake", value: formatEur(data?.revenue ?? 0), tone: "text-foreground" },
    { label: "Time budget", value: formatDuration(data?.estMinutes ?? 0), tone: "text-foreground" },
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px] font-semibold text-muted-foreground tracking-[0.12em] uppercase">
          Today's Focus
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-border/60">
          {items.map((it, i) => (
            <div
              key={it.label}
              className={cn(
                "flex flex-col justify-center px-0 md:px-5 py-2 md:py-0",
                i === 0 && "md:pl-0",
                i === items.length - 1 && "md:pr-0",
              )}
            >
              <div className={cn(
                "font-semibold tabular-nums leading-tight tracking-tight",
                it.emphasize ? "text-2xl" : "text-xl",
                it.tone,
              )}>
                {it.value}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wide">{it.label}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Workload + Team ---------- */

function WorkloadCard() {
  const { data } = useWorkload();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">My Workload</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="Completed this week" value={data?.completedThisWeek ?? 0} />
        <Row label="Avg completion" value={`${(data?.avgCompletionHours ?? 0).toFixed(1)}h`} />
        <Row label="Open" value={data?.openCount ?? 0} />
        <Row label="Overdue" value={data?.overdueCount ?? 0} tone={data?.overdueCount ? "text-destructive font-medium" : ""} />
      </CardContent>
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: any; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(tone)}>{value}</span>
    </div>
  );
}

function TeamWorkloadCard() {
  const { data } = useTeamWorkload();
  if (!data) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">Team Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm max-h-72 overflow-y-auto pr-1">
          {data.slice(0, 12).map((m) => {
            const total = m.open || 1;
            const overduePct = Math.round((m.overdue / total) * 100);
            return (
              <div key={m.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="truncate">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.open} open · {m.completed} done</span>
                </div>
                <div className="h-1.5 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-destructive" style={{ width: `${overduePct}%` }} />
                </div>
                {m.overdue > 0 && (
                  <div className="text-[11px] text-destructive">{m.overdue} overdue · {m.critical} critical</div>
                )}
              </div>
            );
          })}
          {data.length === 0 && <div className="text-muted-foreground">No team activity yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Task card ---------- */

function TaskRow({ task }: { task: UnifiedTask }) {
  const meta = TYPE_META[task.task_type] || TYPE_META.manual;
  const Icon = meta.icon;
  const due = formatDue(task.due_date);
  const complete = useCompleteTask();
  const reschedule = useRescheduleTask();
  const assign = useAssignTask();
  const { data: users } = useUsers();
  const [openReschedule, setOpenReschedule] = useState(false);
  const [openAssign, setOpenAssign] = useState(false);
  const [newDate, setNewDate] = useState<string>(task.due_date ? task.due_date.slice(0, 16) : "");
  const [newOwner, setNewOwner] = useState<string>(task.owner_user_id ?? "");

  const handleComplete = async () => {
    try {
      await complete.mutateAsync(task);
      toast.success("Task completed");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not complete task");
    }
  };

  return (
    <div className="relative flex items-start gap-3 pl-4 pr-4 py-3 hover:bg-muted/40 transition-colors group">
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[3px]",
          PRIORITY_ACCENT[task.priority],
        )}
      />
      <button
        onClick={handleComplete}
        title={`Mark complete · Priority: ${task.priority}`}
        className="mt-0.5 h-5 w-5 rounded border border-input flex items-center justify-center hover:bg-success/10 hover:border-success transition-colors"
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground group-hover:text-success" />
      </button>
      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-foreground truncate">{task.title}</span>
          {task.priority === "Critical" && (
            <span className={cn("text-[10px] font-semibold uppercase tracking-wide", PRIORITY_LABEL.Critical)}>
              Critical
            </span>
          )}
          {task.is_auto && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 bg-info/10 text-info border-info/30"
              title="Generated automatically"
            >
              Auto
            </Badge>
          )}
        </div>
        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{task.description}</p>
        )}
        <div className="flex items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mt-1.5 flex-wrap">
          {task.company_name && (
            <span className="truncate max-w-[180px] font-medium text-foreground/80">{task.company_name}</span>
          )}
          {task.company_name && <span className="text-border">·</span>}
          <span>{SOURCE_LABEL[task.source]}</span>
          <span className="text-border">·</span>
          <span className={cn(
            "tabular-nums",
            due.tone === "danger" && "text-destructive font-medium",
            due.tone === "warn" && "text-warning-foreground font-medium",
          )}>
            {due.label}
          </span>
          {task.owner_name && (<><span className="text-border">·</span><span>{task.owner_name}</span></>)}
          {task.revenue_impact > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="tabular-nums text-foreground/80">{formatEur(task.revenue_impact)}</span>
            </>
          )}
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        {task.related_route && (
          <Button asChild variant="ghost" size="sm">
            <Link to={task.related_route}><ExternalLink className="h-3.5 w-3.5" /></Link>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={handleComplete}>Complete</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpenReschedule(true)}>Reschedule…</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpenAssign(true)}>Assign…</DropdownMenuItem>
            <DropdownMenuSeparator />
            {task.related_route && (
              <DropdownMenuItem asChild>
                <Link to={task.related_route}>Open related record</Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={openReschedule} onOpenChange={setOpenReschedule}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reschedule task</DialogTitle></DialogHeader>
          <Label>New due date</Label>
          <Input type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenReschedule(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                try {
                  await reschedule.mutateAsync({ task, due_date: new Date(newDate).toISOString() });
                  toast.success("Rescheduled");
                  setOpenReschedule(false);
                } catch (e: any) { toast.error(e?.message ?? "Failed"); }
              }}
            >Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openAssign} onOpenChange={setOpenAssign}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign task</DialogTitle></DialogHeader>
          <Label>Owner</Label>
          <Select value={newOwner} onValueChange={setNewOwner}>
            <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
            <SelectContent>
              {(users || []).map((u: any) => (
                <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAssign(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                try {
                  await assign.mutateAsync({ task, owner_user_id: newOwner });
                  toast.success("Assigned");
                  setOpenAssign(false);
                } catch (e: any) { toast.error(e?.message ?? "Failed"); }
              }}
            >Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Create manual task dialog ---------- */

function CreateTaskDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [company, setCompany] = useState("");
  const create = useCreateManualTask();

  const reset = () => { setTitle(""); setDescription(""); setDueDate(""); setPriority("Medium"); setCompany(""); };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Task</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Due</Label>
              <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Critical", "High", "Medium", "Low"].map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Related company (optional)</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!title.trim()}
            onClick={async () => {
              try {
                await create.mutateAsync({
                  title: title.trim(),
                  description: description.trim() || undefined,
                  due_date: dueDate ? new Date(dueDate).toISOString() : null,
                  priority,
                  related_company: company.trim() || null,
                });
                toast.success("Task created");
                setOpen(false);
                reset();
              } catch (e: any) { toast.error(e?.message ?? "Failed"); }
            }}
          >Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Main page ---------- */

export default function Tasks() {
  const { profile, roles } = useAuth();
  const isManager = roles.includes("hq_admin") || profile?.is_hq === true;
  const [view, setView] = useState<TaskView>("my");
  const [source, setSource] = useState<TaskSource | "all">("all");
  const [priority, setPriority] = useState<TaskPriority | "all">("all");
  const [groupBy, setGroupBy] = useState<GroupKey>("priority");
  const [search, setSearch] = useState("");
  const [ownerId, setOwnerId] = useState<string>("all");

  const { data: tasks = [], isLoading } = useTasks({ view, source, priority, search, ownerId });
  const { data: users } = useUsers();

  const groups = useMemo(() => groupTasks(tasks, groupBy), [tasks, groupBy]);

  return (
    <div className="container mx-auto max-w-[1400px] px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground">Your operational command center across every module.</p>
        </div>
        <CreateTaskDialog />
      </div>

      <TodaysFocus />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Tabs value={view} onValueChange={(v) => setView(v as TaskView)}>
              <TabsList>
                <TabsTrigger value="my">My Tasks</TabsTrigger>
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="week">This Week</TabsTrigger>
                <TabsTrigger value="overdue">Overdue</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                {isManager && <TabsTrigger value="team">Team</TabsTrigger>}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tasks…"
                  className="pl-8 h-9 w-56"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-sm">
            <ListFilter className="h-4 w-4 text-muted-foreground" />
            <Select value={source} onValueChange={(v: any) => setSource(v)}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any priority</SelectItem>
                {["Critical", "High", "Medium", "Low"].map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Group by" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="priority">Group by priority</SelectItem>
                <SelectItem value="due">Group by due date</SelectItem>
                <SelectItem value="company">Group by company</SelectItem>
                <SelectItem value="module">Group by module</SelectItem>
                <SelectItem value="owner">Group by owner</SelectItem>
              </SelectContent>
            </Select>
            {isManager && (
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Owner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  {(users || []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading tasks…</div>
              ) : tasks.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-3" />
                  <div className="font-medium">Nothing on your plate.</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Tasks created from Leads, Pipeline, Partners and Renewals will appear here automatically.
                  </div>
                </div>
              ) : (
                <div className="divide-y">
                  {groups.map(([label, items]) => (
                    <div key={label}>
                      <div className="px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                        <span>{label}</span>
                        <span>{items.length}</span>
                      </div>
                      <div className="divide-y">
                        {items.map((t) => <TaskRow key={t.id} task={t} />)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <WorkloadCard />
          {isManager && <TeamWorkloadCard />}
        </div>
      </div>
    </div>
  );
}
