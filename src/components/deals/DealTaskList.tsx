import { useDealTasksEnhanced, useUpdateDealTask, useDeleteDealTask, DealTask } from "@/hooks/useDealTasksCRUD";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, Pencil } from "lucide-react";
import { format, isPast, isToday, parseISO } from "date-fns";
import { toast } from "sonner";
import { useState } from "react";
import { AddDealTaskDialog } from "./AddDealTaskDialog";
import { EditDealTaskDialog } from "./EditDealTaskDialog";

interface Props {
  dealId: string;
  dealCompanyName: string;
  linkedPartnerId: string | null;
}

const statusStyle = (s: string) => {
  switch (s) {
    case "To Do": return "bg-muted text-muted-foreground";
    case "In Progress": return "bg-info/10 text-info-foreground border-info/20";
    case "Done": return "bg-success/10 text-success-foreground border-success/20";
    default: return "bg-muted text-muted-foreground";
  }
};

const priorityStyle = (p: string) => {
  switch (p) {
    case "High": return "bg-destructive/10 text-destructive border-destructive/20";
    case "Medium": return "bg-warning/10 text-warning-foreground border-warning/20";
    case "Low": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-muted-foreground";
  }
};

const dueDateColor = (date: string | null) => {
  if (!date) return "";
  const d = parseISO(date);
  if (isPast(d) && !isToday(d)) return "text-destructive font-medium";
  if (isToday(d)) return "text-warning font-medium";
  return "text-muted-foreground";
};

export function DealTaskList({ dealId, dealCompanyName, linkedPartnerId }: Props) {
  const { data: tasks = [], isLoading } = useDealTasksEnhanced(dealId);
  const updateTask = useUpdateDealTask();
  const deleteTask = useDeleteDealTask();
  const [showAdd, setShowAdd] = useState(false);
  const [editTask, setEditTask] = useState<DealTask | null>(null);

  const handleToggleDone = (task: DealTask) => {
    const newStatus = task.status === "Done" ? "To Do" : "Done";
    updateTask.mutate(
      {
        id: task.id,
        deal_id: task.deal_id,
        status: newStatus,
        completed_at: newStatus === "Done" ? new Date().toISOString() : null,
      },
      {
        onSuccess: () => toast.success(newStatus === "Done" ? "Task completed" : "Task reopened"),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const handleDelete = (task: DealTask) => {
    deleteTask.mutate(
      { id: task.id, dealId: task.deal_id },
      {
        onSuccess: () => toast.success("Task deleted"),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Loading tasks…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Tasks ({tasks.length})</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No tasks yet. Add one to get started.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`flex items-start gap-3 p-3 rounded-lg border bg-card transition-opacity ${task.status === "Done" ? "opacity-60" : ""}`}
            >
              <Checkbox
                checked={task.status === "Done"}
                onCheckedChange={() => handleToggleDone(task)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${task.status === "Done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {task.title}
                  </span>
                  <Badge className={`text-[10px] px-1.5 py-0 ${statusStyle(task.status)}`}>{task.status}</Badge>
                  <Badge className={`text-[10px] px-1.5 py-0 ${priorityStyle(task.priority)}`}>{task.priority}</Badge>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {task.assigned_user && (
                    <span>→ {task.assigned_user.full_name || task.assigned_user.email}</span>
                  )}
                  {!task.assigned_user && task.assigned_to && (
                    <span>→ {task.assigned_to}</span>
                  )}
                  {task.due_date && (
                    <span className={dueDateColor(task.due_date)}>
                      Due {format(parseISO(task.due_date), "dd MMM yyyy")}
                    </span>
                  )}
                </div>
                {task.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditTask(task)}>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDelete(task)}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AddDealTaskDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        dealId={dealId}
        dealCompanyName={dealCompanyName}
        linkedPartnerId={linkedPartnerId}
      />

      {editTask && (
        <EditDealTaskDialog
          open={!!editTask}
          onOpenChange={(v) => { if (!v) setEditTask(null); }}
          task={editTask}
          dealCompanyName={dealCompanyName}
          linkedPartnerId={linkedPartnerId}
        />
      )}
    </div>
  );
}
