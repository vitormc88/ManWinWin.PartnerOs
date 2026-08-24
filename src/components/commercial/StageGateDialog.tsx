import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { GateResult } from "@/lib/pipeline-gates";

/**
 * Shows the commercial evidence expected before a stage advance.
 * Blocking requirements stop the move; warnings can be continued with a
 * recorded reason, which is written to the stage-gate audit trail.
 */
export function StageGateDialog({
  open,
  onOpenChange,
  fromStage,
  toStage,
  gate,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fromStage?: string | null;
  toStage: string;
  gate: GateResult;
  onConfirm: (reason: string | null) => void;
  isPending?: boolean;
}) {
  const [reason, setReason] = useState("");
  const blocked = gate.status === "block";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason("");
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Move {fromStage ? `from ${fromStage} ` : ""}to {toStage}
          </DialogTitle>
          <DialogDescription>
            {blocked
              ? "This move is blocked until the essential conditions below are met."
              : "Some commercial evidence is missing. You can continue, but the reason is recorded."}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {gate.requirements.map((r) => (
            <li key={r.label} className="flex items-start gap-2 text-sm">
              {r.met ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : r.blocking ? (
                <XCircle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" aria-hidden="true" />
              )}
              <span className={r.met ? "text-muted-foreground" : ""}>
                {r.label}
                {!r.met && r.blocking && <span className="ml-1 text-xs text-destructive">(required)</span>}
              </span>
            </li>
          ))}
        </ul>

        {!blocked && (
          <div className="space-y-1.5">
            <Label htmlFor="gate-reason">Reason for continuing</Label>
            <Textarea
              id="gate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is it right to advance without this evidence?"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={blocked || !reason.trim() || isPending}
            onClick={() => onConfirm(reason.trim() || null)}
          >
            Continue with reason
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
