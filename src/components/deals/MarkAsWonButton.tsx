import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { useDealProposals } from "@/hooks/useProposals";
import { ConvertProposalDialog } from "@/components/proposals/ConvertProposalDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StageGateDialog } from "@/components/commercial/StageGateDialog";
import { dealStageGate, type GateResult } from "@/lib/pipeline-gates";
import { loadDealGateContext } from "@/lib/pipeline-gate-context";
import { useLogStageGateOverride } from "@/hooks/useAgreedNextSteps";

interface Props {
  deal: any;
}

export function MarkAsWonButton({ deal }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [gate, setGate] = useState<GateResult | null>(null);
  const logOverride = useLogStageGateOverride();
  const { data: proposals = [] } = useDealProposals(deal?.id);
  const eligible = useMemo(() => proposals.filter((p) =>
    ["Ready", "Sent", "Accepted", "Won"].includes(p.status)), [proposals]);

  const isWon = deal?.stage === "Won";

  const requestWonFlow = async () => {
    if (eligible.length === 0) {
      toast.error("Create a proposal and mark it Ready before awarding this opportunity.");
      return;
    }
    setSelectedProposalId((current) => current && eligible.some((p) => p.id === current)
      ? current : eligible[0].id);
    if (isWon) {
      setConfirmOpen(true);
      return;
    }
    setWorking(true);
    try {
      const context = await loadDealGateContext(deal);
      const result = dealStageGate("Won", context);
      setGate(result);
      if (result.status === "ok") setConfirmOpen(true);
      else setGateOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Could not verify the evidence required to mark this deal as Won");
    } finally {
      setWorking(false);
    }
  };

  const continueWithOverride = async (reason: string | null) => {
    if (!gate || !reason) return;
    setWorking(true);
    try {
      await logOverride.mutateAsync({
        entity_type: "deal",
        deal_id: deal.id,
        from_stage: deal.stage,
        to_stage: "Won",
        missing_evidence: gate.missingKeys,
        reason,
      });
      setGateOpen(false);
      setConfirmOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Could not record the stage-gate override");
    } finally {
      setWorking(false);
    }
  };

  const runWonFlow = () => {
    if (!selectedProposalId) return;
    setConfirmOpen(false);
    setConvertOpen(true);
  };

  return (
    <>
      <Button
        size="sm"
        variant={isWon ? "outline" : "default"}
        onClick={requestWonFlow}
        disabled={working}
        className={isWon ? "" : "bg-success text-success-foreground hover:bg-success/90"}
      >
        <Trophy className="h-3.5 w-3.5 mr-1.5" />
        {isWon ? "Complete Award" : "Mark as Won"}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Choose the awarded proposal</AlertDialogTitle>
            <AlertDialogDescription>
              The deal becomes Won only after the selected proposal, client, license,
              contract and renewal are saved together.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Select value={selectedProposalId || ""} onValueChange={setSelectedProposalId}>
            <SelectTrigger><SelectValue placeholder="Select proposal" /></SelectTrigger>
            <SelectContent>
              {eligible.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  v{p.version} · {p.status} · {Number(p.total_year_1 || 0).toLocaleString("en-GB")}€ Year 1
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={working || !selectedProposalId} onClick={(e) => { e.preventDefault(); runWonFlow(); }}>
              Review conversion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {gate && (
        <StageGateDialog
          open={gateOpen}
          onOpenChange={setGateOpen}
          fromStage={deal.stage}
          toStage="Won"
          gate={gate}
          onConfirm={continueWithOverride}
          isPending={working || logOverride.isPending}
        />
      )}

      <ConvertProposalDialog open={convertOpen} onOpenChange={setConvertOpen}
        proposalId={selectedProposalId} />
    </>
  );
}
