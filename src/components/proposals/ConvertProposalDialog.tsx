import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, ChevronLeft, ChevronRight, Building2, Package, FileText, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildConversionPlan,
  convertProposalToCustomer,
  type ConversionPlan,
  type ContractLineDraft,
  type ConversionResult,
} from "@/lib/lifecycle-engine";
import { usePricingRules } from "@/hooks/useProposals";
import type { BusinessProposalMode } from "@/lib/lifecycle";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string | null;
}

type Step = 1 | 2 | 3 | 4;

const STEPS: { id: Step; label: string; icon: any }[] = [
  { id: 1, label: "Customer", icon: Building2 },
  { id: 2, label: "License", icon: Package },
  { id: 3, label: "Contract", icon: FileText },
  { id: 4, label: "Summary", icon: Sparkles },
];

const fmt = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);

export function ConvertProposalDialog({ open, onOpenChange, proposalId }: Props) {
  const qc = useQueryClient();
  const { data: rules = [] } = usePricingRules();
  const [step, setStep] = useState<Step>(1);
  const [plan, setPlan] = useState<ConversionPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [awarded, setAwarded] = useState<BusinessProposalMode | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [lines, setLines] = useState<ContractLineDraft[]>([]);
  const [noticeDays, setNoticeDays] = useState<number>(90);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<ConversionResult | null>(null);

  // Reset everything when opening a different proposal.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setPlan(null);
    setAwarded(null);
    setSelectedClientId(null);
    setCreateNew(false);
    setLines([]);
    setNoticeDays(90);
    setStartDate(new Date().toISOString().slice(0, 10));
    setResult(null);
  }, [open, proposalId]);

  // Load plan (and reload when awarded mode is chosen for compare proposals).
  useEffect(() => {
    if (!open || !proposalId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const p = await buildConversionPlan(proposalId, { awardedMode: awarded, pricingRules: rules });
        if (cancelled) return;
        setPlan(p);
        setLines(p.contractLines);
        if (p.client.mode === "existing") setSelectedClientId(p.client.record.id);
      } catch (e: any) {
        toast.error(e?.message || "Failed to build conversion plan");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, proposalId, awarded, rules]);

  const needsAwardChoice = !!plan?.licenseDefaults.requires_award_choice;
  const contractTotal = useMemo(() => lines.reduce((s, l) => s + (l.amount || 0), 0), [lines]);

  const canAdvance = (): boolean => {
    if (!plan) return false;
    if (step === 1) {
      return !!selectedClientId || createNew;
    }
    if (step === 2) {
      return !needsAwardChoice;
    }
    if (step === 3) {
      return lines.length > 0 && contractTotal > 0;
    }
    return true;
  };

  const handleConfirm = async () => {
    if (!proposalId || !plan) return;
    setSubmitting(true);
    try {
      const res = await convertProposalToCustomer(
        proposalId,
        {
          existingClientId: createNew ? null : selectedClientId,
          awardedMode: awarded,
          contractLines: lines,
          noticePeriodDays: noticeDays,
          contractStartDate: startDate,
        },
        rules,
      );
      setResult(res);
      setStep(4);
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["deal", plan.proposal.lead_id] });
      qc.invalidateQueries({ queryKey: ["lifecycle-events"] });
      qc.invalidateQueries({ queryKey: ["renewals"] });
      toast.success("Customer created from proposal");
    } catch (e: any) {
      toast.error(e?.message || "Conversion failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Convert proposal to customer</DialogTitle>
          <DialogDescription>
            Auto-generates the client, license, contract, contract lines and renewal from this proposal. You can review each step before confirming.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-1.5 px-1 pb-3 border-b">
          {STEPS.map((s, i) => {
            const active = step === s.id;
            const done = result ? true : step > s.id;
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center gap-1.5 flex-1">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : done
                      ? "bg-success/10 text-success border-success/30"
                      : "bg-background text-muted-foreground border-border"
                  }`}
                >
                  {done && !active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                <span className={`text-xs ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
                {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
              </div>
            );
          })}
        </div>

        <ScrollArea className="max-h-[55vh] pr-3">
          {loading || !plan ? (
            <div className="space-y-3 py-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              {step === 1 && (
                <StepCustomer
                  plan={plan}
                  selectedClientId={selectedClientId}
                  createNew={createNew}
                  onSelect={(id) => {
                    setSelectedClientId(id);
                    setCreateNew(false);
                  }}
                  onCreateNew={() => {
                    setCreateNew(true);
                    setSelectedClientId(null);
                  }}
                />
              )}
              {step === 2 && (
                <StepLicense plan={plan} awarded={awarded} setAwarded={setAwarded} needsAwardChoice={needsAwardChoice} />
              )}
              {step === 3 && (
                <StepContract
                  lines={lines}
                  setLines={setLines}
                  contractTotal={contractTotal}
                  noticeDays={noticeDays}
                  setNoticeDays={setNoticeDays}
                  startDate={startDate}
                  setStartDate={setStartDate}
                />
              )}
              {step === 4 && result && <StepSummary result={result} />}
            </>
          )}
        </ScrollArea>

        <DialogFooter className="border-t pt-3">
          {step < 4 ? (
            <div className="flex w-full justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={step === 1 || submitting}
                onClick={() => setStep((s) => (Math.max(1, s - 1) as Step))}
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Back
              </Button>
              {step < 3 ? (
                <Button
                  size="sm"
                  disabled={!canAdvance() || submitting}
                  onClick={() => setStep((s) => (Math.min(3, s + 1) as Step))}
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              ) : (
                <Button size="sm" disabled={!canAdvance() || submitting} onClick={handleConfirm}>
                  {submitting ? "Converting…" : "Confirm & create"}
                </Button>
              )}
            </div>
          ) : (
            <Button size="sm" onClick={() => onOpenChange(false)} className="ml-auto">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Step 1 ----------
function StepCustomer({
  plan,
  selectedClientId,
  createNew,
  onSelect,
  onCreateNew,
}: {
  plan: ConversionPlan;
  selectedClientId: string | null;
  createNew: boolean;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
}) {
  const draft = plan.client.mode === "new" ? plan.client.draft : null;
  return (
    <div className="space-y-4 py-2">
      {plan.clientCandidates.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Possible existing customers ({plan.clientCandidates.length})
          </p>
          <div className="space-y-2">
            {plan.clientCandidates.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedClientId === c.id && !createNew
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.commercial_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.client_code} · {c.country || "—"} · {c.status}
                    </p>
                  </div>
                  {selectedClientId === c.id && !createNew && (
                    <Badge variant="secondary" className="text-[10px]">Selected</Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          No matching customer found. A new one will be created.
        </div>
      )}

      <Separator />

      <button
        onClick={onCreateNew}
        className={`w-full text-left p-3 rounded-lg border transition-colors ${
          createNew ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Create a new customer</p>
            <p className="text-[11px] text-muted-foreground">
              {draft?.commercial_name || plan.proposal.client_name} · {plan.proposal.country || "—"}
            </p>
          </div>
          {createNew && <Badge variant="secondary" className="text-[10px]">Selected</Badge>}
        </div>
      </button>
    </div>
  );
}

// ---------- Step 2 ----------
function StepLicense({
  plan,
  awarded,
  setAwarded,
  needsAwardChoice,
}: {
  plan: ConversionPlan;
  awarded: BusinessProposalMode | null;
  setAwarded: (m: BusinessProposalMode | null) => void;
  needsAwardChoice: boolean;
}) {
  const d = plan.licenseDefaults;
  return (
    <div className="space-y-3 py-2 text-sm">
      {needsAwardChoice && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-medium text-foreground mb-2">
              This proposal compares KeepIT vs UseIT. Choose the awarded option:
            </p>
            <div className="flex gap-2">
              <Button
                variant={awarded === "KeepIT" ? "default" : "outline"}
                size="sm"
                onClick={() => setAwarded("KeepIT")}
              >
                KeepIT
              </Button>
              <Button
                variant={awarded === "UseIT" ? "default" : "outline"}
                size="sm"
                onClick={() => setAwarded("UseIT")}
              >
                UseIT
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Product family" value={d.product_family} />
        <Field label="License type" value={d.license_type} />
        <Field label="Hosting" value={d.hosting} />
        <Field label="License model" value={d.license_model} />
        <Field label="Plan" value={d.plan?.toString() || "—"} />
        <Field label="Billing frequency" value={d.billing_frequency} />
        <Field label="Backoffice users" value={`${d.included_backoffice} + ${d.additional_backoffice}`} />
        <Field label="Web accesses" value={`${d.included_web} + ${d.additional_web}`} />
        <Field label="API" value={d.api_enabled ? "Yes" : "No"} />
        <Field label="Year 1 value" value={fmt(d.initial_contract_value)} />
        <Field label="Recurring (Year 2+)" value={`${fmt(d.recurring_contract_value)}/yr`} />
      </div>

      {d.modules.length > 0 && (
        <div>
          <Label className="text-xs text-muted-foreground">Modules & plugins</Label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {d.modules.map((m) => (
              <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

// ---------- Step 3 ----------
function StepContract({
  lines,
  setLines,
  contractTotal,
  noticeDays,
  setNoticeDays,
  startDate,
  setStartDate,
}: {
  lines: ContractLineDraft[];
  setLines: (l: ContractLineDraft[]) => void;
  contractTotal: number;
  noticeDays: number;
  setNoticeDays: (n: number) => void;
  startDate: string;
  setStartDate: (s: string) => void;
}) {
  const updateLine = (i: number, patch: Partial<ContractLineDraft>) => {
    const next = lines.slice();
    next[i] = { ...next[i], ...patch };
    setLines(next);
  };

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Contract start date</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8" />
        </div>
        <div>
          <Label className="text-xs">Renewal notice (days)</Label>
          <Input
            type="number"
            min={0}
            value={noticeDays}
            onChange={(e) => setNoticeDays(Number(e.target.value) || 0)}
            className="h-8"
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Contract lines (from proposal)</p>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">Type</th>
                <th className="text-left px-2 py-1.5 font-medium">Description</th>
                <th className="text-right px-2 py-1.5 font-medium">Amount</th>
                <th className="text-left px-2 py-1.5 font-medium">Billing</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-6">
                    No commercial items found in this proposal.
                  </td>
                </tr>
              ) : (
                lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">{l.line_type}</td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={l.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Input
                        type="number"
                        value={l.amount}
                        onChange={(e) => updateLine(i, { amount: Number(e.target.value) || 0 })}
                        className="h-7 text-xs text-right w-24 ml-auto"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{l.billing_frequency || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-muted/30 border-t">
              <tr>
                <td colSpan={2} className="px-2 py-2 text-right text-xs font-medium">
                  Calculated total
                </td>
                <td className="px-2 py-2 text-right text-sm font-semibold">{fmt(contractTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Totals are always calculated from the lines. Manual adjustments can be added later from the contract page.
        </p>
      </div>
    </div>
  );
}

// ---------- Step 4 ----------
function StepSummary({ result }: { result: ConversionResult }) {
  return (
    <div className="space-y-3 py-2">
      <Row done label="Client" detail={`${result.client.commercial_name} (${result.client.client_code})${result.clientWasCreated ? " — created" : " — linked"}`} />
      <Row done label="License" detail={`${result.license.product || result.license.license_model} — ${result.license.license_end_date || "no end date"}`} />
      <Row done label="Contract" detail={`${result.contractLines.length} line${result.contractLines.length === 1 ? "" : "s"} · total ${fmt(Number(result.contract.calculated_total || 0))}`} />
      <Row done={!!result.renewal} label="Renewal" detail={result.renewal ? `Scheduled for ${result.renewal.renewal_date}` : "Not scheduled"} />
      <Separator />
      <p className="text-xs text-muted-foreground">
        Every step above was recorded in the client's lifecycle timeline for full traceability.
      </p>
    </div>
  );
}

function Row({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <CheckCircle2 className={`h-4 w-4 mt-0.5 ${done ? "text-success" : "text-muted-foreground"}`} />
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
