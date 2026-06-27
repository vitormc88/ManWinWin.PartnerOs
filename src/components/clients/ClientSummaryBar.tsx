import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Star } from "lucide-react";

interface Props {
  client: any;
  ownerName?: string | null;
  nextRenewalDate?: string | null;
  onEdit?: () => void;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-sm text-foreground truncate mt-0.5">{value || "—"}</p>
    </div>
  );
}

export function ClientSummaryBar({ client, ownerName, nextRenewalDate, onEdit }: Props) {
  const partner = client?.partner?.name || "HQ Direct";
  const owner = ownerName || client?.manager_owner || "—";
  const location = [client?.country, client?.sector].filter(Boolean).join(" • ") || "—";

  return (
    <Card className="border-border/60 shadow-sm">
      <div className="px-5 py-3 flex items-center justify-between gap-4 border-b border-border/40 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-foreground truncate">{client?.commercial_name}</h2>
            {client?.is_premium && (
              <Badge variant="outline" className="border-amber-300 text-amber-600 bg-amber-50 gap-1 text-[10px]">
                <Star className="h-3 w-3" /> Premium
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{location}</p>
        </div>
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit} className="h-8 gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 px-5 py-3">
        <Cell label="Partner" value={partner} />
        <Cell label="Owner" value={owner} />
        <Cell label="Phone" value={client?.phone} />
        <Cell label="Email" value={client?.email} />
        <Cell label="Customer Since" value={fmtDate(client?.created_at)} />
        <Cell label="Next Renewal" value={fmtDate(nextRenewalDate)} />
      </div>
    </Card>
  );
}
