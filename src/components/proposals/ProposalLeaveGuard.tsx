import { useEffect } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ProposalLeaveGuard({ open, dirty, busy = false, onKeep, onDiscard, onSave }: {
  open: boolean; dirty: boolean; busy?: boolean; onKeep: () => void; onDiscard: () => void; onSave?: () => void;
}) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  return <AlertDialog open={open} onOpenChange={value => { if (!value) onKeep(); }}>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Unsaved proposal changes</AlertDialogTitle>
      <AlertDialogDescription>Your changes have not been saved. Keep editing or save a preparation draft before leaving.</AlertDialogDescription>
    </AlertDialogHeader><AlertDialogFooter>
      <AlertDialogCancel disabled={busy} onClick={onKeep}>Keep editing</AlertDialogCancel>
      <Button variant="outline" disabled={busy} onClick={onDiscard}>Discard changes</Button>
      {onSave ? <Button disabled={busy} onClick={onSave}>Save draft and close</Button> : null}
    </AlertDialogFooter></AlertDialogContent>
  </AlertDialog>;
}
