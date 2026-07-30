import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

export interface ContractLineDeleteTarget {
  id: string;
  description?: string | null;
  amount?: number | null;
  currency?: string | null;
}

interface Props {
  line: ContractLineDeleteTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called ONLY after an explicit confirmation. */
  onConfirm: (line: ContractLineDeleteTarget) => Promise<void> | void;
}

/**
 * Explicit confirmation before removing a financial element of a contract.
 * No cascade, no extra operation — just this line.
 */
export function ContractLineDeleteDialog({ line, open, onOpenChange, onConfirm }: Props) {
  const [pending, setPending] = useState(false);

  const amount =
    line && line.amount != null
      ? new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: line.currency || "EUR",
          maximumFractionDigits: 2,
        }).format(Number(line.amount))
      : null;

  const handleConfirm = async () => {
    if (!line || pending) return; // guards double-click
    setPending(true);
    try {
      await onConfirm(line);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!pending) onOpenChange(v); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove contract line?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes a financial element of the contract:{" "}
            <span className="font-medium text-foreground">
              {line?.description?.trim() || "Untitled line"}
            </span>
            {amount ? <> — <span className="font-medium text-foreground">{amount}</span></> : null}.
            {" "}Contract totals, ARR and Year 1 value will be recalculated. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void handleConfirm(); }}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? (<><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Removing…</>) : "Remove line"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
