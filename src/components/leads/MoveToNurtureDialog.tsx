import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateIncomingLead } from "@/hooks/useIncomingLeads";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
}

export function MoveToNurtureDialog({ open, onOpenChange, leadId }: Props) {
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const updateLead = useUpdateIncomingLead();

  const submit = () => {
    updateLead.mutate(
      {
        id: leadId,
        status: "Nurture",
        engagement_status: "Nurture",
        nurture_reason: reason.trim() || null,
        nurture_until: until || null,
      } as any,
      {
        onSuccess: () => {
          toast.success("Moved to nurture");
          setReason("");
          setUntil("");
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
          <DialogTitle>Move to nurture</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Keep this lead visible and searchable for later. Useful when timing,
            budget or project readiness is wrong today.
          </p>
          <div>
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Project delayed, budget next year, evaluating later…"
              rows={3}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Follow up on (optional)</Label>
            <Input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={updateLead.isPending}>
            {updateLead.isPending ? "Saving…" : "Move to nurture"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
