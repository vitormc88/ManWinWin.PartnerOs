import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
const formatEuro = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
import {
  baselinePriceMap,
  adjustmentRows,
  applyAdjustment,
  lineKey,
  round2,
  type AdjustableLine,
} from "@/lib/renewal-price-adjustment";

interface Props {
  baselineItems: AdjustableLine[];
  items: AdjustableLine[];
  onApply: (patches: Array<{ index: number; unit_price: number }>) => void;
}

/**
 * Optional % adjustment for selected recurring renewal lines. Prices are
 * always computed from the current contract price, so re-applying never
 * compounds. The agreed amount is then edited in "Unit price" below.
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
  const baseTotal = round2(rows.reduce((s, r) => s + r.baseline, 0));
  const currentTotal = round2(rows.reduce((s, r) => s + r.current, 0));

  return (
    <div className="border rounded-lg p-3 space-y-3" data-testid="renewal-price-adjustment">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Annual price adjustment (optional)</h4>
        <p className="text-xs text-muted-foreground">
          Edit renewal prices here or in "Unit price" below. A percentage applies only to the lines you tick and is always
          calculated from the current contract price — it never compounds.
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
            <th className="text-right font-medium">Current contract</th>
            <th className="text-right font-medium">Exact calculation</th>
            <th className="text-right font-medium">Proposed (agreed)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t">
              <td className="py-1.5">
                <label className="flex items-center gap-2">
                  <Checkbox checked={selected.has(r.key)} onCheckedChange={() => toggle(r.key)} aria-label={`Adjust ${r.name}`} />
                  {r.name}
                </label>
              </td>
              <td className="text-right tabular-nums">{formatEuro(r.baseline)}</td>
              <td className="text-right tabular-nums">
                {selected.has(r.key) ? `${formatEuro(r.baseline)} × ${(1 + pct / 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} = ${formatEuro(r.exact)}` : "unchanged"}
              </td>
              <td className="text-right tabular-nums font-medium">
                {formatEuro(r.current)}
                {r.overridden && <span className="block text-[10px] text-warning">Agreed amount differs from the exact calculation</span>}
              </td>
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td className="py-1.5">Recurring total</td>
            <td className="text-right tabular-nums">{formatEuro(baseTotal)}</td>
            <td />
            <td className="text-right tabular-nums">{formatEuro(currentTotal)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground">
        Licence periodicity (perpetual / term) is separate from how the service is billed. A different recurring total requires a difference reason at validation.
        No increase is carried into the next cycle automatically.
      </p>
    </div>
  );
}
