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
  useCompleteTask, useUncompleteTask, useRescheduleTask, useAssignTask,
  useCreateManualTask, useUpdateTaskStatus,
  TASK_RELATED_TYPES, TASK_TYPES,
  type UnifiedTask, type TaskView, type TaskPriority, type TaskSource,
  type TaskRelatedType, type ManualTaskType, type ManualTaskStatus,
} from "@/hooks/useTasks";
import { useUsers } from "@/hooks/useUsers";
import { useAssignableUsers } from "@/hooks/useAssignableUsers";
import { useAuth } from "@/contexts/AuthContext";
import { EntityCombobox } from "@/components/tasks/EntityCombobox";

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
  email: { icon: Mail, label: "Email" },
  meeting: { icon: CalendarIcon, label: "Meeting" },
  proposal: { icon: FileText, label: "Proposal" },
  renewal: { icon: RefreshCcw, label: "Renewal" },
  follow_up: { icon: ArrowRight, label: "Follow-up" },
  internal: { icon: Pin, label: "Internal" },
  other: { icon: Pin, label: "Other" },
  // legacy / auto types
  review: { icon: UsersIcon, label: "Partner Review" },
  customer: { icon: UsersIcon, label: "Customer" },
  escalation: { icon: AlertTriangle, label: "Escalation" },
  manual: { icon: Pin, label: "Manual" },
};

const RELATED_TYPE_LABEL: Record<string, string> = {
  client: "Client",
  deal: "Pipeline Opportunity",
  renewal: "Renewal",
  lead: "Incoming Lead",
  partner: "Partner",
  general: "General",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting: "Waiting",
  done: "Completed",
};

const STATUS_CHIP: Record<string, string> = {
  open: "bg-muted text-muted-foreground border-border",
  in_progress: "bg-info/10 text-info border-info/30",
  waiting: "bg-warning/10 text-warning-foreground border-warning/30",
  done: "bg-success/10 text-success border-success/30",
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
    { label: "Critical", value: data?.critical ?? 0, tone: "text-destructive" },
    { label: "Due today", value: data?.dueToday ?? 0, tone: "text-warning-foreground" },
    { label: "Revenue at stake", value: formatEur(data?.revenue ?? 0), tone: "text-foreground" },
    { label: "Time budget", value: formatDuration(data?.estMinutes ?? 0), tone: "text-foreground" },
  ];
  return (
    <Card>
      <div className="flex items-center gap-4 px-4 py-2.5 overflow-x-auto">
        <span className="text-[10px] font-semibold text-muted-foreground tracking-[0.12em] uppercase shrink-0">
          Today
        </span>
        <div className="flex items-center gap-5 flex-1">
          {items.map((it, i) => (
            <div key={it.label} className={cn("flex items-baseline gap-2 shrink-0", i > 0 && "pl-5 border-l border-border/60")}>
              <span className={cn("font-semibold tabular-nums text-base leading-none", it.tone)}>{it.value}</span>
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{it.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ---------- Workload + Team ---------- */

function WorkloadCard() {
  const { data } = useWorkload();
  const { data: today } = useTodaysFocus();
  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-[11px] font-semibold text-muted-foreground tracking-[0.12em] uppercase">My Workload</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm px-4 pb-3">
        <Row label="Open" value={data?.openCount ?? 0} />
        <Row label="Due today" value={today?.dueToday ?? 0} />
        <Row label="Overdue" value={data?.overdueCount ?? 0} tone={data?.overdueCount ? "text-destructive font-medium" : ""} />
        <Row label="Completed this week" value={data?.completedThisWeek ?? 0} />
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
  const { data: assignable } = useAssignableUsers();
  if (!data) return null;
  if ((assignable?.length ?? 0) < 4) return null;
  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-[11px] font-semibold text-muted-foreground tracking-[0.12em] uppercase">Team Distribution</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="space-y-1.5 text-sm max-h-60 overflow-y-auto pr-1">
          {data.slice(0, 12).map((m) => {
            const total = m.open || 1;
            const overduePct = Math.round((m.overdue / total) * 100);
            return (
              <div key={m.id} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs">{m.name}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{m.open} open · {m.completed} done</span>
                </div>
                <div className="h-1 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-destructive" style={{ width: `${overduePct}%` }} />
                </div>
                {m.overdue > 0 && (
                  <div className="text-[10px] text-destructive">{m.overdue} overdue · {m.critical} critical</div>
                )}
              </div>
            );
          })}
          {data.length === 0 && <div className="text-muted-foreground text-xs">No team activity yet.</div>}
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
  const updateStatus = useUpdateTaskStatus();
  const handleStatus = async (status: ManualTaskStatus) => {
    try {
      await updateStatus.mutateAsync({ task, status });
      toast.success(`Status: ${status}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update status");
    }
  };

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
              {/* task type chip */}
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] px-1.5 py-0 rounded border h-[18px]",
                  archived
                    ? "bg-transparent border-border/50 text-muted-foreground/80"
                    : "bg-muted border-border/60 text-muted-foreground",
                )}
              >
                <Icon className="h-2.5 w-2.5" />
                {meta.label}
              </span>
              {/* live status chip (Open / In Progress / Waiting) */}
              {!archived && task.status !== "done" && task.status !== "open" && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0 rounded border h-[18px] inline-flex items-center",
                    STATUS_CHIP[task.status] ?? STATUS_CHIP.open,
                  )}
                >
                  {STATUS_LABEL[task.status] ?? task.status}
                </span>
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
              <span>{RELATED_TYPE_LABEL[task.related_type ?? ""] ?? SOURCE_LABEL[task.source]}</span>

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
                  <DropdownMenuItem onSelect={() => handleComplete(true)}>Mark complete</DropdownMenuItem>
                )}
                {!archived && !task.is_auto && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Status
                    </div>
                    {(["Open", "In Progress", "Waiting"] as ManualTaskStatus[]).map((s) => (
                      <DropdownMenuItem key={s} onSelect={() => handleStatus(s)}>
                        Set to {s}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuSeparator />
                <ReschedulePopover task={task} onPick={handleReschedule}>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Reschedule…</DropdownMenuItem>
                </ReschedulePopover>
                <DropdownMenuItem onSelect={() => setOpenAssign(true)}>Assign…</DropdownMenuItem>
                {task.related_route && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to={task.related_route}>Open related record</Link>
                    </DropdownMenuItem>
                  </>
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
  const { user } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (o: boolean) => {
    onOpenChange ? onOpenChange(o) : setInternalOpen(o);
  };
  const { data: assignableUsers = [] } = useAssignableUsers();
  const create = useCreateManualTask();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [relatedType, setRelatedType] = useState<TaskRelatedType>("general");
  const [relatedId, setRelatedId] = useState<string | null>(null);
  const [relatedLabel, setRelatedLabel] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string>(user?.id ?? "");
  const [taskType, setTaskType] = useState<ManualTaskType>("other");
  const [status, setStatus] = useState<ManualTaskStatus>("Open");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [dueDate, setDueDate] = useState("");

  const reset = () => {
    setTitle(""); setNotes("");
    setRelatedType("general"); setRelatedId(null); setRelatedLabel(null);
    setOwnerId(user?.id ?? "");
    setTaskType("other"); setStatus("Open"); setPriority("Medium"); setDueDate("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Task</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">What needs to be done?</Label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Send proposal to Watsons"
              className="mt-1 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Related To</Label>
              <Select
                value={relatedType}
                onValueChange={(v: TaskRelatedType) => {
                  setRelatedType(v);
                  setRelatedId(null);
                  setRelatedLabel(null);
                }}
              >
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_RELATED_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{RELATED_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {relatedType !== "general" && (
              <div>
                <Label className="text-xs">Related Record</Label>
                <div className="mt-1">
                  <EntityCombobox
                    relatedType={relatedType}
                    value={relatedId}
                    onChange={(id, label) => { setRelatedId(id); setRelatedLabel(label); }}
                    placeholder={`Select ${RELATED_TYPE_LABEL[relatedType].toLowerCase()}`}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Owner</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Assign owner" /></SelectTrigger>
                <SelectContent>
                  {assignableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Task Type</Label>
              <Select value={taskType} onValueChange={(v: ManualTaskType) => setTaskType(v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_META[t]?.label ?? t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Critical", "High", "Medium", "Low"].map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v: ManualTaskStatus) => setStatus(v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["Open", "In Progress", "Waiting", "Completed"] as ManualTaskStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Context, links, or anything that helps execute this task"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!title.trim() || (relatedType !== "general" && !relatedId)}
            onClick={async () => {
              try {
                await create.mutateAsync({
                  title: title.trim(),
                  description: notes.trim() || undefined,
                  due_date: dueDate ? new Date(dueDate).toISOString() : null,
                  priority,
                  owner_user_id: ownerId || null,
                  task_type: taskType,
                  task_status: status,
                  related_type: relatedType,
                  related_entity_id: relatedId,
                  related_company: relatedLabel,
                });
                toast.success("Task created");
                setOpen(false);
                reset();
              } catch (e: any) { toast.error(e?.message ?? "Failed"); }
            }}
          >Create task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ---------- Mission Control: Priority Focus + Work Guidance ---------- */

const SOURCE_WEIGHT: Record<TaskSource, number> = {
  renewal: 5,
  pipeline: 4,
  partner: 3,
  customer: 3,
  certification: 2,
  lead: 2,
  manual: 1,
};

type Scored = { task: UnifiedTask; score: number; reason: string };

function scoreTask(t: UnifiedTask): Scored {
  const now = new Date();
  const due = t.due_date ? parseISO(t.due_date) : null;
  const overdue = due ? isPast(due) && !isToday(due) : false;
  const dueToday = due ? isToday(due) : false;

  let score = 0;
  if (t.priority === "Critical") score += 100;
  else if (t.priority === "High") score += 40;
  if (overdue) {
    const days = Math.max(1, Math.round((now.getTime() - due!.getTime()) / 86400000));
    score += 50 + Math.min(30, days);
  }
  if (dueToday) score += 25;
  if (t.revenue_impact > 0) score += Math.min(40, Math.log10(t.revenue_impact + 1) * 8);
  score += (SOURCE_WEIGHT[t.source] ?? 1) * 4;

  // Reason — pick strongest driver
  let reason = "Strategic follow-up";
  if (t.priority === "Critical" && overdue) reason = "Critical task — overdue and at risk";
  else if (t.priority === "Critical") reason = "Critical priority — act today";
  else if (overdue && t.revenue_impact > 0) reason = "Overdue with revenue at stake";
  else if (overdue) reason = "Overdue — unblock the next step";
  else if (t.source === "renewal") reason = "Renewal window approaching";
  else if (t.source === "pipeline" && t.revenue_impact > 0) reason = "Active pipeline opportunity";
  else if (dueToday) reason = "Due today — keep cadence";
  else if (t.revenue_impact > 0) reason = "Revenue at stake";

  return { task: t, score, reason };
}

function recommendWorkMode(tasks: UnifiedTask[]): { label: string; tone: "danger" | "warn" | "info" | "calm" } {
  if (tasks.length === 0) return { label: "No urgent work — use time for proactive outreach", tone: "calm" };
  const now = new Date();
  const overdue = tasks.filter((t) => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)));
  const criticalOverdue = overdue.filter((t) => t.priority === "Critical");
  if (criticalOverdue.length > 0) return { label: "Clear critical overdue tasks first", tone: "danger" };
  const overdueRenewals = overdue.filter((t) => t.source === "renewal");
  if (overdueRenewals.length > 0) return { label: "Focus on renewals at risk", tone: "warn" };
  const highValuePipeline = tasks.filter((t) => t.source === "pipeline" && t.revenue_impact >= 10000);
  if (highValuePipeline.length >= 2) return { label: "Protect high-value pipeline", tone: "info" };
  const dueToday = tasks.filter((t) => t.due_date && isToday(parseISO(t.due_date)));
  if (dueToday.length >= 3) return { label: "Power through today's queue", tone: "info" };
  if (tasks.length <= 3) return { label: "Low urgency today — maintain cadence", tone: "calm" };
  return { label: "Steady execution — work top-down by priority", tone: "calm" };
}

function PriorityFocus({ tasks }: { tasks: UnifiedTask[] }) {
  const open = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const top = useMemo(
    () => open.map(scoreTask).sort((a, b) => b.score - a.score).slice(0, 3),
    [open],
  );
  const mode = useMemo(() => recommendWorkMode(open), [open]);

  if (open.length === 0) return null;

  const toneClass =
    mode.tone === "danger" ? "bg-destructive/10 text-destructive border-destructive/20"
    : mode.tone === "warn" ? "bg-warning/10 text-warning-foreground border-warning/30"
    : mode.tone === "info" ? "bg-info/10 text-info border-info/30"
    : "bg-muted text-muted-foreground border-border";

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground tracking-[0.12em] uppercase">
            Priority Focus
          </span>
          <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border", toneClass)}>
            <Compass className="h-2.5 w-2.5" />
            {mode.label}
          </span>
        </div>
        {open.length > 3 && (
          <span className="text-[11px] text-muted-foreground">{open.length - 3} more in list</span>
        )}
      </div>
      <ol className="divide-y divide-border/60">
        {top.map(({ task }, i) => {
          const due = formatDue(task.due_date);
          const Body = (
            <div className="flex items-center gap-2.5 px-4 py-1.5 group">
              <span
                aria-hidden
                className={cn("h-1.5 w-1.5 rounded-full shrink-0", PRIORITY_ACCENT[task.priority])}
              />
              <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0">{task.title}</span>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 shrink-0 tabular-nums">
                {task.company_name && (
                  <>
                    <span className="font-medium text-foreground/80 truncate max-w-[140px]">{task.company_name}</span>
                    <span className="text-border">·</span>
                  </>
                )}
                <span>{RELATED_TYPE_LABEL[task.related_type ?? ""] ?? SOURCE_LABEL[task.source]}</span>
                {task.revenue_impact > 0 && (
                  <>
                    <span className="text-border">·</span>
                    <span className="text-foreground/80">{formatEur(task.revenue_impact)}</span>
                  </>
                )}
                <span className="text-border">·</span>
                <span className={cn(
                  due.tone === "danger" && "text-destructive font-medium",
                  due.tone === "warn" && "text-warning-foreground font-medium",
                )}>
                  {due.label}
                </span>
              </div>
              {task.related_route && (
                <ArrowRight className="h-3 w-3 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              )}
            </div>
          );
          return (
            <li key={task.id}>
              {task.related_route ? (
                <Link to={task.related_route} className="block hover:bg-muted/40 transition-colors">
                  {Body}
                </Link>
              ) : Body}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function WorkGuidance({ tasks }: { tasks: UnifiedTask[] }) {
  const lines = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "done");
    if (open.length === 0) return ["Inbox clear — no open work to interpret."];

    const now = new Date();
    const overdue = open.filter((t) => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)));
    const critical = open.filter((t) => t.priority === "Critical");

    // distribution by source
    const bySource = new Map<TaskSource, { count: number; revenue: number }>();
    for (const t of open) {
      const cur = bySource.get(t.source) || { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += t.revenue_impact || 0;
      bySource.set(t.source, cur);
    }
    const ranked = Array.from(bySource.entries()).sort((a, b) => b[1].count - a[1].count);
    const top = ranked[0];

    const out: string[] = [];
    if (top && top[1].count >= 2) {
      out.push(`Most urgent work is concentrated in ${SOURCE_LABEL[top[0]]} (${top[1].count} tasks).`);
    }

    const overdueRevenue = overdue.reduce((s, t) => s + (t.revenue_impact || 0), 0);
    const totalRevenue = open.reduce((s, t) => s + (t.revenue_impact || 0), 0);
    if (critical.length > 0 && overdue.length > 0 && critical.some((t) => overdue.includes(t))) {
      out.push("Critical overdue tasks represent most of today's revenue at stake.");
    } else if (overdueRevenue > 0 && totalRevenue > 0 && overdueRevenue / totalRevenue > 0.5) {
      out.push("Overdue tasks hold the majority of revenue at stake — prioritize them.");
    }

    const overdueRenewals = overdue.filter((t) => t.source === "renewal");
    if (overdueRenewals.length >= 2) {
      out.push("Renewal work is accumulating — review overdue renewals first.");
    }

    if (out.length === 0) {
      out.push("Workload is balanced. Focus on closing critical items.");
    }
    return out.slice(0, 2);
  }, [tasks]);

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-[11px] font-semibold text-muted-foreground tracking-[0.12em] uppercase flex items-center gap-2">
          <Compass className="h-3 w-3" />
          Work Guidance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-xs text-foreground/80 leading-snug px-4 pb-3">
        {lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </CardContent>
    </Card>
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
  const [relatedType, setRelatedTypeFilter] = useState<string>("all");
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "in_progress" | "waiting">("all");
  const [density, setDensity] = useState<Density>(() => {
    try { return (localStorage.getItem("tasks.density") as Density) || "comfortable"; }
    catch { return "comfortable"; }
  });
  useEffect(() => { try { localStorage.setItem("tasks.density", density); } catch {} }, [density]);

  const { data: tasks = [], isLoading } = useTasks({
    view, source, priority, search, ownerId,
    relatedType, taskType: taskTypeFilter, status: statusFilter,
  });

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
  if (relatedType !== "all") activeFilters.push({
    key: "relatedType", label: `Related: ${RELATED_TYPE_LABEL[relatedType] ?? relatedType}`,
    clear: () => setRelatedTypeFilter("all"),
  });
  if (taskTypeFilter !== "all") activeFilters.push({
    key: "taskType", label: `Type: ${TYPE_META[taskTypeFilter]?.label ?? taskTypeFilter}`,
    clear: () => setTaskTypeFilter("all"),
  });
  if (statusFilter !== "all") activeFilters.push({
    key: "status", label: `Status: ${STATUS_LABEL[statusFilter] ?? statusFilter}`,
    clear: () => setStatusFilter("all"),
  });
  if (search.trim()) activeFilters.push({
    key: "search", label: `"${search.trim()}"`, clear: () => setSearch(""),
  });
  const clearAll = () => {
    setSource("all"); setPriority("all"); setOwnerId("all"); setSearch("");
    setRelatedTypeFilter("all"); setTaskTypeFilter("all"); setStatusFilter("all");
  };


  return (
    <TooltipProvider delayDuration={250}>
    <div className="container mx-auto max-w-[1400px] px-4 py-4 space-y-3">
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
      {!isLoading && tasks.length > 0 && view !== "completed" && <PriorityFocus tasks={tasks} />}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        <div className="lg:col-span-3 space-y-3">
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
                <Select value={relatedType} onValueChange={setRelatedTypeFilter}>
                  <SelectTrigger className="h-8 w-[160px] bg-background"><SelectValue placeholder="Related to" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any relation</SelectItem>
                    {TASK_RELATED_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{RELATED_TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={taskTypeFilter} onValueChange={setTaskTypeFilter}>
                  <SelectTrigger className="h-8 w-[140px] bg-background"><SelectValue placeholder="Task type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any type</SelectItem>
                    {TASK_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_META[t]?.label ?? t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                  <SelectTrigger className="h-8 w-[130px] bg-background"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any status</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="waiting">Waiting</SelectItem>
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
                <div className="relative min-h-[60vh] max-h-[calc(100vh-220px)] overflow-y-auto">
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
          {!isLoading && <WorkGuidance tasks={tasks} />}
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

