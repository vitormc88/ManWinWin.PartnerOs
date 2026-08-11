import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { formatDateOnly } from "@/lib/date-format";
import { useToast } from "@/hooks/use-toast";
import { evaluateRenewalClosure, type RenewalOutcome } from "@/lib/renewal-closing";
import { useCloseRenewal, useRenewalClosureContext, closeRenewalErrorMessage } from "@/hooks/useRenewalClosing";

const LOSS_REASONS = [
  "Price / budget",
  "Lost to competitor",
  "Client closed or merged",
  "Dissatisfaction with product",
  "Moved to internal solution",
  "No longer needed",
  "Other",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renewal: any;
  clientName?: string | null;
}

export function CloseRenewalDialog({ open, onOpenChange, renewal, clientName }: Props) {
  const { toast } = useToast();
  const [outcome, setOutcome] = useState<RenewalOutcome>("renewed");
  const [effectiveDate, setEffectiveDate] = useState<string>(
    renewal?.renewal_date ? String(renewal.renewal_date).slice(0, 10) : ""
  );
  const [nextDate, setNextDate] = useState<string>("");
  const [lossReason, setLossReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const { data: ctx, isLoading } = useRenewalClosureContext(
    renewal?.id,
    renewal?.client_id,
    renewal?.contract_id ?? null,
    open
  );
  const closeRenewal = useCloseRenewal();

  const preview = useMemo(
    () =>
      evaluateRenewalClosure({
        renewal,
        proposal: ctx?.proposal ?? null,
        previousRecurringValue: ctx?.previousRecurring ?? 0,
        outcome,
        lossReason,
        effectiveDate: effectiveDate || null,
        nextRenewalDate: nextDate || null,
        hasContract: ctx ? ctx.hasContract : undefined,
      }),
    [renewal, ctx, outcome, lossReason, effectiveDate, nextDate]
  );

  const submit = async () => {
    try {
      const res = await closeRenewal.mutateAsync({
        renewalId: renewal.id,
        clientId: renewal.client_id,
        outcome,
        proposalId: outcome === "renewed" ? ctx?.proposal?.id ?? null : ctx?.proposal?.id ?? null,
        closingNotes: notes.trim() || null,
        lossReason: outcome === "lost" ? lossReason : null,
        effectiveDate: effectiveDate || null,
        nextRenewalDate: outcome === "renewed" ? nextDate || preview.nextRenewalDate : null,
      });
      if (res?.already_closed) {
        toast({ title: "Already closed", description: "This renewal had already been closed." });
      } else if (outcome === "renewed") {
        toast({
          title: "Renewal closed as Renewed",
          description: `Contract updated · next cycle on ${formatDateOnly(res?.next_renewal_date)}.`,
        });
      } else {
        toast({ title: "Renewal closed as Lost", description: "No next cycle was created." });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Could not close this renewal",
        description: closeRenewalErrorMessage(e),
        variant: "destructive",
      });
    }
  };

  const deltaTone =
    preview.deltaValue > 0 ? "text-success" : preview.deltaValue < 0 ? "text-destructive" : "text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Close renewal</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {clientName || "Client"} · this action is final and updates the contract.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOutcome("renewed")}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                outcome === "renewed" ? "border-success bg-success/10 text-success" : "hover:bg-secondary/50"
              }`}
            >
              <CheckCircle2 className="h-4 w-4" /> Renewed
            </button>
            <button
              type="button"
              onClick={() => setOutcome("lost")}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                outcome === "lost" ? "border-destructive bg-destructive/10 text-destructive" : "hover:bg-secondary/50"
              }`}
            >
              <XCircle className="h-4 w-4" /> Lost
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="eff-date">Renewal effective date</Label>
              <Input id="eff-date" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            {outcome === "renewed" && (
              <div className="space-y-1.5">
                <Label htmlFor="next-date">Next renewal date</Label>
                <Input
                  id="next-date"
                  type="date"
                  value={nextDate || preview.nextRenewalDate || ""}
                  onChange={(e) => setNextDate(e.target.value)}
                />
              </div>
            )}
          </div>

          {outcome === "lost" && (
            <div className="space-y-1.5">
              <Label>Loss reason</Label>
              <Select value={lossReason} onValueChange={setLossReason}>
                <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
                <SelectContent>
                  {LOSS_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="closing-notes">Closing notes {outcome === "renewed" ? "(optional)" : ""}</Label>
            <Textarea
              id="closing-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context for the commercial history…"
            />
          </div>

          {outcome === "renewed" && (
            <div className="rounded-lg border bg-secondary/30 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Impact preview</p>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading contract baseline…</p>
              ) : (
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-muted-foreground">Recurring before</span>
                  <span className="text-right tabular-nums">{formatMoney(preview.previousRecurring)}</span>
                  <span className="text-muted-foreground">Recurring after</span>
                  <span className="text-right tabular-nums font-medium">{formatMoney(preview.renewedRecurring)}</span>
                  <span className="text-muted-foreground">Change</span>
                  <span className={`text-right tabular-nums font-medium ${deltaTone}`}>
                    {preview.deltaValue >= 0 ? "+" : ""}
                    {formatMoney(preview.deltaValue)}
                    {preview.deltaPct !== null ? ` (${preview.deltaPct >= 0 ? "+" : ""}${preview.deltaPct.toFixed(1)}%)` : ""}
                  </span>
                  {preview.oneTimeValue > 0 && (
                    <>
                      <span className="text-muted-foreground">One-time this cycle</span>
                      <span className="text-right tabular-nums">{formatMoney(preview.oneTimeValue)}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">New contract period</span>
                  <span className="text-right tabular-nums text-xs">
                    {formatDateOnly(preview.effectiveDate)} → {formatDateOnly(preview.contractEndDate)}
                  </span>
                  <span className="text-muted-foreground">Next cycle</span>
                  <span className="text-right tabular-nums text-xs">{formatDateOnly(preview.nextRenewalDate)}</span>
                </div>
              )}
            </div>
          )}

          {!isLoading && preview.blockers.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
              {preview.blockers.map((b) => (
                <p key={b} className="flex items-start gap-2 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {b}
                </p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={closeRenewal.isPending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!preview.ok || isLoading || closeRenewal.isPending}
            variant={outcome === "lost" ? "destructive" : "default"}
          >
            {closeRenewal.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {outcome === "renewed" ? "Confirm renewal" : "Confirm loss"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
