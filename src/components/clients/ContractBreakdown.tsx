import { useContractLines, type ContractLine } from "@/hooks/useContractLines";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";

const LINE_TYPE_LABELS: Record<string, string> = {
  license: "License",
  mww_web: "MWW Web",
  hosting: "Hosting",
  sat: "S&AT",
  module: "Module",
  plugin: "Plugin",
  implementation: "Implementation",
  training: "Training",
  discount: "Discount",
  other: "Other",
};

const LINE_TYPE_ORDER = [
  "license", "mww_web", "hosting", "sat",
  "module", "plugin", "implementation", "training", "discount", "other",
];

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

interface Props {
  contractId: string;
  legacyTotal: number | null | undefined;
  currency?: string | null;
}

export function ContractBreakdown({ contractId, legacyTotal, currency = "EUR" }: Props) {
  const { data: lines = [], isLoading } = useContractLines(contractId);

  const grouped = lines.reduce<Record<string, ContractLine[]>>((acc, l) => {
    const key = LINE_TYPE_LABELS[l.line_type] ? l.line_type : "other";
    (acc[key] = acc[key] || []).push(l);
    return acc;
  }, {});

  const calculatedTotal = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const legacy = Number(legacyTotal || 0);
  const diff = calculatedTotal - legacy;
  const matched = Math.abs(diff) < 0.01;
  const cur = lines[0]?.currency || currency || "EUR";

  return (
    <div className="mt-5 border-t border-border/60 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-foreground">Contract Breakdown</h4>
        {lines.length > 0 && (
          matched ? (
            <Badge variant="secondary" className="text-xs gap-1">
              <CheckCircle2 className="h-3 w-3" /> Matched
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs gap-1 border-warning text-warning">
              <AlertTriangle className="h-3 w-3" /> Needs reconciliation
            </Badge>
          )
        )}
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
            {LINE_TYPE_ORDER.filter((t) => grouped[t]?.length).map((type) => {
              const items = grouped[type];
              const subtotal = items.reduce((s, l) => s + Number(l.amount || 0), 0);
              return (
                <div key={type} className="rounded-md border border-border/50 bg-muted/20">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {LINE_TYPE_LABELS[type]}
                    </span>
                    <span className="text-xs font-medium tabular-nums">
                      {formatMoney(subtotal, cur)}
                    </span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {items.map((l) => (
                      <div key={l.id} className="px-3 py-2 grid grid-cols-12 gap-2 items-baseline text-xs">
                        <div className="col-span-5">
                          <div className="text-sm text-foreground">{l.description}</div>
                          {(l.related_license_id || l.related_module_id || l.related_plugin_id) && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {l.related_license_id && "Linked to license"}
                              {l.related_module_id && "Linked to module"}
                              {l.related_plugin_id && "Linked to plugin"}
                            </div>
                          )}
                        </div>
                        <div className="col-span-2 text-muted-foreground">
                          {l.billing_frequency || "—"}
                        </div>
                        <div className="col-span-3 text-muted-foreground">
                          {l.start_date || "—"}
                          {l.end_date ? ` → ${l.end_date}` : ""}
                        </div>
                        <div className="col-span-2 text-right tabular-nums font-medium">
                          {formatMoney(Number(l.amount || 0), l.currency || cur)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border border-border/60 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Legacy Total</div>
              <div className="font-semibold tabular-nums mt-0.5">{formatMoney(legacy, cur)}</div>
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Calculated Total</div>
              <div className="font-semibold tabular-nums mt-0.5">{formatMoney(calculatedTotal, cur)}</div>
            </div>
            <div className={`rounded-md border p-3 ${matched ? "border-border/60" : "border-warning/60 bg-warning/5"}`}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Difference</div>
              <div className={`font-semibold tabular-nums mt-0.5 ${matched ? "" : "text-warning"}`}>
                {matched ? "—" : `${diff > 0 ? "+" : ""}${formatMoney(diff, cur)}`}
              </div>
            </div>
          </div>
        </>
      )}

      <p className="text-[11px] text-muted-foreground mt-3 flex items-start gap-1.5">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        Contract Breakdown is generated from structured contract lines. Legacy totals are preserved until reconciliation is confirmed.
      </p>
    </div>
  );
}
