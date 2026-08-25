import { useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { findOrCreateClientFromDeal } from "@/lib/lifecycle";
import { logSystemActivity } from "@/lib/activity-log";
import { CreateLicenseDialog } from "./CreateLicenseDialog";
import { getStageProbability } from "@/data/pipeline-stages";
import { StageGateDialog } from "@/components/commercial/StageGateDialog";
import { dealStageGate, type GateResult } from "@/lib/pipeline-gates";
import { loadDealGateContext } from "@/lib/pipeline-gate-context";
import { useLogStageGateOverride } from "@/hooks/useAgreedNextSteps";

interface Props {
  deal: any;
}

export function MarkAsWonButton({ deal }: Props) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [gate, setGate] = useState<GateResult | null>(null);
  const logOverride = useLogStageGateOverride();

  const isWon = deal?.stage === "Won";

  const requestWonFlow = async () => {
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

  const runWonFlow = async () => {
    setWorking(true);
    try {
      const wasAlreadyWon = isWon;

      // 1. Update stage if not already Won (idempotent)
      if (!wasAlreadyWon) {
        const { error } = await supabase
          .from("deals")
          .update({
            stage: "Won",
            status: "Won",
            probability: getStageProbability("Won"),
            stage_entered_at: new Date().toISOString(),
          })
          .eq("id", deal.id);
        if (error) throw error;
        await logSystemActivity(deal.id, "Lead marked as Won", `Stage changed from ${deal.stage} to Won.`);
      }

      // 2. Find or create client
      const { client, created } = await findOrCreateClientFromDeal(deal);
      setClientId(client.id);

      if (!created) {
        toast.message("Existing client found — linked to current deal.", { description: client.commercial_name });
      } else {
        toast.success(`Client ${client.client_code} created`);
      }

      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["deal", deal.id] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["deal_activities", deal.id] });

      // 3. Open license modal (only if no license exists yet for this client)
      const { count } = await supabase
        .from("licenses")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id);
      if ((count ?? 0) === 0) {
        setLicenseOpen(true);
      } else {
        toast.message("Client already has a license — skipping license setup.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to mark as Won");
    } finally {
      setWorking(false);
      setConfirmOpen(false);
    }
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
        {isWon ? "Set Up License" : "Mark as Won"}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isWon ? "Set up license for this won deal?" : "Mark this deal as Won?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isWon
                ? "We'll open the license setup flow for the linked client."
                : "This will move the deal to Won, create (or link) a client record, and let you set up the initial license and renewal."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={working} onClick={(e) => { e.preventDefault(); runWonFlow(); }}>
              {isWon ? "Continue" : "Yes, mark as Won"}
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

      {clientId && (
        <CreateLicenseDialog
          open={licenseOpen}
          onOpenChange={setLicenseOpen}
          clientId={clientId}
          dealId={deal.id}
          onSkip={() => {
            toast.message("License setup skipped — client will show 'Missing license configuration'.");
          }}
        />
      )}
    </>
  );
}
