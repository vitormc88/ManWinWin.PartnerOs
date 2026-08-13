import { useState } from "react";
import { useContractLines } from "@/hooks/useContractLines";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Info, ChevronDown, ChevronRight } from "lucide-react";
import {
  computeContractFinancials,
  groupContractLines,
} from "@/lib/contract-lines";
import {
  reconcileContract,
  historicalSourceValues,
  HISTORICAL_SOURCE_EXPLANATION,
  type ContractHeaderLike,
} from "@/lib/contract-reconciliation";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

interface Props {
  contractId: string;
  /** Full contract header — current values plus preserved imported ones. */
  contract?: ContractHeaderLike | null;
  legacyTotal: number | null | undefined;
  currency?: string | null;
  isImported?: boolean;
  manualAdjustment?: number | null;
}

export function ContractBreakdown({ contractId, contract = null, legacyTotal, currency = "EUR", isImported = true, manualAdjustment = 0 }: Props) {
  const { data: lines = [], isLoading } = useContractLines(contractId);
  const [showHistorical, setShowHistorical] = useState(false);

  // Canonical vocabulary + conservative legacy classification (read-only).
  const groups = groupContractLines(lines);
  const financials = computeContractFinancials(lines);

  const cur = financials.currency || currency || "EUR";
  const header: ContractHeaderLike = contract ?? { total_value: legacyTotal, is_imported: isImported };

  // Current structured lines vs the CURRENT contract header only. Preserved
  // imported headers never trigger a reconciliation warning.
  const reconciliation = reconcileContract(header, financials, lines.length > 0);
  const historical = historicalSourceValues(header);

  const hasAdjustment = Math.abs(Number(manualAdjustment || 0)) > 0.01;

  return (
    <div className="mt-5 border-t border-border/60 pt-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h4 className="text-sm font-semibold text-foreground">Contract Breakdown</h4>
        <div className="flex items-center gap-1.5 flex-wrap">
          {financials.unclassifiedCount > 0 && (
            <Badge variant="outline" className="text-xs gap-1 border-warning text-warning">
              <AlertTriangle className="h-3 w-3" /> {financials.unclassifiedCount} needs review
            </Badge>
          )}
          {financials.mixedCurrency && (
            <Badge variant="outline" className="text-xs gap-1 border-warning text-warning">
              <AlertTriangle className="h-3 w-3" /> Mixed currencies
            </Badge>
          )}
          {lines.length > 0 && (
            reconciliation.isWarning ? (
              <Badge variant="outline" className="text-xs gap-1 border-warning text-warning" title={reconciliation.detail}>
                <AlertTriangle className="h-3 w-3" /> {reconciliation.label}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs gap-1" title={reconciliation.detail}>
                <CheckCircle2 className="h-3 w-3" /> {reconciliation.label}
              </Badge>
            )
          )}
        </div>
      </div>


      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : lines.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No structured contract lines yet.
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {groups.map((group) => (
              <div
                key={group.key}
                className={`rounded-md border bg-muted/20 ${group.isUnclassified ? "border-warning/50" : "border-border/50"}`}
              >
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${group.isUnclassified ? "text-warning" : "text-muted-foreground"}`}>
                    {group.label}
                  </span>
                  <span className="text-xs font-medium tabular-nums">
                    {formatMoney(group.subtotal, cur)}
                  </span>
                </div>
                <div className="divide-y divide-border/40">
                  {group.lines.map((c) => (
                    <div key={c.line.id} className="px-3 py-2 grid grid-cols-12 gap-2 items-baseline text-xs">
                      <div className="col-span-5">
                        <div className="text-sm text-foreground flex items-center gap-1.5 flex-wrap">
                          {c.line.description}
                          {c.isInferred && (
                            <span
                              className="text-[10px] text-muted-foreground border border-border/60 rounded px-1"
                              title={`Stored type "${c.rawType}" — classified from the description`}
                            >
                              inferred
                            </span>
                          )}
                          {c.isUnclassified && (
                            <span
                              className="text-[10px] text-warning border border-warning/50 rounded px-1"
                              title={`Unknown stored type "${c.rawType}" — excluded from ARR until reviewed`}
                            >
                              needs review
                            </span>
                          )}
                        </div>
                        {(c.line.related_license_id || c.line.related_module_id || c.line.related_plugin_id) && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {c.line.related_license_id && "Linked to license"}
                            {c.line.related_module_id && "Linked to module"}
                            {c.line.related_plugin_id && "Linked to plugin"}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2 text-muted-foreground">
                        {c.line.billing_frequency || "—"}
                      </div>
                      <div className="col-span-3 text-muted-foreground">
                        {c.line.start_date || "—"}
                        {c.line.end_date ? ` → ${c.line.end_date}` : ""}
                      </div>
                      <div className="col-span-2 text-right tabular-nums font-medium">
                        {c.line.amount == null
                          ? <span className="text-warning">no amount</span>
                          : formatMoney(Number(c.line.amount), c.line.currency || cur)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border border-border/60 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Recurring ARR</div>
              <div className="font-semibold tabular-nums mt-0.5">{formatMoney(financials.recurringArr, cur)}</div>
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">One-time</div>
              <div className="font-semibold tabular-nums mt-0.5">{formatMoney(financials.oneTimeValue, cur)}</div>
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Year 1 Total</div>
              <div className="font-semibold tabular-nums mt-0.5">{formatMoney(financials.year1Value, cur)}</div>
            </div>
          </div>

          {reconciliation.isWarning && (
            <div className="mt-3 rounded-md border border-warning/60 bg-warning/5 p-3 text-xs text-warning flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{reconciliation.detail}</span>
            </div>
          )}

          {hasAdjustment && (
            <div className="mt-3 rounded-md border border-border/60 p-3 text-sm">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Manual Adjustment</div>
              <div className="font-semibold tabular-nums mt-0.5">{formatMoney(Number(manualAdjustment || 0), cur)}</div>
            </div>
          )}

          {historical.length > 0 && (
            <div className="mt-4 rounded-md border border-border/50 bg-muted/20">
              <button
                type="button"
                onClick={() => setShowHistorical((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground"
              >
                <span className="flex items-center gap-1.5">
                  {showHistorical ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Historical source values
                </span>
                <span className="text-[10px] uppercase tracking-wide">{historical.length} preserved</span>
              </button>
              {showHistorical && (
                <div className="px-3 pb-3 space-y-1.5">
                  {historical.map((h) => (
                    <div key={h.key} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{h.label}</span>
                      <span className="tabular-nums">{formatMoney(h.amount, cur)}</span>
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground pt-1.5 border-t border-border/40">
                    {HISTORICAL_SOURCE_EXPLANATION}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <p className="text-[11px] text-muted-foreground mt-3 flex items-start gap-1.5">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        {isImported
          ? "Contract lines are the structured calculation source. Imported header totals are kept as historical source values and are never added to the lines."
          : "This contract was generated from an approved proposal. Contract lines are the source of truth."}
      </p>

    </div>
  );
}
