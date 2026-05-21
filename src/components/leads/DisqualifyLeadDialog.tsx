import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateIncomingLead } from "@/hooks/useIncomingLeads";
import { toast } from "sonner";

export const DISQUALIFY_REASONS = [
  "No response",
  "No budget",
  "No project / timing",
  "Not a fit",
  "Existing CMMS locked-in",
  "Student / research only",
  "Duplicate lead",
  "Invalid contact",
  "Too small",
  "Competitor selected",
  "No urgency",
] as const;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
}

export function DisqualifyLeadDialog({ open, onOpenChange, leadId }: Props) {
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  const updateLead = useUpdateIncomingLead();

  const submit = () => {
    if (!reason) {
      toast.error("Select a disqualification reason");
      return;
    }
    const composed = notes.trim()
      ? `${reason} — ${notes.trim()}`
      : reason;
    updateLead.mutate(
      {
        id: leadId,
        status: "Rejected",
        qualification_stage: "Disqualified",
        disqualified_reason: composed,
      } as any,
      {
        onSuccess: () => {
          toast.success("Lead disqualified");
          setReason("");
          setNotes("");
          onOpenChange(false);
        },
        onError: (e: any) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disqualify lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Disqualifying captures structured reasons for later reporting.
            Use <span className="font-medium">Move to nurture</span> instead if the
            lead may come back later.
          </p>
          <div>
            <Label className="text-xs">Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select a reason…" /></SelectTrigger>
              <SelectContent>
                {DISQUALIFY_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional context…"
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={updateLead.isPending}>
            {updateLead.isPending ? "Saving…" : "Disqualify lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
