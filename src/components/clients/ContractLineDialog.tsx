import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import {
  BILLING_FREQUENCY_OPTIONS,
  LINE_TYPE_OPTIONS,
  buildContractLineCreatePayload,
  buildContractLineUpdatePayload,
  contractLineFormFromRow,
  emptyContractLineForm,
  validateContractLineForm,
  type ContractLineFormState,
} from "@/lib/contract-line-payload";
import { UNCLASSIFIED_LABEL, UNCLASSIFIED_LINE_TYPE } from "@/lib/contract-lines";
import { useCreateContractLine, useUpdateContractLine, type ContractLine } from "@/hooks/useContractLines";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contractId: string;
  clientId?: string | null;
  defaultCurrency?: string;
  /** Present → edit mode. */
  line?: ContractLine | null;
}

export function ContractLineDialog({ open, onOpenChange, contractId, clientId, defaultCurrency = "EUR", line }: Props) {
  const mode: "create" | "edit" = line ? "edit" : "create";
  const create = useCreateContractLine();
  const update = useUpdateContractLine();
  const [form, setForm] = useState<ContractLineFormState>(emptyContractLineForm());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(line ? contractLineFormFromRow(line) : emptyContractLineForm({ currency: defaultCurrency }));
  }, [open, line, defaultCurrency]);

  const set = (k: keyof ContractLineFormState, v: any) => setForm((f) => ({ ...f, [k]: v }));

  // Only an explicit user selection marks the type as changed.
  const onTypeChange = (v: string) => setForm((f) => ({ ...f, lineType: v as any, typeChanged: true }));

  const keepsLegacyType = mode === "edit" && !form.typeChanged && form.lineType === UNCLASSIFIED_LINE_TYPE;

  const submit = async () => {
    const v = validateContractLineForm(form, mode);
    setErrors(v.errors);
    if (!v.ok) return;
    try {
      if (mode === "edit" && line) {
        await update.mutateAsync({ id: line.id, ...buildContractLineUpdatePayload(form) });
        toast.success("Contract line updated");
      } else {
        await create.mutateAsync(buildContractLineCreatePayload(form, { contract_id: contractId, client_id: clientId }));
        toast.success("Contract line added");
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save contract line");
    }
  };

  const saving = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit contract line" : "Add contract line"}</DialogTitle>
          <DialogDescription>
            Line types, labels and billing frequencies come from the shared commercial vocabulary used by the
            breakdown and by every value calculation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Line type *</Label>
            <Select value={form.lineType || undefined} onValueChange={onTypeChange}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select a type" /></SelectTrigger>
              <SelectContent>
                {keepsLegacyType && (
                  <SelectItem value={UNCLASSIFIED_LINE_TYPE}>{UNCLASSIFIED_LABEL}</SelectItem>
                )}
                {LINE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.lineType && <p className="text-[11px] text-destructive mt-1">{errors.lineType}</p>}
            {keepsLegacyType && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-warning/50 bg-warning/5 px-2.5 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  Unclassified line. The original stored value{" "}
                  <Badge variant="outline" className="text-[10px] px-1 py-0 align-middle">{form.rawLineType || "empty"}</Badge>{" "}
                  is preserved until you explicitly pick a classification. It stays visible but is excluded from ARR.
                </p>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Description *</Label>
            <Input className="h-9" value={form.description} onChange={(e) => set("description", e.target.value)} />
            {errors.description && <p className="text-[11px] text-destructive mt-1">{errors.description}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Amount *</Label>
              <Input className="h-9" type="number" step="0.01" value={form.amount ?? ""} onChange={(e) => set("amount", e.target.value)} />
              {errors.amount && <p className="text-[11px] text-destructive mt-1">{errors.amount}</p>}
            </div>
            <div>
              <Label className="text-xs">Currency *</Label>
              <Input className="h-9" value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
              {errors.currency && <p className="text-[11px] text-destructive mt-1">{errors.currency}</p>}
            </div>
            <div>
              <Label className="text-xs">Billing *</Label>
              <Select value={form.billingFrequency || undefined} onValueChange={(v) => set("billingFrequency", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {BILLING_FREQUENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.billingFrequency && <p className="text-[11px] text-destructive mt-1">{errors.billingFrequency}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start date</Label>
              <Input className="h-9" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">End date</Label>
              <Input className="h-9" type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
              {errors.endDate && <p className="text-[11px] text-destructive mt-1">{errors.endDate}</p>}
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save line"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
