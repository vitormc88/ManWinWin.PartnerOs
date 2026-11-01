import { formatDateOnly } from "@/lib/date-format";
import { preparationScope, type PreparationListRow } from "@/lib/proposal-preparation";

export function PreparationDraftList({ rows, onOpen }: { rows: PreparationListRow[]; onOpen: (row: PreparationListRow) => void }) {
  return <div className="space-y-2 mb-4">{rows.map(row => <button key={row.id} onClick={() => onOpen(row)} className="w-full rounded-lg border border-dashed p-3 text-left hover:bg-muted/40">
    <span className="font-medium text-sm">{row.kind === "addition" ? "Continue saved preparation" : "Continue commercial review request"}</span>
    <span className="block text-sm mt-1">{preparationScope(row)}</span>
    <span className="block text-xs text-muted-foreground mt-1">Saved {formatDateOnly(row.updated_at.slice(0, 10))} · Not issued · No financial or license impact</span>
  </button>)}</div>;
}
