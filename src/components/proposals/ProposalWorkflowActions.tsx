import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Send, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import {
  ACCEPTANCE_EVIDENCE_TYPES,
  DIFFERENCE_CATEGORIES,
  availableProposalActions,
  isRenewalProposal,
  workflowErrorMessages,
} from "@/lib/proposal-workflow";
import { useMarkProposalSent, useRecordAcceptance, useValidateProposal } from "@/hooks/useProposalWorkflow";

const today = () => new Date().toISOString().slice(0, 10);

function showErrors(e: unknown) {
  const msgs = workflowErrorMessages(e);
  toast.error(msgs[0], msgs.length > 1 ? { description: msgs.slice(1).join(" · ") } : undefined);
}

/** Validate / Mark Sent / Record acceptance — the only ways a proposal status advances. */
export function ProposalWorkflowActions({ proposal, size = "sm", disabled }: { proposal: any; size?: "sm" | "default"; disabled?: boolean }) {
  const { isHQ } = useAuth();
  const actions = availableProposalActions(proposal);
  const renewal = isRenewalProposal(proposal);
  const validate = useValidateProposal();
  const sent = useMarkProposalSent();
  const accept = useRecordAcceptance();

  const [diffOpen, setDiffOpen] = useState(false);
  const [diffMsg, setDiffMsg] = useState<string[]>([]);
  const [category, setCategory] = useState<string>("");
  const [note, setNote] = useState("");
  const [sentOpen, setSentOpen] = useState(false);
  const [sentDate, setSentDate] = useState(today());
  const [accOpen, setAccOpen] = useState(false);
  const [ev, setEv] = useState({ type: "", date: today(), reference: "", file: "", notes: "" });

  if (!actions.length) return null;

  const runValidate = async (cat?: string, n?: string) => {
    try {
      await validate.mutateAsync({ proposalId: proposal.id, differenceCategory: cat || null, differenceNote: n || null });
      toast.success(renewal ? "Proposal validated" : "Proposal marked Ready");
      setDiffOpen(false);
    } catch (e) {
      const msgs = workflowErrorMessages(e);
      if (renewal && msgs.some((m) => m.includes("difference category") || m.includes('"Other"'))) {
        setDiffMsg(msgs);
        setDiffOpen(true);
        return;
      }
      showErrors(e);
    }
  };

  return (
    <>
      {actions.includes("validate") && (
        <Button size={size} variant="default" disabled={disabled || validate.isPending} onClick={() => runValidate()} className="gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" />{renewal ? "Validate" : "Mark Ready"}
        </Button>
      )}
      {actions.includes("mark_sent") && (
        <Button size={size} variant="outline" disabled={disabled} onClick={() => setSentOpen(true)} className="gap-1">
          <Send className="h-3.5 w-3.5" />Mark Sent
        </Button>
      )}
      {actions.includes("record_acceptance") && (
        <Button size={size} variant="outline" disabled={disabled} onClick={() => setAccOpen(true)} className="gap-1">
          <FileCheck2 className="h-3.5 w-3.5" />Record acceptance
        </Button>
      )}

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Explain the difference</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            {diffMsg.map((m) => <p key={m} className="text-muted-foreground">{m}</p>)}
            <div className="space-y-1">
              <Label>Difference category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
                <SelectContent>{DIFFERENCE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Note {category === "other" ? "(required)" : "(optional)"}</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiffOpen(false)}>Cancel</Button>
            <Button disabled={!category || validate.isPending} onClick={() => runValidate(category, note)}>Validate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sentOpen} onOpenChange={setSentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Mark proposal as sent</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Use this when the proposal was sent to the client outside PartnerOS. Downloading a document does not mark it as sent.</p>
          <div className="space-y-1">
            <Label>Date sent</Label>
            <Input type="date" max={today()} value={sentDate} onChange={(e) => setSentDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSentOpen(false)}>Cancel</Button>
            <Button
              disabled={sent.isPending || !sentDate}
              onClick={async () => {
                try { await sent.mutateAsync({ proposalId: proposal.id, sentDate }); toast.success("Proposal marked as sent"); setSentOpen(false); }
                catch (e) { showErrors(e); }
              }}
            >Mark Sent</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accOpen} onOpenChange={setAccOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record client acceptance</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label>Evidence</Label>
              <Select value={ev.type} onValueChange={(v) => setEv((s) => ({ ...s, type: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose evidence type" /></SelectTrigger>
                <SelectContent>
                  {ACCEPTANCE_EVIDENCE_TYPES.filter((t) => t.value !== "internal_note" || isHQ).map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Acceptance date</Label>
              <Input type="date" max={today()} value={ev.date} onChange={(e) => setEv((s) => ({ ...s, date: e.target.value }))} />
            </div>
            {ev.type !== "internal_note" && (
              <>
                <div className="space-y-1">
                  <Label>Reference (PO number, email subject, document id)</Label>
                  <Input value={ev.reference} onChange={(e) => setEv((s) => ({ ...s, reference: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>File location (optional if a reference is given)</Label>
                  <Input value={ev.file} onChange={(e) => setEv((s) => ({ ...s, file: e.target.value }))} placeholder="e.g. link or document library path" />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label>Notes {ev.type === "internal_note" ? "(required — explain the exception)" : "(optional)"}</Label>
              <Textarea rows={3} value={ev.notes} onChange={(e) => setEv((s) => ({ ...s, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccOpen(false)}>Cancel</Button>
            <Button
              disabled={accept.isPending || !ev.type || !ev.date}
              onClick={async () => {
                try {
                  await accept.mutateAsync({ proposalId: proposal.id, evidenceType: ev.type, acceptanceDate: ev.date, reference: ev.reference, filePath: ev.file, notes: ev.notes });
                  toast.success("Acceptance recorded");
                  setAccOpen(false);
                } catch (e) { showErrors(e); }
              }}
            >Record acceptance</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
