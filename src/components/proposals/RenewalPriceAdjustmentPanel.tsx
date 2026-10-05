import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  baselinePriceMap,
  adjustmentRows,
  applyAdjustment,
  recurringTotal,
  round2,
  type AdjustableLine,
} from "@/lib/renewal-price-adjustment";

const formatEuro = (n: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

interface Props {
  baselineItems: AdjustableLine[];
  items: AdjustableLine[];
  onApply: (patches: Array<{ index: number; unit_price: number }>) => void;
}

/**
 * Optional % adjustment for selected recurring renewal lines. Unit prices are
 * always computed from the current contract price, so re-applying never
 * compounds. Annual amounts use the canonical proposal calculation.
 */
export function RenewalPriceAdjustmentPanel({ baselineItems, items, onApply }: Props) {
  const baseline = useMemo(() => baselinePriceMap(baselineItems), [baselineItems]);
  const [pct, setPct] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rows = adjustmentRows(items, baseline, pct, selected);
  if (!rows.length) return null;

  const toggle = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  const baseTotal = round2(rows.reduce((s, r) => s + r.baselineAnnual, 0));
  const currentTotal = recurringTotal(items);
  const factor = (1 + pct / 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const hasAmbiguous = rows.some((r) => r.kind === "ambiguous");

  return (
    <div className="border rounded-lg p-3 space-y-3" data-testid="renewal-price-adjustment">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Annual price adjustment (optional)</h4>
        <p className="text-xs text-muted-foreground">
          Edit renewal prices here or in "Unit price" below. A percentage applies only to the lines you tick and is always
          calculated from the current contract unit price — it never compounds.
        </p>
      </div>
      <div className="flex items-end gap-2">
        <div className="w-28">
          <Label className="text-[10px]">Increase %</Label>
          <Input type="number" step="0.1" className="h-8" value={pct} onChange={(e) => setPct(Number(e.target.value) || 0)} aria-label="Increase percentage" />
        </div>
        <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => onApply(applyAdjustment(items, baseline, pct, selected))}>
          Apply to selected lines
        </Button>
      </div>
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-left font-medium py-1">Recurring line</th>
            <th className="text-right font-medium">Current contract (annual)</th>
            <th className="text-right font-medium">Exact calculation (unit)</th>
            <th className="text-right font-medium">Proposed (annual)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.index}-${r.key}`} className="border-t">
              <td className="py-1.5">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={r.adjustable && selected.has(r.key)}
                    disabled={!r.adjustable}
                    onCheckedChange={() => toggle(r.key)}
                    aria-label={`Adjust ${r.name}`}
                  />
                  <span>
                    {r.name}
                    {r.qty !== 1 && <span className="text-muted-foreground"> × {r.qty}</span>}
                    {r.kind === "new" && <span className="block text-[10px] text-muted-foreground">New line — not in current contract</span>}
                    {r.kind === "ambiguous" && <span className="block text-[10px] text-warning">Matches several lines — edit unit price below</span>}
                  </span>
                </label>
              </td>
              <td className="text-right tabular-nums">{r.kind === "new" ? "—" : formatEuro(r.baselineAnnual)}</td>
              <td className="text-right tabular-nums">
                {r.adjustable && selected.has(r.key)
                  ? `${formatEuro(r.baselineUnit as number)} × ${factor} = ${formatEuro(r.exactUnit as number)}`
                  : "unchanged"}
              </td>
              <td className="text-right tabular-nums font-medium">
                {formatEuro(r.currentAnnual)}
                {r.overridden && <span className="block text-[10px] text-warning">Agreed amount differs from the exact calculation</span>}
              </td>
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td className="py-1.5">Recurring total (annual)</td>
            <td className="text-right tabular-nums">{formatEuro(baseTotal)}</td>
            <td />
            <td className="text-right tabular-nums">{formatEuro(currentTotal)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground">
        Annual amounts include quantity, billing frequency and renewal discounts.
        {hasAmbiguous && " Lines that match more than one contract line cannot be adjusted by percentage."}
        {" "}Licence periodicity (perpetual / term) is separate from how the service is billed. A different recurring total requires a difference reason at validation.
        No increase is carried into the next cycle automatically.
      </p>
    </div>
  );
}
