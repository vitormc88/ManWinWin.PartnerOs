import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePartners } from "@/hooks/usePartners";
import { usePartnerUsers } from "@/hooks/usePartnerUsers";
import { useAssignableUsers } from "@/hooks/useAssignableUsers";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, CheckCircle2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ACTIVE_STAGES, getStageProbability } from "@/data/pipeline-stages";
import type { IncomingLead } from "@/hooks/useIncomingLeads";
import { leadToOpportunityGate } from "@/lib/pipeline-gates";
import { useDiscoveryRecord, useAttachDiscoveryToDeal } from "@/hooks/useDiscovery";
import { useAgreedNextSteps, useCarryNextStepsToDeal, useLogStageGateOverride } from "@/hooks/useAgreedNextSteps";
import { AlertTriangle, XCircle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: IncomingLead;
}

// Stages eligible as the entry point when a lead is already qualified.
// We never start a converted lead back at "Open Lead".
const PROMOTION_STAGES = ACTIVE_STAGES.filter(
  (s) => s.key === "Qualified" || s.key === "Demo" || s.key === "Proposal Sent"
);

const fitSummary = (lead: IncomingLead) => {
  const f: string[] = [];
  if ((lead as any).fit_pain_identified) f.push("Pain validated");
  if ((lead as any).fit_current_process_identified) f.push("Process mapped");
  if ((lead as any).fit_urgency_identified) f.push("Urgency");
  if ((lead as any).fit_decision_maker_identified) f.push("Decision maker");
  if ((lead as any).fit_operational_maturity) f.push("Operational maturity");
  if ((lead as any).fit_system_dissatisfaction) f.push("System dissatisfaction");
  return f;
};

export function ConvertToOpportunityDialog({ open, onOpenChange, lead }: Props) {
  const navigate = useNavigate();
  const { isHQ, profile } = useAuth();
  const userPartnerId = !isHQ ? profile?.partner_id : null;
  const { data: partners = [] } = usePartners();
  const partnerId = lead.linked_partner_id || userPartnerId || "";
  const { data: partnerUsers = [] } = usePartnerUsers(partnerId || null);
  const { data: assignableUsers = [] } = useAssignableUsers();
  const queryClient = useQueryClient();

  const ownerCandidates = (() => {
    const ids = new Set<string>();
    const merged: { id: string; full_name: string | null; email: string }[] = [];
    [...assignableUsers, ...partnerUsers].forEach((u: any) => {
      if (!ids.has(u.id)) { ids.add(u.id); merged.push(u); }
    });
    return merged;
  })();

  const [assignedUserId, setAssignedUserId] = useState<string>((lead as any).assigned_user_id || "");
  const [stage, setStage] = useState<string>("Qualified");
  const [expectedValue, setExpectedValue] = useState<string>("");
  const [strategicNotes, setStrategicNotes] = useState<string>("");
  const [showDetails, setShowDetails] = useState(false);
  const [creating, setCreating] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const { data: discovery } = useDiscoveryRecord({ leadId: lead.id });
  const { data: nextSteps = [] } = useAgreedNextSteps({ leadId: lead.id });
  const attachDiscovery = useAttachDiscoveryToDeal();
  const carryNextSteps = useCarryNextStepsToDeal();
  const logOverride = useLogStageGateOverride();

  const gate = leadToOpportunityGate({
    discovery: (discovery as any) ?? null,
    nextSteps: nextSteps as any,
    owner: assignedUserId || null,
    qualificationDecision: lead.status === "Qualified" ? "Qualified" : null,
  });
  const gateBlocked = gate.status === "block";
  const needsReason = gate.status === "warn" && !overrideReason.trim();

  const partnerName = partners.find((p) => p.id === partnerId)?.company_name || lead.linked_partner_name || "—";
  const fits = fitSummary(lead);

  const handlePromote = async () => {
    if (!lead.company_name) {
      toast.error("Company name is required on the lead before promotion");
      return;
    }
    if (gateBlocked) {
      toast.error(gate.missing[0] || "This lead is not ready to become an opportunity");
      return;
    }
    if (needsReason) {
      toast.error("Add a reason to continue with missing evidence");
      return;
    }
    setCreating(true);
    try {
      const owner = ownerCandidates.find((u) => u.id === assignedUserId);

      const { data: deal, error } = await supabase
        .from("deals")
        .insert({
          company_name: lead.company_name,
          contact_person_name: lead.contact_name || null,
          partner_id: partnerId || null,
          country: lead.country || null,
          industry: lead.sector || null,
          stage,
          expected_value: expectedValue ? parseFloat(expectedValue) : 0,
          probability: getStageProbability(stage),
          assigned_user_id: owner?.id || null,
          assigned_salesperson: owner?.full_name || null,
          lead_source: lead.lead_source || "HQ (Inbound)",
          notes: strategicNotes || null,
          status: "Open",
          contact_email: lead.email || null,
          contact_phone: lead.phone || null,
          job_role: lead.job_role || null,
          sector: lead.sector || null,
          asset_range: lead.asset_range || null,
          maintenance_team_size: lead.maintenance_team_size || null,
          register_date: new Date().toISOString().split("T")[0],
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      const { error: updateErr } = await supabase
        .from("incoming_leads")
        .update({ converted_to_deal_id: deal.id, status: "Converted" } as any)
        .eq("id", lead.id);
      if (updateErr) throw updateErr;

      // Keep one canonical discovery record and its agreed next steps.
      await attachDiscovery.mutateAsync({ leadId: lead.id, dealId: deal.id }).catch(() => null);
      await carryNextSteps.mutateAsync({ leadId: lead.id, dealId: deal.id }).catch(() => null);

      if (gate.status === "warn") {
        await logOverride
          .mutateAsync({
            entity_type: "lead",
            lead_id: lead.id,
            deal_id: deal.id,
            from_stage: lead.status || null,
            to_stage: stage,
            missing_evidence: gate.missingKeys,
            reason: overrideReason.trim(),
          })
          .catch(() => null);
      }

      toast.success("Promoted to pipeline");
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["incoming_leads"] });
      queryClient.invalidateQueries({ queryKey: ["incoming_lead", lead.id] });
      onOpenChange(false);
      navigate(`/deals/${deal.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to promote lead");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Promote to Pipeline
          </DialogTitle>
          <DialogDescription>
            Review the qualified lead before creating the sales opportunity.
          </DialogDescription>
        </DialogHeader>

        {/* Validated context — read-only summary */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            Qualified inbound lead
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div><span className="text-muted-foreground">Company: </span><span className="font-medium">{lead.company_name || "—"}</span></div>
            <div><span className="text-muted-foreground">Contact: </span><span className="font-medium">{lead.contact_name || "—"}</span></div>
            <div><span className="text-muted-foreground">Country: </span><span className="font-medium">{lead.country || "—"}</span></div>
            <div><span className="text-muted-foreground">Sector: </span><span className="font-medium">{lead.sector || "—"}</span></div>
            <div className="col-span-2"><span className="text-muted-foreground">Partner: </span><span className="font-medium">{partnerName}</span></div>
          </div>
          {fits.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {fits.map((f) => (
                <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success">{f}</span>
              ))}
            </div>
          )}
        </div>

        {/* Evidence gate */}
        {gate.requirements.length > 0 && gate.status !== "ok" && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium">
              {gateBlocked ? (
                <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
              )}
              {gateBlocked ? "Not ready to promote" : "Missing commercial evidence"}
            </div>
            <ul className="space-y-1">
              {gate.requirements.map((r) => (
                <li key={r.label} className="flex items-start gap-2 text-xs">
                  {r.met ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-success" aria-hidden="true" />
                  ) : r.blocking ? (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                  )}
                  <span className={r.met ? "text-muted-foreground" : ""}>{r.label}</span>
                </li>
              ))}
            </ul>
            {!gateBlocked && (
              <div>
                <Label className="text-xs">Reason to continue</Label>
                <Textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  rows={2}
                  placeholder="Recorded on the opportunity audit trail…"
                />
              </div>
            )}
          </div>
        )}

        {/* Focus inputs only */}
        <div className="space-y-3 mt-1">
          <div>
            <Label>Assigned seller</Label>
            <Select value={assignedUserId || "none"} onValueChange={(v) => setAssignedUserId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {ownerCandidates.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Expected value (€)</Label>
              <Input
                type="number"
                value={expectedValue}
                onChange={(e) => setExpectedValue(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Initial stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROMOTION_STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Strategic notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={strategicNotes}
              onChange={(e) => setStrategicNotes(e.target.value)}
              rows={2}
              placeholder="Anything the seller should know on day one…"
            />
          </div>

          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? "rotate-180" : ""}`} />
                {showDetails ? "Hide" : "Show"} pre-filled details
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>Email: <span className="text-foreground">{lead.email || "—"}</span></div>
              <div>Phone: <span className="text-foreground">{lead.phone || "—"}</span></div>
              <div>Role: <span className="text-foreground">{lead.job_role || "—"}</span></div>
              <div>Source: <span className="text-foreground">{lead.lead_source || "—"}</span></div>
              <div>Assets: <span className="text-foreground">{lead.asset_range || "—"}</span></div>
              <div>Team: <span className="text-foreground">{lead.maintenance_team_size || "—"}</span></div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePromote} disabled={creating || gateBlocked || needsReason}>
            {creating ? "Promoting…" : "Promote to Pipeline"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
