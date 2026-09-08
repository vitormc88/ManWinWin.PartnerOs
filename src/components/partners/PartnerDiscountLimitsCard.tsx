import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Pencil, Save, X } from "lucide-react";
import {
  usePartnerDiscountLimits,
  useSavePartnerDiscountLimits,
  toDiscountOverrides,
} from "@/hooks/usePartnerDiscountLimits";
import {
  getDefaultDiscountLimits,
  getDiscountLimits,
  normalizeDiscountOverride,
} from "@/lib/proposal-discount-policy";

interface Props {
  partnerId: string;
  partnershipLevel?: string | null;
  /** Only a confirmed HQ Admin may edit (server-side enforced as well). */
  canEdit: boolean;
}

function isValidInput(raw: string): boolean {
  if (raw.trim() === "") return true;
  return normalizeDiscountOverride(raw) !== null;
}

export function PartnerDiscountLimitsCard({ partnerId, partnershipLevel, canEdit }: Props) {
  const { data, isLoading, isError, error, refetch, isFetching } = usePartnerDiscountLimits(partnerId);
  const save = useSavePartnerDiscountLimits();
  const [editing, setEditing] = useState(false);
  const [software, setSoftware] = useState("");
  const [services, setServices] = useState("");

  const row = data?.row ?? null;
  const missingSchema = data?.missingSchema === true;
  const resolved = !isLoading && !isError;
  const overrides = toDiscountOverrides(row);
  const defaults = getDefaultDiscountLimits({ isHQ: false, partnershipLevel });
  const effective = getDiscountLimits({ isHQ: false, partnershipLevel, overrides });

  useEffect(() => {
    if (editing) return;
    setSoftware(overrides.software === null ? "" : String(overrides.software));
    setServices(overrides.services === null ? "" : String(overrides.services));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, row?.max_software_discount_pct, row?.max_services_discount_pct]);

  const invalid = !isValidInput(software) || !isValidInput(services);

  const onSave = async () => {
    if (!resolved || missingSchema) return;
    if (invalid) {
      toast.error("Discount limits must be numbers between 0 and 100, or left empty for the default.");
      return;
    }
    try {
      await save.mutateAsync({
        partner_id: partnerId,
        max_software_discount_pct: software.trim() === "" ? null : Number(software),
        max_services_discount_pct: services.trim() === "" ? null : Number(services),
      });
      toast.success("Discount limits updated");
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not update discount limits");
    }
  };

  const canStartEditing = canEdit && resolved && !missingSchema;

  return (
    <div className="bg-card rounded-xl border shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-[14px]">Discount limits</h3>
        {canStartEditing && !editing && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3 mr-1" /> Edit
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-[12px] text-muted-foreground" role="status">
          Loading discount limits…
        </p>
      ) : isError ? (
        <div className="space-y-2">
          <p className="text-[12px] text-destructive">
            Could not load the discount limits{(error as any)?.message ? `: ${(error as any).message}` : "."}
          </p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => refetch()} disabled={isFetching}>
            Try again
          </Button>
        </div>
      ) : missingSchema ? (
        <p className="text-[12px] text-muted-foreground">
          Configurable discount limits are not available in this environment yet. The standard limits still apply.
        </p>
      ) : !editing ? (

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Max software discount</p>
            <p className="text-[15px] font-semibold tabular-nums">{effective.software}%</p>
            <p className="text-[11px] text-muted-foreground">
              {overrides.software === null ? `Using default (${defaults.software}%)` : "Custom limit"}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Max services discount</p>
            <p className="text-[15px] font-semibold tabular-nums">{effective.services}%</p>
            <p className="text-[11px] text-muted-foreground">
              {overrides.services === null ? `Using default (${defaults.services}%)` : "Custom limit"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Software % (empty = default {defaults.software}%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={software}
                placeholder="Use default"
                onChange={(e) => setSoftware(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Services % (empty = default {defaults.services}%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={services}
                placeholder="Use default"
                onChange={(e) => setServices(e.target.value)}
              />
            </div>
          </div>
          {invalid && (
            <p className="text-xs text-destructive">Enter a value between 0 and 100, or leave empty for the default.</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={onSave}
              disabled={save.isPending || invalid || !resolved || missingSchema}
            >
              <Save className="h-3 w-3 mr-1" /> Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setEditing(false)}
              disabled={save.isPending}
            >
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
