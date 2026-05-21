import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { useCreateLeadTask, TASK_STATUSES, TASK_PRIORITIES } from "@/hooks/useLeadTasks";
import { LEAD_TASK_TEMPLATES } from "@/lib/qualification";
import { usePartnerUsers } from "@/hooks/usePartnerUsers";
import { useHQUsers } from "@/hooks/useHQUsers";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
  leadCompanyName: string;
  linkedPartnerId: string | null;
}

export function AddLeadTaskDialog({ open, onOpenChange, leadId, leadCompanyName, linkedPartnerId }: Props) {
  const { user } = useAuth();
  const createTask = useCreateLeadTask();
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
        lead_id: leadId,
        title: title.trim(),
        description: description.trim() || undefined,
        assigned_user_id: assignedUserId || null,
        due_date: dueDate || null,
        status,
        priority,
        created_by: user?.id,
      },
      {
        onSuccess: async (data) => {
          // Create in-app notification for assigned user
          if (assignedUserId && assignedUserId !== user?.id) {
            await supabase.from("notifications").insert({
              title: "New Task Assigned",
              message: `You have been assigned a new task: "${title}" for lead ${leadCompanyName}`,
              type: "task",
              category: "task_assigned",
              target_user_id: assignedUserId,
              action_url: `/incoming-leads/${leadId}`,
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
            <Label>Template</Label>
            <Select
              value=""
              onValueChange={(v) => {
                const tpl = LEAD_TASK_TEMPLATES.find((t) => t.id === v);
                if (!tpl) return;
                setTitle(tpl.title);
                setPriority(tpl.priority);
                setDescription(tpl.description || "");
                const d = new Date();
                d.setDate(d.getDate() + tpl.dueInDays);
                setDueDate(d.toISOString().split("T")[0]);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a qualification template…" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_TASK_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Prefills title, priority and due date. You can edit anything after.
            </p>
          </div>
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
