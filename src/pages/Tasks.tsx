import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { addDays, format, formatDistanceToNow, isToday, isPast, nextMonday, parseISO, startOfDay } from "date-fns";
import {
  Phone, Mail, Calendar as CalendarIcon, FileText, RefreshCcw, Users as UsersIcon,
  AlertTriangle, Pin, CheckCircle2, Clock, ExternalLink, Plus, Search, MoreHorizontal,
  TrendingUp, Inbox, ListFilter, ChevronDown, X, Keyboard, Rows3, Rows2, PartyPopper,
  Target, Compass, ArrowRight,
} from "lucide-react";
import {
  useTasks, useTodaysFocus, useWorkload, useTeamWorkload,
  useCompleteTask, useUncompleteTask, useRescheduleTask, useAssignTask, useCreateManualTask,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Density = "comfortable" | "compact";


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

function PriorityDot({ priority }: { priority: TaskPriority }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2 w-2 rounded-full", PRIORITY_ACCENT[priority])}
    />
  );
}

const RESCHEDULE_PRESETS = (base: Date) => [
  { label: "Today", value: startOfDay(base) },
  { label: "Tomorrow", value: startOfDay(addDays(base, 1)) },
  { label: "+3 days", value: startOfDay(addDays(base, 3)) },
  { label: "Next Mon", value: startOfDay(nextMonday(base)) },
];

function ReschedulePopover({
  task,
  onPick,
  children,
}: {
  task: UnifiedTask;
  onPick: (iso: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const initial = task.due_date ? parseISO(task.due_date) : new Date();
  const [date, setDate] = useState<Date | undefined>(initial);

  const pick = (d: Date) => {
    // Preserve original time of day when possible
    const original = task.due_date ? parseISO(task.due_date) : new Date();
    const merged = new Date(d);
    merged.setHours(original.getHours() || 9, original.getMinutes() || 0, 0, 0);
    onPick(merged.toISOString());
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex flex-col gap-1 p-2 border-b">
          {RESCHEDULE_PRESETS(new Date()).map((p) => (
            <Button
              key={p.label}
              variant="ghost"
              size="sm"
              className="justify-between h-8"
              onClick={() => pick(p.value)}
            >
              <span>{p.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {format(p.value, "MMM d")}
              </span>
            </Button>
          ))}
        </div>
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              setDate(d);
              pick(d);
            }
          }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

function TaskRow({
  task,
  archived = false,
  density = "comfortable",
  focused = false,
}: {
  task: UnifiedTask;
  archived?: boolean;
  density?: Density;
  focused?: boolean;
}) {
  const meta = TYPE_META[task.task_type] || TYPE_META.manual;
  const Icon = meta.icon;
  const due = formatDue(task.due_date);
  const complete = useCompleteTask();
  const uncomplete = useUncompleteTask();
  const reschedule = useRescheduleTask();
  const assign = useAssignTask();
  const { data: users } = useUsers();
  const [openAssign, setOpenAssign] = useState(false);
  const [newOwner, setNewOwner] = useState<string>(task.owner_user_id ?? "");
  const [completing, setCompleting] = useState(false);
  const [collapsing, setCollapsing] = useState(false);

  const handleComplete = async (checked: boolean | "indeterminate") => {
    if (!checked || completing) return;
    // 1. Show checked state + strike-through immediately
    setCompleting(true);
    // 2. Hold the strike-through briefly so it's perceived
    await new Promise((r) => setTimeout(r, 200));
    // 3. Begin collapse + fade
    setCollapsing(true);
    // 4. Wait for collapse animation to finish before mutating (removes row from cache)
    await new Promise((r) => setTimeout(r, 280));
    try {
      await complete.mutateAsync(task);
      toast.success("Task completed", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await uncomplete.mutateAsync(task);
              toast.success("Restored");
            } catch (e: any) {
              toast.error(e?.message ?? "Could not undo");
            }
          },
        },
      });
    } catch (e: any) {
      setCompleting(false);
      setCollapsing(false);
      toast.error(e?.message ?? "Could not complete task");
    }
  };

  const handleReschedule = async (iso: string) => {
    try {
      await reschedule.mutateAsync({ task, due_date: iso });
      toast.success(`Rescheduled to ${format(parseISO(iso), "MMM d, HH:mm")}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  // React to keyboard shortcuts dispatched by parent for the focused row
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "x" || e.key === "Enter") {
        e.preventDefault();
        if (!archived) handleComplete(true);
      } else if (e.key === "e") {
        e.preventDefault();
        const tomorrow = startOfDay(addDays(new Date(), 1));
        tomorrow.setHours(9, 0, 0, 0);
        handleReschedule(tomorrow.toISOString());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, archived, task.id]);


  return (
    <div
      data-task-id={task.id}
      className={cn(
        "grid transition-[grid-template-rows,opacity,margin] ease-out",
        collapsing
          ? "grid-rows-[0fr] opacity-0 duration-[280ms]"
          : "grid-rows-[1fr] opacity-100 duration-200",
      )}
      aria-hidden={collapsing}
    >
      <div className="overflow-hidden">
        <div
          className={cn(
            "relative flex items-start gap-3 pl-4 pr-4 group transition-colors",
            density === "compact" ? "py-1.5" : "py-3",
            archived ? "hover:bg-muted/20" : "hover:bg-muted/40",
            focused && "bg-accent/40 ring-1 ring-inset ring-primary/30",
            completing && "opacity-50",
          )}
        >
          {!archived && (
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-0 bottom-0 w-[3px] transition-opacity",
                PRIORITY_ACCENT[task.priority],
                completing && "opacity-30",
              )}
            />
          )}
          <div className={cn(density === "compact" ? "pt-0.5" : "pt-1")}>
            <Checkbox
              checked={completing}
              onCheckedChange={handleComplete}
              aria-label={`Mark "${task.title}" complete`}
              className="h-[18px] w-[18px] data-[state=checked]:bg-success data-[state=checked]:border-success data-[state=checked]:text-success-foreground transition-colors"
            />
          </div>
          <div
            className={cn(
              "rounded-md bg-muted flex items-center justify-center shrink-0",
              density === "compact" ? "h-6 w-6" : "h-8 w-8",
              archived && "bg-muted/50",
            )}
          >
            <Icon
              className={cn(
                density === "compact" ? "h-3.5 w-3.5" : "h-4 w-4",
                archived ? "text-muted-foreground/70" : "text-muted-foreground",
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "text-sm truncate transition-[color,text-decoration-color] duration-300",
                  archived
                    ? "font-normal text-muted-foreground line-through decoration-muted-foreground/40"
                    : "font-medium text-foreground",
                  completing && !archived && "line-through text-muted-foreground decoration-muted-foreground/60",
                )}
              >
                {task.title}
              </span>
              {!archived && task.priority === "Critical" && (
                <span className={cn("text-[10px] font-semibold uppercase tracking-wide", PRIORITY_LABEL.Critical)}>
                  Critical
                </span>
              )}
              {task.is_auto && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    archived
                      ? "bg-transparent text-muted-foreground/70 border-border/60"
                      : "bg-info/10 text-info border-info/30",
                  )}
                  title="Generated automatically"
                >
                  Auto
                </Badge>
              )}
            </div>
            {task.description && density !== "compact" && (
              <p
                className={cn(
                  "text-xs line-clamp-1 mt-0.5",
                  archived ? "text-muted-foreground/70" : "text-muted-foreground",
                )}
              >
                {task.description}
              </p>
            )}
            <div
              className={cn(
                "flex items-center gap-x-2 gap-y-1 text-xs flex-wrap",
                density === "compact" ? "mt-0.5" : "mt-1.5",
                archived ? "text-muted-foreground/70" : "text-muted-foreground",
              )}
            >
              {task.company_name && (
                <span
                  className={cn(
                    "truncate max-w-[180px]",
                    archived ? "font-normal" : "font-medium text-foreground/80",
                  )}
                >
                  {task.company_name}
                </span>
              )}
              {task.company_name && <span className="text-border">·</span>}
              <span>{SOURCE_LABEL[task.source]}</span>
              <span className="text-border">·</span>
              <span
                className={cn(
                  "tabular-nums",
                  !archived && due.tone === "danger" && "text-destructive font-medium",
                  !archived && due.tone === "warn" && "text-warning-foreground font-medium",
                )}
              >
                {due.label}
              </span>
              {task.owner_name && (<><span className="text-border">·</span><span>{task.owner_name}</span></>)}
              {task.revenue_impact > 0 && (
                <>
                  <span className="text-border">·</span>
                  <span className={cn("tabular-nums", !archived && "text-foreground/80")}>
                    {formatEur(task.revenue_impact)}
                  </span>
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
                {!archived && (
                  <DropdownMenuItem onSelect={() => handleComplete(true)}>Complete</DropdownMenuItem>
                )}
                <ReschedulePopover task={task} onPick={handleReschedule}>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Reschedule…</DropdownMenuItem>
                </ReschedulePopover>
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
      </div>
    </div>
  );
}

/* ---------- Collapsible group ---------- */

function useCollapsedGroups(groupBy: string) {
  const storageKey = `tasks.collapsedGroups.${groupBy}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(Array.from(collapsed))); } catch {}
  }, [collapsed, storageKey]);
  const toggle = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };
  return { collapsed, toggle };
}

function TaskGroup({
  label,
  items,
  isCollapsed,
  onToggle,
  groupBy,
  archived = false,
  density = "comfortable",
  focusedId,
}: {
  label: string;
  items: UnifiedTask[];
  isCollapsed: boolean;
  onToggle: () => void;
  groupBy: GroupKey;
  archived?: boolean;
  density?: Density;
  focusedId?: string | null;
}) {
  // Derive priority indicator for priority-grouped headers
  const priorityForLabel =
    groupBy === "priority" && (["Critical", "High", "Medium", "Low"] as TaskPriority[]).includes(label as TaskPriority)
      ? (label as TaskPriority)
      : null;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "sticky top-0 z-10 w-full px-4 py-2 backdrop-blur-sm text-[11px] font-semibold uppercase tracking-[0.1em] flex items-center justify-between border-b transition-colors",
          archived
            ? "bg-muted/30 text-muted-foreground/70 border-border/40 hover:bg-muted/50"
            : "bg-muted/60 text-muted-foreground hover:bg-muted/80",
        )}
        aria-expanded={!isCollapsed}
      >
        <span className="flex items-center gap-2">
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", isCollapsed && "-rotate-90")}
          />
          {!archived && priorityForLabel && <PriorityDot priority={priorityForLabel} />}
          <span>{label}</span>
        </span>
        <span className="tabular-nums">{items.length}</span>
      </button>
      {!isCollapsed && (
        <div className={cn("divide-y", archived ? "divide-border/40" : "divide-border")}>
          {items.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              archived={archived}
              density={density}
              focused={focusedId === t.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}



/* ---------- Create manual task dialog ---------- */

function CreateTaskDialog({
  open: controlledOpen,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
} = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (o: boolean) => {
    onOpenChange ? onOpenChange(o) : setInternalOpen(o);
  };
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
  const [density, setDensity] = useState<Density>(() => {
    try { return (localStorage.getItem("tasks.density") as Density) || "comfortable"; }
    catch { return "comfortable"; }
  });
  useEffect(() => { try { localStorage.setItem("tasks.density", density); } catch {} }, [density]);

  const { data: tasks = [], isLoading } = useTasks({ view, source, priority, search, ownerId });
  const { data: users } = useUsers();

  const groups = useMemo(() => groupTasks(tasks, groupBy), [tasks, groupBy]);
  const { collapsed, toggle } = useCollapsedGroups(groupBy);

  // Flatten visible (non-collapsed) tasks for keyboard navigation
  const visibleFlat = useMemo(
    () => groups.flatMap(([label, items]) => (collapsed.has(label) ? [] : items)),
    [groups, collapsed],
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Keep focusedId valid as list changes
  useEffect(() => {
    if (focusedId && !visibleFlat.some((t) => t.id === focusedId)) {
      setFocusedId(visibleFlat[0]?.id ?? null);
    }
  }, [visibleFlat, focusedId]);

  // Global keyboard shortcuts (j/k navigation, c=new, /=search, ?=help, esc=clear)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = target && (
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
      );
      if (e.key === "/" && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setSearch("");
        searchRef.current?.blur();
        return;
      }
      if (inField) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowShortcuts(true);
      } else if (e.key === "c") {
        e.preventDefault();
        setCreateOpen(true);
      } else if (e.key === "j" || e.key === "ArrowDown") {
        if (visibleFlat.length === 0) return;
        e.preventDefault();
        const idx = visibleFlat.findIndex((t) => t.id === focusedId);
        const next = visibleFlat[Math.min(visibleFlat.length - 1, idx + 1)] ?? visibleFlat[0];
        setFocusedId(next.id);
        document.querySelector(`[data-task-id="${next.id}"]`)
          ?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        if (visibleFlat.length === 0) return;
        e.preventDefault();
        const idx = visibleFlat.findIndex((t) => t.id === focusedId);
        const next = visibleFlat[Math.max(0, idx - 1)] ?? visibleFlat[0];
        setFocusedId(next.id);
        document.querySelector(`[data-task-id="${next.id}"]`)
          ?.scrollIntoView({ block: "nearest" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleFlat, focusedId]);

  // Active filter chips
  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (source !== "all") activeFilters.push({
    key: "source", label: `Source: ${SOURCE_LABEL[source as TaskSource] ?? source}`,
    clear: () => setSource("all"),
  });
  if (priority !== "all") activeFilters.push({
    key: "priority", label: `Priority: ${priority}`, clear: () => setPriority("all"),
  });
  if (ownerId !== "all") {
    const u = (users || []).find((x: any) => x.id === ownerId);
    activeFilters.push({
      key: "owner", label: `Owner: ${u?.full_name || u?.email || "—"}`,
      clear: () => setOwnerId("all"),
    });
  }
  if (search.trim()) activeFilters.push({
    key: "search", label: `"${search.trim()}"`, clear: () => setSearch(""),
  });
  const clearAll = () => { setSource("all"); setPriority("all"); setOwnerId("all"); setSearch(""); };

  return (
    <TooltipProvider delayDuration={250}>
    <div className="container mx-auto max-w-[1400px] px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground">Your operational command center across every module.</p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground"
                onClick={() => setShowShortcuts(true)}
                aria-label="Keyboard shortcuts"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
          </Tooltip>
          <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
        </div>
      </div>

      <TodaysFocus />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <Card className="overflow-hidden">
            {/* Unified toolbar: tabs + filters attached to list */}
            <div className="border-b bg-muted/20">
              <div className="flex items-center justify-between gap-3 px-3 pt-2 flex-wrap">
                <Tabs value={view} onValueChange={(v) => setView(v as TaskView)}>
                  <TabsList className="bg-transparent p-0 h-auto gap-1">
                    {[
                      { v: "my", l: "My Tasks" },
                      { v: "today", l: "Today" },
                      { v: "week", l: "This Week" },
                      { v: "overdue", l: "Overdue" },
                      { v: "completed", l: "Completed" },
                      ...(isManager ? [{ v: "team", l: "Team" }] : []),
                    ].map((t) => (
                      <TabsTrigger
                        key={t.v}
                        value={t.v}
                        className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-md px-3 h-8 text-sm"
                      >
                        {t.l}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tasks…  ( / )"
                    className="pl-8 pr-7 h-8 w-56 bg-background"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
                      aria-label="Clear search"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-sm px-3 py-2">
                <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
                <Select value={source} onValueChange={(v: any) => setSource(v)}>
                  <SelectTrigger className="h-8 w-[150px] bg-background"><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                  <SelectTrigger className="h-8 w-[130px] bg-background"><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any priority</SelectItem>
                    {["Critical", "High", "Medium", "Low"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
                  <SelectTrigger className="h-8 w-[160px] bg-background"><SelectValue placeholder="Group by" /></SelectTrigger>
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
                    <SelectTrigger className="h-8 w-[170px] bg-background"><SelectValue placeholder="Owner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All owners</SelectItem>
                      {(users || []).map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={density === "comfortable" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setDensity("comfortable")}
                        aria-label="Comfortable density"
                      >
                        <Rows3 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Comfortable</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={density === "compact" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setDensity("compact")}
                        aria-label="Compact density"
                      >
                        <Rows2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Compact</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Active filter chips + result summary */}
              {(activeFilters.length > 0 || !isLoading) && (
                <div className="flex items-center gap-2 flex-wrap px-3 pb-2 -mt-1">
                  {activeFilters.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={f.clear}
                      className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-background border text-xs text-foreground/80 hover:bg-muted transition-colors"
                    >
                      <span>{f.label}</span>
                      <X className="h-3 w-3 opacity-60" />
                    </button>
                  ))}
                  {activeFilters.length > 1 && (
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                  {!isLoading && (
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {tasks.length} task{tasks.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              )}
            </div>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="divide-y">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3">
                      <Skeleton className="h-4 w-4 rounded-sm" />
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-2/3" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              ) : tasks.length === 0 ? (
                <div className="p-12 text-center">
                  {activeFilters.length > 0 ? (
                    <>
                      <Inbox className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
                      <div className="font-medium">No tasks match these filters.</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Try clearing one or more filters to widen the view.
                      </div>
                      <Button variant="outline" size="sm" className="mt-4" onClick={clearAll}>
                        Clear filters
                      </Button>
                    </>
                  ) : view === "completed" ? (
                    <>
                      <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
                      <div className="font-medium">No completed tasks yet.</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Finished work will be archived here.
                      </div>
                    </>
                  ) : (
                    <>
                      <PartyPopper className="h-10 w-10 mx-auto text-success mb-3" />
                      <div className="font-medium">You're all caught up.</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        New tasks from Leads, Pipeline, Partners and Renewals will appear here automatically.
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="relative max-h-[70vh] overflow-y-auto">
                  {groups.map(([label, items]) => (
                    <TaskGroup
                      key={label}
                      label={label}
                      items={items}
                      isCollapsed={collapsed.has(label)}
                      onToggle={() => toggle(label)}
                      groupBy={groupBy}
                      archived={view === "completed"}
                      density={density}
                      focusedId={focusedId}
                    />
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

      {/* Keyboard shortcut help */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
          <div className="text-sm divide-y">
            {[
              ["j  /  ↓", "Focus next task"],
              ["k  /  ↑", "Focus previous task"],
              ["x  /  Enter", "Complete focused task"],
              ["e", "Reschedule to tomorrow"],
              ["/", "Focus search"],
              ["Esc", "Clear search"],
              ["c", "New task"],
              ["?", "Show this help"],
            ].map(([k, l]) => (
              <div key={k} className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">{l}</span>
                <kbd className="px-2 py-0.5 rounded bg-muted text-xs font-mono">{k}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}

