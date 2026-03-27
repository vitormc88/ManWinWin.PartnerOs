import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { useCreateDealTask, TASK_STATUSES, TASK_PRIORITIES } from "@/hooks/useDealTasksCRUD";
import { usePartnerUsers } from "@/hooks/usePartnerUsers";
import { useHQUsers } from "@/hooks/useHQUsers";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dealId: string;
  dealCompanyName: string;
  linkedPartnerId: string | null;
}

export function AddDealTaskDialog({ open, onOpenChange, dealId, dealCompanyName, linkedPartnerId }: Props) {
  const { user } = useAuth();
  const createTask = useCreateDealTask();
  const { data: partnerUsers = [] } = usePartnerUsers(linkedPartnerId);
  const { data: hqUsers = [] } = useHQUsers();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedUserId, setAssignedUserId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("To Do");
  const [priority, setPriority] = useState("Medium");

  const reset = () => {
    setTitle("");
    setDescription("");
    setAssignedUserId("");
    setDueDate("");
    setStatus("To Do");
    setPriority("Medium");
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    createTask.mutate(
      {
        deal_id: dealId,
        title: title.trim(),
        description: description.trim() || undefined,
        assigned_user_id: assignedUserId || null,
        due_date: dueDate || null,
        status,
        priority,
        created_by: user?.id,
      },
      {
        onSuccess: async () => {
          if (assignedUserId && assignedUserId !== user?.id) {
            await supabase.from("notifications").insert({
              title: "New Task Assigned",
              message: `You have been assigned a new task: "${title}" for deal ${dealCompanyName}`,
              type: "task",
              category: "task_assigned",
              target_user_id: assignedUserId,
              action_url: `/deals/${dealId}`,
            });
          }
          toast.success("Task created");
          reset();
          onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details…" rows={3} />
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createTask.isPending}>
            {createTask.isPending ? "Creating…" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
