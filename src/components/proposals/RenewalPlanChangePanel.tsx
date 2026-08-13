import { AlertTriangle, ArrowRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProposalPlan } from "@/types/proposal";
import {
  PROFESSIONAL_PLANS,
  RENEWAL_CHANGE_MODES,
  type ImplementationKind,
  type PlanChangeComputation,
  type RenewalChangeMode,
} from "@/lib/renewal-plan-change";

interface Props {
  mode: RenewalChangeMode;
  onModeChange: (mode: RenewalChangeMode) => void;
  targetPlan: ProposalPlan | null;
  onTargetPlanChange: (plan: ProposalPlan | null) => void;
  implementationKind: ImplementationKind;
  onImplementationKindChange: (kind: ImplementationKind) => void;
  implementationDiscountPct: number;
  onImplementationDiscountChange: (pct: number) => void;
  maxServicesDiscountPct: number;
  currentProductLabel: string | null;
  computation: PlanChangeComputation;
  /** Compact read-only summary (used in the Preview step). */
  summaryOnly?: boolean;
}

function money(value: number | null | undefined, currency: string) {
  if (value == null) return "—";
  const symbol = currency === "EUR" ? "€" : `${currency} `;
  return `${symbol}${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Row({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className={`text-xs ${strong ? "font-medium text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <span
        className={`text-xs tabular-nums ${
          accent ? "font-semibold text-primary" : strong ? "font-semibold text-foreground" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function RenewalPlanChangePanel({
  mode,
  onModeChange,
  targetPlan,
  onTargetPlanChange,
  implementationKind,
  onImplementationKindChange,
  implementationDiscountPct,
  onImplementationDiscountChange,
  maxServicesDiscountPct,
  currentProductLabel,
  computation: c,
  summaryOnly = false,
}: Props) {
  const isChange = mode !== "straight";
  const currency = c.currency || "EUR";
  const deltaLabel =
    c.recurringDelta == null ? "—" : `${c.recurringDelta >= 0 ? "+" : "−"}${money(Math.abs(c.recurringDelta), currency)}`;

  return (
    <div className="space-y-4">
      {!summaryOnly && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Renewal change type</Label>
            <Select value={mode} onValueChange={(v) => onModeChange(v as RenewalChangeMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RENEWAL_CHANGE_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              A straight renewal keeps the current contract exactly as it is.
            </p>
          </div>

          {isChange && (
            <div>
              <Label>Current product / plan</Label>
              <Input readOnly value={currentProductLabel || c.currentPlanLabel || "Not recorded"} className="bg-muted/50" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Read-only — taken from the real license. Never inferred from price.
              </p>
            </div>
          )}
        </div>
      )}

      {isChange && !summaryOnly && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Target plan</Label>
            <Select
              value={targetPlan ? String(targetPlan) : ""}
              onValueChange={(v) => onTargetPlanChange(Number(v) as ProposalPlan)}
            >
              <SelectTrigger><SelectValue placeholder="Select target plan" /></SelectTrigger>
              <SelectContent>
                {PROFESSIONAL_PLANS.map((p) => (
                  <SelectItem key={p} value={String(p)}>Professional {p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Implementation type</Label>
            <Select value={implementationKind} onValueChange={(v) => onImplementationKindChange(v as ImplementationKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="light">Light</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">Matched like-for-like; never mixed.</p>
          </div>

          <div>
            <Label>Discount on incremental implementation (%)</Label>
            <Input
              type="number"
              min={0}
              max={maxServicesDiscountPct}
              value={implementationDiscountPct}
              disabled={mode === "downgrade" || c.implementationGrossDelta <= 0}
              onChange={(e) => onImplementationDiscountChange(Number(e.target.value) || 0)}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Max {maxServicesDiscountPct}%. Recurring software is never discounted here.
            </p>
          </div>
        </div>
      )}

      {isChange && c.blockers.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
          {c.blockers.map((b, i) => (
            <p key={i} className="text-xs text-destructive flex gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {b}
            </p>
          ))}
        </div>
      )}

      {isChange && c.blockers.length === 0 && (
        <div className="rounded-lg border bg-secondary/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={mode === "upgrade" ? "default" : "secondary"} className="text-[11px] capitalize">{mode}</Badge>
            <span className="text-xs text-foreground flex items-center gap-1.5">
              {c.currentPlanLabel} <ArrowRight className="h-3 w-3" /> {c.targetPlanLabel}
            </span>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Recurring</p>
            <Row label="Current contract recurring" value={money(c.currentRecurring, currency)} />
            <Row label={`Target plan (${c.targetPlanLabel})`} value={money(c.targetPlanPrice, currency)} />
            <Row label="Unchanged configuration kept" value={money(c.unchangedRecurringTotal, currency)} />
            <Row label="Proposed recurring" value={money(c.proposedRecurring, currency)} strong />
            <Row label="Annual difference" value={deltaLabel} accent />
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Implementation</p>
            <Row label="Target-plan implementation" value={money(c.targetImplementation, currency)} />
            <Row label="Current-plan credit" value={money(c.currentImplementationCredit, currency)} />
            <Row label="Incremental (gross)" value={money(c.implementationGrossDelta, currency)} />
            <Row label="Discount" value={money(-c.implementationDiscountAmount, currency)} />
            <Row label="Incremental (net)" value={money(c.implementationNet, currency)} strong />
          </div>

          <div className="border-t pt-2">
            <Row label="Year 1 total" value={money(c.year1, currency)} strong accent />
            <Row label="Year 2+ (recurring)" value={money(c.year2Plus, currency)} strong />
          </div>

          {c.warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-muted-foreground">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
