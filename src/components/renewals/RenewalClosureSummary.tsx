import { formatDateOnly } from "@/lib/date-format";
import { formatMoney } from "@/lib/money";

/**
 * Read-only commercial record of a closed renewal cycle.
 * Used both for the closed renewal itself and for the previous cycle of an
 * open renewal, so closing history never disappears from the pipeline.
 */
export function RenewalClosureSummary({ renewal, title }: { renewal: any; title: string }) {
  if (!renewal) return null;
  const lost = renewal.outcome === "lost" || renewal.status === "Lost";
  return (
    <div className="border-t pt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Outcome</span>
          <p className={`font-medium mt-0.5 ${lost ? "text-destructive" : "text-success"}`}>
            {lost ? "Lost" : "Renewed"}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Closed on</span>
          <p className="font-medium mt-0.5 tabular-nums">{formatDateOnly(renewal.closed_at) || "—"}</p>
        </div>
        {renewal.renewal_effective_date && (
          <div>
            <span className="text-muted-foreground">Effective</span>
            <p className="font-medium mt-0.5 tabular-nums">{formatDateOnly(renewal.renewal_effective_date)}</p>
          </div>
        )}
        {renewal.renewed_recurring_value != null && (
          <div>
            <span className="text-muted-foreground">Recurring</span>
            <p className="font-medium mt-0.5 tabular-nums">
              {formatMoney(renewal.previous_recurring_value)} → {formatMoney(renewal.renewed_recurring_value)}
            </p>
          </div>
        )}
        {Number(renewal.one_time_value || 0) > 0 && (
          <div>
            <span className="text-muted-foreground">One-time</span>
            <p className="font-medium mt-0.5 tabular-nums">{formatMoney(renewal.one_time_value)}</p>
          </div>
        )}
        {renewal.loss_reason && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Loss reason</span>
            <p className="font-medium mt-0.5">{renewal.loss_reason}</p>
          </div>
        )}
        {renewal.closing_notes && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Closing notes</span>
            <p className="mt-0.5 text-muted-foreground">{renewal.closing_notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
