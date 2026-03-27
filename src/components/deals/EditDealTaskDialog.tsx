import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { useUpdateDealTask, useDeleteDealTask, TASK_STATUSES, TASK_PRIORITIES, DealTask } from "@/hooks/useDealTasksCRUD";
import { usePartnerUsers } from "@/hooks/usePartnerUsers";
import { useHQUsers } from "@/hooks/useHQUsers";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: DealTask;
  dealCompanyName: string;
  linkedPartnerId: string | null;
}

export function EditDealTaskDialog({ open, onOpenChange, task, dealCompanyName, linkedPartnerId }: Props) {
  const updateTask = useUpdateDealTask();
  const deleteTask = useDeleteDealTask();
  const { data: partnerUsers = [] } = usePartnerUsers(linkedPartnerId);
  const { data: hqUsers = [] } = useHQUsers();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [assignedUserId, setAssignedUserId] = useState(task.assigned_user_id || "");
  const [dueDate, setDueDate] = useState(task.due_date || "");
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);

  useEffect(() => {
    if (open) {
      setTitle(task.title);
      setDescription(task.description || "");
      setAssignedUserId(task.assigned_user_id || "");
      setDueDate(task.due_date || "");
      setStatus(task.status);
      setPriority(task.priority);
    }
  }, [open, task]);

  const handleSave = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    updateTask.mutate(
      {
        id: task.id,
        deal_id: task.deal_id,
        title: title.trim(),
        description: description.trim() || undefined,
        assigned_user_id: assignedUserId || null,
        due_date: dueDate || null,
        status,
        priority,
        completed_at: status === "Done" ? (task.completed_at || new Date().toISOString()) : null,
      },
      {
        onSuccess: () => { toast.success("Task updated"); onOpenChange(false); },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const handleDelete = () => {
    deleteTask.mutate(
      { id: task.id, dealId: task.deal_id },
      {
        onSuccess: () => { toast.success("Task deleted"); onOpenChange(false); },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Assigned To</Label>
            <Select value={assignedUserId} onValueChange={setAssignedUserId}>
              <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
              <SelectContent>
                {linkedPartnerId && partnerUsers.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs font-semibold text-muted-foreground">Partner Users</SelectLabel>
                    {partnerUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || u.email || "Unnamed"}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                <SelectGroup>
                  <SelectLabel className="text-xs font-semibold text-muted-foreground">HQ Users</SelectLabel>
                  {hqUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email || "Unnamed"}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteTask.isPending}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateTask.isPending}>
              {updateTask.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
