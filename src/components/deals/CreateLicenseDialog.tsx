import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Sparkles, AlertTriangle } from "lucide-react";
import { useLeadProposals, usePricingRules } from "@/hooks/useProposals";
import {
  createLicenseAndRenewal,
  computeRenewalDate,
  proposalToLicenseDefaults,
  shouldCreateRenewal,
  requiresAwardChoice,
  type BillingFrequency,
  type Hosting,
  type ProductFamily,
  type BusinessProposalMode,
  type LicenseModel,
} from "@/lib/lifecycle";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  dealId?: string;
  onSkip?: () => void;
}

const FAMILY_OPTIONS: ProductFamily[] = ["Professional", "Business", "START", "Express"];

export function CreateLicenseDialog({ open, onOpenChange, clientId, dealId, onSkip }: Props) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const { data: proposals = [] } = useLeadProposals(dealId);
  const { data: pricingRules = [] } = usePricingRules();

  const candidateProposals = useMemo(
    () =>
      [...proposals]
        .filter((p) => p.status !== "Lost")
        .sort(
          (a, b) =>
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

  const isCompare = !!selectedProposal && requiresAwardChoice(selectedProposal);
  const [awarded, setAwarded] = useState<BusinessProposalMode | null>(null);

  const [form, setForm] = useState({
    product_family: "Professional" as ProductFamily,
    plan: 1 as number | null,
    proposal_mode: null as BusinessProposalMode | null,
    hosting: "SaaS" as Hosting,
    contract_start_date: new Date().toISOString().slice(0, 10),
    renewal_date: "",
    initial_contract_value: "",
    recurring_contract_value: "",
    billing_frequency: "Annual" as BillingFrequency,
    notes: "",
    source_proposal_id: "" as string,
    included_backoffice: 0,
    additional_backoffice: 0,
    included_web: 0,
    additional_web: 0,
    api_enabled: false,
    modules: [] as string[],
  });

  // Reset awarded option when switching proposals
  useEffect(() => {
    if (selectedProposal) setAwarded(null);
  }, [selectedProposal?.id]);

  // Inherit defaults from selected proposal (and awarded option, when in compare mode)
  useEffect(() => {
    if (!open || !selectedProposal) return;
    if (isCompare && !awarded) {
      // hold off populating commercial values until user picks
      const d = proposalToLicenseDefaults(selectedProposal, undefined, pricingRules);
      setForm((f) => ({
        ...f,
        product_family: d.product_family,
        proposal_mode: null,
        hosting: d.hosting,
        billing_frequency: d.billing_frequency,
        initial_contract_value: "",
        recurring_contract_value: "",
        notes: d.notes,
        source_proposal_id: d.source_proposal_id,
        included_backoffice: d.included_backoffice,
        additional_backoffice: d.additional_backoffice,
        included_web: d.included_web,
        additional_web: d.additional_web,
        api_enabled: d.api_enabled,
        modules: d.modules,
      }));
      setSelectedProposalId(selectedProposal.id);
      return;
    }

    const d = proposalToLicenseDefaults(selectedProposal, awarded || undefined, pricingRules);
    setForm((f) => ({
      ...f,
      product_family: d.product_family,
      plan: d.plan,
      proposal_mode: d.proposal_mode,
      hosting: d.hosting,
      billing_frequency: d.billing_frequency,
      initial_contract_value: String(d.initial_contract_value || ""),
      recurring_contract_value: String(d.recurring_contract_value || ""),
      notes: d.notes,
      source_proposal_id: d.source_proposal_id,
      included_backoffice: d.included_backoffice,
      additional_backoffice: d.additional_backoffice,
      included_web: d.included_web,
      additional_web: d.additional_web,
      api_enabled: d.api_enabled,
      modules: d.modules,
    }));
    setSelectedProposalId(selectedProposal.id);
  }, [open, selectedProposal?.id, awarded, isCompare, pricingRules.length]);

  const inherited = !!form.source_proposal_id;
  const isProfessional = form.product_family === "Professional";
  const isBusiness = form.product_family === "Business";

  const licenseType = useMemo(() => {
    if (isProfessional) return `Professional ${form.plan ?? 1}`;
    if (isBusiness) {
      if (!form.proposal_mode) return "Business (awaiting selection)";
      return `Business ${form.proposal_mode}`;
    }
    return form.product_family;
  }, [form.product_family, form.plan, form.proposal_mode, isProfessional, isBusiness]);

  const licenseModel: LicenseModel =
    isBusiness && form.proposal_mode === "KeepIT" ? "Perpetual" : "SaaS";

  const autoRenewal = computeRenewalDate(form.contract_start_date, licenseModel, form.billing_frequency);
  const willCreateRenewal = shouldCreateRenewal(form.product_family, form.proposal_mode);

  const blockedByAward = isCompare && !awarded;

  const submit = async (mode: "save_renewal" | "draft" | "skip") => {
    if (mode === "skip") {
      onSkip?.();
      onOpenChange(false);
      return;
    }
    if (blockedByAward) {
      toast.error("Select the awarded option (KeepIT or UseIT) before continuing.");
      return;
    }
    setSubmitting(true);
    try {
      await createLicenseAndRenewal(
        {
          client_id: clientId,
          license_type: licenseType,
          license_model: licenseModel,
          product_family: form.product_family,
          proposal_mode: isBusiness ? form.proposal_mode : null,
          hosting: form.hosting,
          contract_start_date: form.contract_start_date,
          renewal_date: form.renewal_date || autoRenewal,
          initial_contract_value: form.initial_contract_value ? Number(form.initial_contract_value) : null,
          recurring_contract_value: form.recurring_contract_value ? Number(form.recurring_contract_value) : null,
          billing_frequency: form.billing_frequency,
          num_users: (form.included_backoffice + form.additional_backoffice + form.included_web + form.additional_web) || null,
          notes: form.notes || null,
          is_draft: mode === "draft",
          source_proposal_id: form.source_proposal_id || null,
          included_backoffice: form.included_backoffice,
          additional_backoffice: form.additional_backoffice,
          included_web: form.included_web,
          additional_web: form.additional_web,
          api_enabled: form.api_enabled,
          modules: form.modules,
        },
        { dealId, createRenewal: mode === "save_renewal" && willCreateRenewal }
      );
      toast.success(mode === "draft" ? "License saved as draft" : "Operationalization confirmed");
      qc.invalidateQueries({ queryKey: ["licenses"] });
      qc.invalidateQueries({ queryKey: ["licensed_modules"] });
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{inherited ? "Confirm Operationalization" : "Set Up License"}</DialogTitle>
          <DialogDescription>
            {inherited
              ? "The approved proposal defines the commercial structure. Review and confirm — adjust only if something has changed."
              : "No proposal found — set up the initial license manually."}
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
              <Select value={selectedProposalId || selectedProposal?.id || ""} onValueChange={setSelectedProposalId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
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

        {isCompare && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="text-xs font-medium text-foreground">
                This proposal compares <strong>KeepIT</strong> vs <strong>UseIT</strong>. Select the awarded commercial option to operationalize.
              </div>
              <RadioGroup
                value={awarded || ""}
                onValueChange={(v) => setAwarded(v as BusinessProposalMode)}
                className="grid grid-cols-2 gap-2"
              >
                <label className="flex items-center gap-2 rounded-md border bg-background p-2 cursor-pointer hover:bg-muted/40">
                  <RadioGroupItem value="KeepIT" id="aw-keepit" />
                  <div className="text-xs">
                    <div className="font-medium">KeepIT</div>
                    <div className="text-muted-foreground">Perpetual + S&AT renewal</div>
                  </div>
                </label>
                <label className="flex items-center gap-2 rounded-md border bg-background p-2 cursor-pointer hover:bg-muted/40">
                  <RadioGroupItem value="UseIT" id="aw-useit" />
                  <div className="text-xs">
                    <div className="font-medium">UseIT</div>
                    <div className="text-muted-foreground">Annual subscription</div>
                  </div>
                </label>
              </RadioGroup>
            </div>
          </div>
        )}

        <div className={`grid grid-cols-2 gap-4 mt-2 ${blockedByAward ? "opacity-50 pointer-events-none" : ""}`}>
          <div>
            <Label>Product Family</Label>
            <Select
              value={form.product_family}
              onValueChange={(v) => {
                const family = v as ProductFamily;
                setForm((f) => ({
                  ...f,
                  product_family: family,
                  proposal_mode: family === "Business" ? (f.proposal_mode || "UseIT") : null,
                  hosting: family === "Business" ? f.hosting : "SaaS",
                  plan: family === "Professional" ? (f.plan || 1) : null,
                }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FAMILY_OPTIONS.map((fam) => <SelectItem key={fam} value={fam}>{fam}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isProfessional && (
            <div>
              <Label>Plan</Label>
              <Select value={String(form.plan ?? 1)} onValueChange={(v) => setForm((f) => ({ ...f, plan: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Plan 1</SelectItem>
                  <SelectItem value="2">Plan 2</SelectItem>
                  <SelectItem value="3">Plan 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isBusiness && form.proposal_mode && (
            <div>
              <Label>Awarded Mode</Label>
              <Select
                value={form.proposal_mode}
                onValueChange={(v) => setForm((f) => ({ ...f, proposal_mode: v as BusinessProposalMode }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UseIT">UseIT</SelectItem>
                  <SelectItem value="KeepIT">KeepIT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Hosting</Label>
            <Select
              value={form.hosting}
              onValueChange={(v) => setForm((f) => ({ ...f, hosting: v as Hosting }))}
              disabled={isProfessional}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SaaS">SaaS</SelectItem>
                <SelectItem value="On-Premise">On-Premise</SelectItem>
              </SelectContent>
            </Select>
            {isProfessional && (
              <p className="text-[10px] text-muted-foreground mt-1">Professional is SaaS-only.</p>
            )}
          </div>

          <div>
            <Label>Included BackOffice</Label>
            <Input type="number" min={0} value={form.included_backoffice}
              onChange={(e) => setForm((f) => ({ ...f, included_backoffice: parseInt(e.target.value) || 0 }))} />
            <p className="text-[10px] text-muted-foreground mt-1">Default included by license.</p>
          </div>
          <div>
            <Label>Additional BackOffice</Label>
            <Input type="number" min={0} value={form.additional_backoffice}
              onChange={(e) => setForm((f) => ({ ...f, additional_backoffice: parseInt(e.target.value) || 0 }))} />
            <p className="text-[10px] text-muted-foreground mt-1">Purchased extras.</p>
          </div>

          <div>
            <Label>Included Web/Mobile</Label>
            <Input type="number" min={0} value={form.included_web}
              onChange={(e) => setForm((f) => ({ ...f, included_web: parseInt(e.target.value) || 0 }))} />
          </div>
          <div>
            <Label>Additional Web/Mobile</Label>
            <Input type="number" min={0} value={form.additional_web}
              onChange={(e) => setForm((f) => ({ ...f, additional_web: parseInt(e.target.value) || 0 }))} />
          </div>

          <div className="col-span-2 flex items-center justify-between rounded-md border p-2">
            <div>
              <Label className="text-xs">API Access</Label>
              <p className="text-[10px] text-muted-foreground">Inherited from proposal configuration.</p>
            </div>
            <Switch checked={form.api_enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, api_enabled: v }))} />
          </div>

          <div>
            <Label>Contract Start Date</Label>
            <Input type="date" value={form.contract_start_date} onChange={(e) => setForm((f) => ({ ...f, contract_start_date: e.target.value }))} />
          </div>
          <div>
            <Label>Renewal Date</Label>
            <Input
              type="date"
              value={form.renewal_date || autoRenewal || ""}
              onChange={(e) => setForm((f) => ({ ...f, renewal_date: e.target.value }))}
              disabled={!willCreateRenewal}
            />
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
          <div />

          <div>
            <Label>Year 1 Value (€)</Label>
            <Input
              type="number" min={0}
              value={form.initial_contract_value}
              onChange={(e) => setForm((f) => ({ ...f, initial_contract_value: e.target.value }))}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Setup + Year 1 recurring.</p>
          </div>
          <div>
            <Label>Recurring Year 2+ Value (€)</Label>
            <Input
              type="number" min={0}
              value={form.recurring_contract_value}
              onChange={(e) => setForm((f) => ({ ...f, recurring_contract_value: e.target.value }))}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Used for ARR & renewals.</p>
          </div>

          {form.modules.length > 0 && (
            <div className="col-span-2">
              <Label>Inherited Modules & Plugins</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {form.modules.map((m) => (
                  <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Will be activated automatically on the operational license.
              </p>
            </div>
          )}

          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="col-span-2 rounded-md border bg-muted/20 p-3 text-xs space-y-1">
            <div className="font-medium text-foreground">License preview</div>
            <div className="text-muted-foreground">
              <span className="text-foreground">{licenseType}</span> · Hosting: <span className="text-foreground">{form.hosting}</span>
              {" · "}BackOffice: <span className="text-foreground">{form.included_backoffice + form.additional_backoffice}</span>
              {" · "}Web: <span className="text-foreground">{form.included_web + form.additional_web}</span>
              {form.api_enabled && " · API"}
              {!willCreateRenewal && <span className="ml-2">· No renewal by default</span>}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" disabled={submitting} onClick={() => submit("skip")}>Skip for now</Button>
          <Button variant="outline" disabled={submitting || blockedByAward} onClick={() => submit("draft")}>Save as Draft</Button>
          <Button disabled={submitting || blockedByAward} onClick={() => submit("save_renewal")}>
            {willCreateRenewal ? (inherited ? "Confirm & Activate Renewal" : "Save & Create Renewal") : "Confirm License"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
