/**
 * Renewals P0 — read-only "Current Contract Baseline" evidence panel plus the
 * "Changes from Current Contract" comparison and the three-way financial split.
 *
 * Purely presentational: it never writes to the client's contract or license.
 */

import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  NOT_RECORDED,
  buildRenewalFinancialSummary,
  compareProposalToBaseline,
  type BaselineChange,
  type RenewalBaseline,
} from "@/lib/renewal-baseline";
import { formatMoney } from "@/lib/money";

interface Props {
  baseline: RenewalBaseline | null;
  isLoading?: boolean;
  proposedItems?: { item_name: string; qty: number; unit_price: number }[];
  proposedRecurring?: number;
  proposedYear1?: number;
  /** Variant chosen for THIS proposal when the baseline variant is not recorded. */
  selectedVariantLabel?: string | null;
}

function Field({ label, value, needsReview = false }: { label: string; value: string | null; needsReview?: boolean }) {
  const missing = !value;
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm truncate ${missing ? "text-muted-foreground italic" : "text-foreground font-medium"}`}>
        {value || NOT_RECORDED}
      </p>
      {needsReview && (
        <Badge variant="outline" className="mt-1 text-[9px] border-destructive/40 text-destructive">
          Needs review
        </Badge>
      )}
    </div>
  );
}

const CHANGE_LABEL: Record<BaselineChange["kind"], string> = {
  added: "Added",
  removed: "Removed",
  qty_increased: "Quantity increased",
  qty_decreased: "Quantity decreased",
  price_changed: "Pricing changed",
  variant_selected: "Variant selected for proposal",
  unchanged: "Unchanged",
};


export function RenewalBaselinePanel({
  baseline,
  isLoading = false,
  proposedItems = [],
  proposedRecurring = 0,
  proposedYear1 = 0,
  selectedVariantLabel = null,
}: Props) {
  if (isLoading) {
    return (
      <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading current contract baseline…
      </div>
    );
  }
  if (!baseline) return null;

  const money = (v: number | null | undefined) =>
    v === null || v === undefined ? null : formatMoney(v, { currency: baseline.currency });

  const comparison = compareProposalToBaseline(baseline, proposedItems as any, { selectedVariantLabel });
  const financials = buildRenewalFinancialSummary({ baseline, proposedRecurring, proposedYear1 });
  const grouped = comparison.changes.filter((c) => c.kind !== "unchanged");
  const unchangedCount = comparison.changes.length - grouped.length;


  return (
    <div className="mt-3 space-y-3">
      {/* ── Current Contract Baseline (read-only evidence) ── */}
      <section className="rounded-md border bg-muted/20 p-3" aria-label="Current Contract Baseline">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold">Current Contract Baseline</h3>
          <Badge variant="secondary" className="text-[10px]">Read-only</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Product / family" value={baseline.product} />
          <Field label="Plan / variant" value={baseline.variantLabel} needsReview={baseline.variantNeedsReview} />
          <Field label="Hosting" value={baseline.hosting} />
          <Field label="Current version" value={baseline.version} />
          <Field label="BackOffice users" value={baseline.backofficeUsers == null ? null : String(baseline.backofficeUsers)} />
          <Field label="Web / mobile users" value={
            baseline.webUsers == null && baseline.mobileUsers == null
              ? null
              : `${baseline.webUsers ?? NOT_RECORDED} web / ${baseline.mobileUsers ?? NOT_RECORDED} mobile`
          } />
          <Field label="Current recurring value" value={money(baseline.currentRecurring)} />
          <Field label="Billing frequency" value={baseline.billingFrequency} />
          <Field label="Contract start" value={baseline.contractStartDate} />
          <Field label="Contract end" value={baseline.contractEndDate} />
          <Field label="Renewal date" value={baseline.renewalDate} />
          <Field label="Historical one-time revenue" value={money(baseline.historicalOneTime)} />
        </div>

        {baseline.recurringLines.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Current recurring lines</p>
            <ul className="space-y-1">
              {baseline.recurringLines.map((l) => (
                <li key={l.key} className="flex items-center justify-between text-xs">
                  <span className="truncate">
                    {l.label}
                    {l.needsReview && <Badge variant="outline" className="ml-2 text-[9px]">Needs review</Badge>}
                  </span>
                  <span className="tabular-nums">{formatMoney(l.amount, { currency: baseline.currency })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(baseline.modules.length > 0 || baseline.plugins.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1">
            {[...baseline.modules, ...baseline.plugins].map((m) => (
              <Badge key={`${m.kind}-${m.key}`} variant={m.kind === "plugin" ? "outline" : "secondary"} className="text-[10px]">
                {m.name}
                {m.includedInBase ? " · in Base" : ""}
                {m.needsReview ? " · needs review" : ""}
              </Badge>
            ))}
          </div>
        )}

        {baseline.unmappedFields.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Not recorded in the source data: {baseline.unmappedFields.join(", ")}.
          </p>
        )}
      </section>

      {/* ── Financial split ── */}
      <section className="rounded-md border p-3" aria-label="Renewal financial summary">
        <h3 className="text-sm font-semibold mb-2">Renewal financials</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Current recurring" value={money(financials.currentRecurring)} />
          <Field label="Proposed recurring" value={money(financials.proposedRecurring)} />
          <Field
            label="Recurring difference"
            value={
              financials.recurringDelta == null
                ? null
                : `${financials.recurringDelta >= 0 ? "+" : ""}${formatMoney(financials.recurringDelta, { currency: baseline.currency })}` +
                  (financials.recurringDeltaPct == null
                    ? ""
                    : ` (${financials.recurringDeltaPct >= 0 ? "+" : ""}${financials.recurringDeltaPct.toFixed(1)}%)`)
            }
          />
          <Field label="One-time charges" value={money(financials.oneTimeCharges)} />
          <Field label="Proposed Year 1 total" value={money(financials.proposedYear1)} />
          <Field label="Proposed Year 2+ recurring" value={money(financials.proposedYear2Plus)} />
        </div>
      </section>

      {/* ── Changes from Current Contract ── */}
      <section className="rounded-md border p-3" aria-label="Changes from Current Contract">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold">Changes from Current Contract</h3>
          {comparison.isStraightRenewal && (
            <Badge variant="secondary" className="text-[10px]">Straight renewal</Badge>
          )}
        </div>
        {grouped.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {comparison.isStraightRenewal
              ? "No changes — this is a straight renewal of the current agreement."
              : "No comparable proposal lines yet."}
          </p>
        ) : (
          <ul className="space-y-1">
            {grouped.map((c, i) => (
              <li key={`${c.kind}-${c.label}-${i}`} className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[9px] shrink-0">{CHANGE_LABEL[c.kind]}</Badge>
                <span className="truncate">{c.label}</span>
                {c.detail && <span className="text-muted-foreground tabular-nums ml-auto">{c.detail}</span>}
              </li>
            ))}
          </ul>
        )}
        {unchangedCount > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">{unchangedCount} line(s) unchanged.</p>
        )}
      </section>
    </div>
  );
}
