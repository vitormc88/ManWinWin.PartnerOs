import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarClock, Check, Plus, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { NEXT_STEP_TYPES, currentNextStep, isOverdue, nextStepTypeLabel } from "@/lib/next-steps";
import {
  useAgreedNextSteps,
  useCompleteNextStep,
  useSaveNextStep,
  type NextStepParent,
} from "@/hooks/useAgreedNextSteps";

export function NextStepPanel({ parent, readOnly }: { parent: NextStepParent; readOnly?: boolean }) {
  const { data: steps = [] } = useAgreedNextSteps(parent);
  const save = useSaveNextStep(parent);
  const complete = useCompleteNextStep(parent);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    step_type: "call",
    due_at: "",
    agreed_with_customer: false,
    customer_contact_name: "",
    source_activity: "",
    notes: "",
  });

  const current = currentNextStep(steps);

  const submit = () => {
    if (!form.title.trim()) return;
    save.mutate(
      {
        title: form.title.trim(),
        step_type: form.step_type,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        agreed_with_customer: form.agreed_with_customer,
        agreed_at: form.agreed_with_customer ? new Date().toISOString() : null,
        customer_contact_name: form.customer_contact_name.trim() || null,
        source_activity: form.source_activity.trim() || null,
        notes: form.notes.trim() || null,
      } as never,
      {
        onSuccess: () => {
          toast({ title: "Next step recorded" });
          setOpen(false);
          setForm({ title: "", step_type: "call", due_at: "", agreed_with_customer: false, customer_contact_name: "", source_activity: "", notes: "" });
        },
        onError: (e: unknown) =>
          toast({ title: "Could not save next step", description: (e as Error).message, variant: "destructive" }),
      }
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
          Agreed next step
        </CardTitle>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!current ? (
          <p className="text-sm text-muted-foreground">
            No next step recorded. Timing is not a next step — record what was actually agreed.
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-medium">{current.title}</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{nextStepTypeLabel(current.step_type)}</Badge>
              <Badge variant={current.agreed_with_customer ? "default" : "secondary"}>
                {current.agreed_with_customer ? "Agreed with customer" : "Not agreed with customer"}
              </Badge>
              {current.due_at && (
                <Badge variant={isOverdue(current) ? "destructive" : "secondary"}>
                  {isOverdue(current) ? "Overdue · " : ""}
                  {new Date(current.due_at).toLocaleDateString()}
                </Badge>
              )}
            </div>
            {current.customer_contact_name && (
              <p className="text-sm text-muted-foreground">Customer owner: {current.customer_contact_name}</p>
            )}
          </div>
        )}

        {steps.length > 0 && (
          <ul className="space-y-2 border-t border-border pt-3">
            {steps.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">
                  {s.title}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {s.status === "done" ? "completed" : s.status === "cancelled" ? "cancelled" : "open"}
                  </span>
                </span>
                {!readOnly && s.status === "open" && (
                  <>
                    <Button size="icon" variant="ghost" aria-label="Mark completed" onClick={() => complete.mutate({ id: s.id, status: "done" })}>
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Cancel next step" onClick={() => complete.mutate({ id: s.id, status: "cancelled" })}>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record an agreed next step</DialogTitle>
            <DialogDescription>
              A real commitment with an owner and a date — distinct from the customer's buying timing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ns-title">Action</Label>
              <Input id="ns-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.step_type} onValueChange={(v) => setForm({ ...form, step_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NEXT_STEP_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-due">Due</Label>
                <Input id="ns-due" type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-contact">Customer owner / contact</Label>
              <Input id="ns-contact" value={form.customer_contact_name} onChange={(e) => setForm({ ...form, customer_contact_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-source">Source meeting / activity</Label>
              <Input id="ns-source" value={form.source_activity} onChange={(e) => setForm({ ...form, source_activity: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ns-agreed"
                checked={form.agreed_with_customer}
                onCheckedChange={(v) => setForm({ ...form, agreed_with_customer: v === true })}
              />
              <Label htmlFor="ns-agreed">Agreed with the customer</Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-notes">Notes</Label>
              <Textarea id="ns-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!form.title.trim() || save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
