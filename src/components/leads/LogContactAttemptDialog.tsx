import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CONTACT_CHANNELS, CONTACT_OUTCOMES, CHANNEL_LABEL, OUTCOME_LABEL,
  useLogContactAttempt, type ContactChannel, type ContactOutcome,
} from "@/hooks/useLeadContactAttempts";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
}

export function LogContactAttemptDialog({ open, onOpenChange, leadId }: Props) {
  const [channel, setChannel] = useState<ContactChannel>("call");
  const [outcome, setOutcome] = useState<ContactOutcome>("no_answer");
  const [notes, setNotes] = useState("");
  const log = useLogContactAttempt();

  const reset = () => {
    setChannel("call");
    setOutcome("no_answer");
    setNotes("");
  };

  const submit = () => {
    log.mutate(
      { lead_id: leadId, channel, outcome, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Contact attempt logged");
          reset();
          onOpenChange(false);
        },
        onError: (e: any) => toast.error(e.message || "Failed to log attempt"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log contact attempt</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as ContactChannel)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Outcome</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as ContactOutcome)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>{OUTCOME_LABEL[o]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened? Any next step?"
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={log.isPending}>
            {log.isPending ? "Saving…" : "Log attempt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
