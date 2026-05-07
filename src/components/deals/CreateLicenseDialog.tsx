import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Sparkles } from "lucide-react";
import { useLeadProposals } from "@/hooks/useProposals";
import {
  LICENSE_TYPE_OPTIONS,
  createLicenseAndRenewal,
  computeRenewalDate,
  proposalToLicenseDefaults,
  type LicenseModel,
  type BillingFrequency,
} from "@/lib/lifecycle";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  dealId?: string;
  onSkip?: () => void;
}

export function CreateLicenseDialog({ open, onOpenChange, clientId, dealId, onSkip }: Props) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  // Pull proposals for the deal so we can inherit commercial structure
  const { data: proposals = [] } = useLeadProposals(dealId);
  const candidateProposals = useMemo(
    () =>
      [...proposals]
        .filter((p) => p.status !== "Lost")
        .sort(
          (a, b) =>
            // Prefer Won → Sent → Ready → Draft, then most recent
            ({ Won: 0, Sent: 1, Ready: 2, Draft: 3 } as any)[a.status] -
              ({ Won: 0, Sent: 1, Ready: 2, Draft: 3 } as any)[b.status] ||
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
    [proposals]
  );
  const [selectedProposalId, setSelectedProposalId] = useState<string>("");
  const selectedProposal = useMemo(
    () => candidateProposals.find((p) => p.id === selectedProposalId) || candidateProposals[0],
    [candidateProposals, selectedProposalId]
  );

  const [form, setForm] = useState({
    license_type: "Professional 1",
    license_model: "SaaS / UseIT" as LicenseModel,
    contract_start_date: new Date().toISOString().slice(0, 10),
    renewal_date: "",
    initial_contract_value: "",
    recurring_contract_value: "",
    billing_frequency: "Annual" as BillingFrequency,
    num_users: "",
    notes: "",
    source_proposal_id: "" as string,
  });

  // When a proposal becomes available (or selection changes), inherit defaults
  useEffect(() => {
    if (!open) return;
    if (!selectedProposal) return;
    const d = proposalToLicenseDefaults(selectedProposal);
    setForm((f) => ({
      ...f,
      license_type: d.license_type,
      license_model: d.license_model,
      billing_frequency: d.billing_frequency,
      initial_contract_value: String(d.initial_contract_value || ""),
      recurring_contract_value: String(d.recurring_contract_value || ""),
      num_users: d.num_users ? String(d.num_users) : "",
      notes: d.notes,
      source_proposal_id: d.source_proposal_id,
    }));
    setSelectedProposalId(selectedProposal.id);
  }, [open, selectedProposal?.id]);

  const autoRenewal = computeRenewalDate(form.contract_start_date, form.license_model, form.billing_frequency);
  const inherited = !!form.source_proposal_id;

  const submit = async (mode: "save_renewal" | "draft" | "skip") => {
    if (mode === "skip") {
      onSkip?.();
      onOpenChange(false);
      return;
    }
    setSubmitting(true);
    try {
      await createLicenseAndRenewal(
        {
          client_id: clientId,
          license_type: form.license_type,
          license_model: form.license_model,
          contract_start_date: form.contract_start_date,
          renewal_date: form.renewal_date || autoRenewal,
          initial_contract_value: form.initial_contract_value ? Number(form.initial_contract_value) : null,
          recurring_contract_value: form.recurring_contract_value ? Number(form.recurring_contract_value) : null,
          billing_frequency: form.billing_frequency,
          num_users: form.num_users ? Number(form.num_users) : null,
          notes: form.notes || null,
          is_draft: mode === "draft",
          source_proposal_id: form.source_proposal_id || null,
        },
        { dealId, createRenewal: mode === "save_renewal" }
      );
      toast.success(mode === "draft" ? "License saved as draft" : "Operationalization confirmed — license & renewal created");
      qc.invalidateQueries({ queryKey: ["licenses"] });
      qc.invalidateQueries({ queryKey: ["renewals"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["deal_activities", dealId] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to operationalize license");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {inherited ? "Confirm Operationalization" : "Create Client License"}
          </DialogTitle>
          <DialogDescription>
            {inherited
              ? "The approved proposal already defines the commercial structure. Review the operational data below and confirm — adjust only if something has changed."
              : "No proposal found for this deal — set up the initial license manually. A renewal will be auto-generated."}
          </DialogDescription>
        </DialogHeader>

        {candidateProposals.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 flex items-start gap-3">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="text-xs font-medium text-foreground flex items-center gap-2">
                Inheriting from approved proposal
                {selectedProposal && (
                  <Badge variant="outline" className="text-[10px]">
                    v{selectedProposal.version} · {selectedProposal.status}
                  </Badge>
                )}
              </div>
              <Select
                value={selectedProposalId || selectedProposal?.id || ""}
                onValueChange={setSelectedProposalId}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {candidateProposals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <FileText className="h-3 w-3" />v{p.version} · {p.status} · {p.product_family || "Professional"}
                        {p.total_year_1 ? ` · ${Math.round(p.total_year_1)}€ Y1` : ""}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mt-2">
          <div>
            <Label>License Type</Label>
            <Select value={form.license_type} onValueChange={(v) => setForm((f) => ({ ...f, license_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LICENSE_TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>License Model</Label>
            <Select value={form.license_model} onValueChange={(v) => setForm((f) => ({ ...f, license_model: v as LicenseModel }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SaaS / UseIT">SaaS / UseIT</SelectItem>
                <SelectItem value="Perpetual / KeepIT">Perpetual / KeepIT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Contract Start Date</Label>
            <Input type="date" value={form.contract_start_date} onChange={(e) => setForm((f) => ({ ...f, contract_start_date: e.target.value }))} />
          </div>
          <div>
            <Label>Renewal Date</Label>
            <Input type="date" value={form.renewal_date || autoRenewal || ""} onChange={(e) => setForm((f) => ({ ...f, renewal_date: e.target.value }))} />
          </div>

          <div>
            <Label>Billing Frequency</Label>
            <Select value={form.billing_frequency} onValueChange={(v) => setForm((f) => ({ ...f, billing_frequency: v as BillingFrequency }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Annual">Annual</SelectItem>
                <SelectItem value="Monthly">Monthly</SelectItem>
                <SelectItem value="One-time">One-time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Number of users / licenses</Label>
            <Input type="number" min={0} value={form.num_users} onChange={(e) => setForm((f) => ({ ...f, num_users: e.target.value }))} />
          </div>

          <div>
            <Label>Initial Contract Value — Year 1 (€)</Label>
            <Input
              type="number"
              min={0}
              value={form.initial_contract_value}
              onChange={(e) => setForm((f) => ({ ...f, initial_contract_value: e.target.value }))}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Includes setup / implementation (one-time + Y1 recurring).</p>
          </div>
          <div>
            <Label>Recurring Contract Value — Year 2+ (€)</Label>
            <Input
              type="number"
              min={0}
              value={form.recurring_contract_value}
              onChange={(e) => setForm((f) => ({ ...f, recurring_contract_value: e.target.value }))}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Used for ARR & renewal estimates.</p>
          </div>

          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" disabled={submitting} onClick={() => submit("skip")}>Skip for now</Button>
          <Button variant="outline" disabled={submitting} onClick={() => submit("draft")}>Save as Draft</Button>
          <Button disabled={submitting} onClick={() => submit("save_renewal")}>
            {inherited ? "Confirm & Activate Renewal" : "Save & Create Renewal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
