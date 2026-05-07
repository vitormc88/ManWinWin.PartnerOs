import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { useCreateDealTask, TASK_STATUSES, TASK_PRIORITIES, TASK_CATEGORIES } from "@/hooks/useDealTasksCRUD";
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
  defaults?: {
    title?: string;
    description?: string;
    priority?: string;
    status?: string;
    category?: string;
    assignedUserId?: string;
    dueDate?: string;
  };
}

export function AddDealTaskDialog({ open, onOpenChange, dealId, dealCompanyName, linkedPartnerId, defaults }: Props) {
  const { user } = useAuth();
  const createTask = useCreateDealTask();
  const { data: partnerUsers = [] } = usePartnerUsers(linkedPartnerId);
  const { data: hqUsers = [] } = useHQUsers();

  const [title, setTitle] = useState(defaults?.title || "");
  const [description, setDescription] = useState(defaults?.description || "");
  const [assignedUserId, setAssignedUserId] = useState<string>(defaults?.assignedUserId || "");
  const [dueDate, setDueDate] = useState(defaults?.dueDate || "");
  const [status, setStatus] = useState(defaults?.status || "To Do");
  const [priority, setPriority] = useState(defaults?.priority || "Medium");
  const [category, setCategory] = useState(defaults?.category || "Follow-up");

  useEffect(() => {
    if (open) {
      setTitle(defaults?.title || "");
      setDescription(defaults?.description || "");
      setAssignedUserId(defaults?.assignedUserId || "");
      setDueDate(defaults?.dueDate || "");
      setStatus(defaults?.status || "To Do");
      setPriority(defaults?.priority || "Medium");
      setCategory(defaults?.category || "Follow-up");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reset = () => {
    setTitle(defaults?.title || "");
    setDescription(defaults?.description || "");
    setAssignedUserId(defaults?.assignedUserId || "");
    setDueDate(defaults?.dueDate || "");
    setStatus(defaults?.status || "To Do");
    setPriority(defaults?.priority || "Medium");
    setCategory(defaults?.category || "Follow-up");
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    const allUsers = [...partnerUsers, ...hqUsers];
    const assignedUser = allUsers.find((u) => u.id === assignedUserId);
    const assignedName = assignedUser?.full_name || assignedUser?.email || null;

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
        assigned_user_name: assignedName,
      },
      {
        onSuccess: async () => {
          // Only notify when assigning to someone other than the current user
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
