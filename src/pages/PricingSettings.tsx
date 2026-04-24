import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { useAllPricingRules } from "@/hooks/useProposals";
import { useUpdatePricingRule } from "@/hooks/usePricingRulesAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, Save, Pencil } from "lucide-react";
import type { PricingRule } from "@/types/proposal";

const ALL = "__all__";

export default function PricingSettings() {
  const { roles, isLoading: authLoading } = useAuth();
  const isAdmin = roles.includes("hq_admin");

  const { data: rules = [], isLoading } = useAllPricingRules();
  const updateMut = useUpdatePricingRule();

  const [search, setSearch] = useState("");
  const [family, setFamily] = useState<string>(ALL);
  const [licenseModel, setLicenseModel] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [plan, setPlan] = useState<string>(ALL);
  const [region, setRegion] = useState<string>(ALL);
  const [activeFilter, setActiveFilter] = useState<string>(ALL);

  const [editing, setEditing] = useState<PricingRule | null>(null);

  const distinct = useMemo(() => {
    const u = (k: keyof PricingRule) =>
      Array.from(new Set(rules.map((r) => (r[k] ?? "") as string).filter(Boolean))).sort();
    return {
      family: u("product_family"),
      license: u("license_model"),
      category: u("category"),
      plan: u("applicable_plan"),
      region: u("region"),
    };
  }, [rules]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (q && !r.code.toLowerCase().includes(q) && !r.label.toLowerCase().includes(q)) return false;
      if (family !== ALL && (r.product_family || "") !== family) return false;
      if (licenseModel !== ALL && (r.license_model || "") !== licenseModel) return false;
      if (category !== ALL && r.category !== category) return false;
      if (plan !== ALL && (r.applicable_plan || "") !== plan) return false;
      if (region !== ALL && (r.region || "") !== region) return false;
      if (activeFilter === "active" && !r.active) return false;
      if (activeFilter === "inactive" && r.active) return false;
      return true;
    });
  }, [rules, search, family, licenseModel, category, plan, region, activeFilter]);

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const handleInlinePrice = async (id: string, price: number) => {
    try {
      await updateMut.mutateAsync({ id, patch: { unit_price: price } });
      toast.success("Price updated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update price");
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      await updateMut.mutateAsync({ id, patch: { active } });
      toast.success(active ? "Rule activated" : "Rule deactivated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings → Pricing Rules</h1>
        <p className="text-sm text-muted-foreground">
          Manage the catalog used by the Proposal Generator. Changes affect future generated proposals only.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">Search (code or name)</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-7 h-9"
                  placeholder="e.g. plan_3 or Requests"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <FilterSelect label="Product family" value={family} onChange={setFamily} options={distinct.family} />
            <FilterSelect label="License model" value={licenseModel} onChange={setLicenseModel} options={distinct.license} />
            <FilterSelect label="Category" value={category} onChange={setCategory} options={distinct.category} />
            <FilterSelect label="Applicable plan" value={plan} onChange={setPlan} options={distinct.plan} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <FilterSelect label="Region" value={region} onChange={setRegion} options={distinct.region} />
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {filtered.length} rule{filtered.length === 1 ? "" : "s"}
          </CardTitle>
          <span className="text-[11px] text-muted-foreground">
            Inline edit price + active. Click pencil for full edit.
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No rules match the current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Code</th>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-left px-3 py-2 font-medium">Family</th>
                    <th className="text-left px-3 py-2 font-medium">License</th>
                    <th className="text-left px-3 py-2 font-medium">Category</th>
                    <th className="text-left px-3 py-2 font-medium">Plan</th>
                    <th className="text-right px-3 py-2 font-medium">Price</th>
                    <th className="text-left px-3 py-2 font-medium">Unit</th>
                    <th className="text-left px-3 py-2 font-medium">Billing</th>
                    <th className="text-left px-3 py-2 font-medium">Region</th>
                    <th className="text-center px-3 py-2 font-medium">Active</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <RuleRow
                      key={r.id}
                      rule={r}
                      onSavePrice={(p) => handleInlinePrice(r.id, p)}
                      onToggleActive={(v) => handleToggleActive(r.id, v)}
                      onEdit={() => setEditing(r)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditDialog rule={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RuleRow({
  rule, onSavePrice, onToggleActive, onEdit,
}: {
  rule: PricingRule;
  onSavePrice: (price: number) => void;
  onToggleActive: (v: boolean) => void;
  onEdit: () => void;
}) {
  const [price, setPrice] = useState(String(rule.unit_price));
  const dirty = Number(price) !== rule.unit_price && !Number.isNaN(Number(price));

  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="px-3 py-2 font-mono text-[11px]">{rule.code}</td>
      <td className="px-3 py-2">{rule.label}</td>
      <td className="px-3 py-2">
        <Badge variant="outline" className="text-[10px]">{rule.product_family || "—"}</Badge>
      </td>
      <td className="px-3 py-2 text-xs">{rule.license_model || "—"}</td>
      <td className="px-3 py-2 text-xs">{rule.category}</td>
      <td className="px-3 py-2 text-xs">{rule.applicable_plan || "—"}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <Input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="h-7 w-24 text-right"
          />
          {dirty && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onSavePrice(Number(price))}>
              <Save className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-xs">{rule.unit_type}</td>
      <td className="px-3 py-2 text-xs">{rule.billing_frequency || "—"}</td>
      <td className="px-3 py-2 text-xs">{rule.region || "—"}</td>
      <td className="px-3 py-2 text-center">
        <Switch checked={rule.active} onCheckedChange={onToggleActive} />
      </td>
      <td className="px-3 py-2">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

function EditDialog({ rule, onClose }: { rule: PricingRule | null; onClose: () => void }) {
  const updateMut = useUpdatePricingRule();
  const [draft, setDraft] = useState<PricingRule | null>(null);

  // Reset draft when rule changes
  useMemo(() => {
    setDraft(rule ? { ...rule } : null);
  }, [rule]);

  if (!rule || !draft) return null;

  const update = <K extends keyof PricingRule>(k: K, v: PricingRule[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  };

  const handleSave = async () => {
    try {
      const patch: Partial<PricingRule> = {
        label: draft.label,
        description: draft.description ?? null,
        unit_price: Number(draft.unit_price) || 0,
        category: draft.category,
        billing_frequency: draft.billing_frequency ?? null,
        unit_type: draft.unit_type,
        region: draft.region ?? "Global",
        active: !!draft.active,
        optional: !!draft.optional,
        included_by_default: !!draft.included_by_default,
        can_override: !!draft.can_override,
        sort_order: Number(draft.sort_order) || 100,
      };
      await updateMut.mutateAsync({ id: rule.id, patch });
      toast.success("Pricing rule updated");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update");
    }
  };

  return (
    <Dialog open={!!rule} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit pricing rule — <span className="font-mono text-sm">{rule.code}</span></DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Name</Label>
            <Input value={draft.label} onChange={(e) => update("label", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={draft.description ?? ""}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>
          <div>
            <Label>Price</Label>
            <Input
              type="number"
              value={draft.unit_price}
              onChange={(e) => update("unit_price", Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Category</Label>
            <Input value={draft.category} onChange={(e) => update("category", e.target.value)} />
          </div>
          <div>
            <Label>Unit type</Label>
            <Input value={draft.unit_type} onChange={(e) => update("unit_type", e.target.value)} />
          </div>
          <div>
            <Label>Billing frequency</Label>
            <Input
              value={draft.billing_frequency ?? ""}
              onChange={(e) => update("billing_frequency", e.target.value)}
            />
          </div>
          <div>
            <Label>Region</Label>
            <Input
              value={draft.region ?? "Global"}
              onChange={(e) => update("region", e.target.value)}
            />
          </div>
          <div>
            <Label>Sort order</Label>
            <Input
              type="number"
              value={draft.sort_order ?? 100}
              onChange={(e) => update("sort_order", Number(e.target.value) || 100)}
            />
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <Label className="text-xs">Active</Label>
            <Switch checked={!!draft.active} onCheckedChange={(v) => update("active", v)} />
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <Label className="text-xs">Optional</Label>
            <Switch checked={!!draft.optional} onCheckedChange={(v) => update("optional", v)} />
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <Label className="text-xs">Included by default</Label>
            <Switch
              checked={!!draft.included_by_default}
              onCheckedChange={(v) => update("included_by_default", v)}
            />
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <Label className="text-xs">Can override</Label>
            <Switch checked={!!draft.can_override} onCheckedChange={(v) => update("can_override", v)} />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Changes to pricing rules affect future generated proposals only.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMut.isPending}>
            {updateMut.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
