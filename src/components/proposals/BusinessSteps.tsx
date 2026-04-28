/**
 * Business proposal wizard step content.
 *
 * Renders Software/Services/Preview steps for Business proposals.
 * Independent from the Professional flow — does NOT touch Professional logic.
 */
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import {
  computeBusinessOptions,
  ONSITE_RATES,
  type BusinessConfig,
  type BusinessOptionTotals,
  type BusinessLineItem,
  type OnsiteRegion,
  DEFAULT_BUSINESS_DISCOUNTS,
} from "@/lib/proposal-business-engine";
import type {
  PricingRule,
  ProposalLanguage,
  ProposalMode,
  ProposalLicenseModel,
} from "@/types/proposal";
import { formatEuro } from "@/lib/proposal-i18n";

export interface BusinessStepsProps {
  rules: PricingRule[];
  language: ProposalLanguage;
  config: BusinessConfig;
  onChange: (next: BusinessConfig) => void;
  proposalMode: ProposalMode;
}

export function BusinessSoftwareStep({ config, onChange }: BusinessStepsProps) {
  const update = <K extends keyof BusinessConfig>(k: K, v: BusinessConfig[K]) =>
    onChange({ ...config, [k]: v });
  const discounts = config.discounts || DEFAULT_BUSINESS_DISCOUNTS;
  const updDisc = <K extends keyof typeof discounts>(k: K, v: (typeof discounts)[K]) =>
    onChange({ ...config, discounts: { ...discounts, [k]: v } });
  const clampPct = (n: number) => Math.max(0, Math.min(100, Number(n) || 0));

  return (
    <div className="space-y-4">
      <div className="bg-secondary/40 border rounded-lg p-4">
        <h4 className="text-sm font-semibold text-foreground mb-1">
          Maintenance Module — always included
        </h4>
        <p className="text-[11px] text-muted-foreground">
          Includes <strong>3 BackOffice/simultaneous accesses</strong> and{" "}
          <strong>1 Web/Mobile user</strong> by default.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ToggleCard
          label="Maintenance Requests Module"
          checked={config.includeRequests}
          onChange={(v) => update("includeRequests", v)}
        />
        <ToggleCard
          label="Stock Management Module"
          checked={config.includeStock}
          onChange={(v) => update("includeStock", v)}
        />
        <ToggleCard
          label="Purchase Management Module"
          checked={config.includePurchase}
          onChange={(v) => update("includePurchase", v)}
        />
        <ToggleCard
          label="API ManWinWin"
          checked={config.api}
          onChange={(v) => update("api", v)}
          hint="600 € / year"
        />
      </div>

      <div className="border rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-foreground">Plugins</p>
        <div className="grid grid-cols-2 gap-3">
          <ToggleCard
            label="Data Import Tool"
            checked={config.pluginImport}
            onChange={(v) => update("pluginImport", v)}
          />
          <ToggleCard
            label="Workflow Email Notifications"
            checked={config.pluginWorkflow}
            onChange={(v) => update("pluginWorkflow", v)}
          />
          <ToggleCard
            label="Advanced Reports"
            checked={config.pluginAdvancedReports}
            onChange={(v) => update("pluginAdvancedReports", v)}
          />
          <ToggleCard
            label="SLA"
            checked={config.pluginSLA}
            onChange={(v) => update("pluginSLA", v)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border rounded-lg p-3">
          <Label className="text-xs">Additional BackOffice users</Label>
          <Input
            type="number"
            min={0}
            value={config.additionalBackoffice}
            onChange={(e) =>
              update("additionalBackoffice", Math.max(0, Number(e.target.value) || 0))
            }
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Beyond the 3 included. Triggers extra SaaS hosting if hosting = SaaS.
          </p>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <Label className="text-xs">Additional Web/Mobile users</Label>
          <Input
            type="number"
            min={0}
            value={config.additionalWebUsers}
            onChange={(e) =>
              update("additionalWebUsers", Math.max(0, Number(e.target.value) || 0))
            }
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            20 € / user / month (billed yearly).
          </p>
        </div>
      </div>

      {/* Discounts */}
      <div className="bg-card border rounded-lg p-3 space-y-3">
        <p className="text-xs font-semibold text-foreground">Discounts</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Software discount %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={discounts.softwarePct}
              onChange={(e) => updDisc("softwarePct", clampPct(Number(e.target.value)))}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Applies to modules, plugins and additional BackOffice users.
            </p>
          </div>
          <div>
            <Label className="text-xs">Web/Mobile users discount %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={discounts.webUsersPct}
              onChange={(e) => updDisc("webUsersPct", clampPct(Number(e.target.value)))}
              disabled={config.additionalWebUsers <= 0}
            />
            <div className="flex items-center justify-between mt-2">
              <Label className="text-[11px] text-muted-foreground">Apply to renewals</Label>
              <Switch
                checked={discounts.webUsersRenews}
                onCheckedChange={(v) => updDisc("webUsersRenews", v)}
                disabled={discounts.webUsersPct <= 0 || config.additionalWebUsers <= 0}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">API discount %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={discounts.apiPct}
              onChange={(e) => updDisc("apiPct", clampPct(Number(e.target.value)))}
              disabled={!config.api}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Optional. API recurs each year.</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          S&AT and SaaS hosting are <strong>never</strong> discounted. KeepIT S&AT is computed from
          the original (gross) license amount.
        </p>
      </div>
    </div>
  );
}

export function BusinessServicesStep({ config, onChange }: BusinessStepsProps) {
  const discounts = config.discounts || DEFAULT_BUSINESS_DISCOUNTS;
  const clampPct = (n: number) => Math.max(0, Math.min(100, Number(n) || 0));

  const updImpl = <K extends keyof BusinessConfig["implementation"]>(
    k: K,
    v: BusinessConfig["implementation"][K],
  ) => onChange({ ...config, implementation: { ...config.implementation, [k]: v } });

  const addCustom = () =>
    updImpl("customServices", [
      ...config.implementation.customServices,
      { label: "Custom service", price: 0 },
    ]);
  const removeCustom = (i: number) =>
    updImpl(
      "customServices",
      config.implementation.customServices.filter((_, idx) => idx !== i),
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Implementation Type</Label>
          <Select
            value={config.implementation.type}
            onValueChange={(v) => updImpl("type", v as any)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RCI Business">RCI Business (default)</SelectItem>
              <SelectItem value="Onsite">Onsite</SelectItem>
              <SelectItem value="Custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            RCI Business automatically adds add-ons matching your selected modules/plugins.
          </p>
        </div>
        <div>
          <Label>Live Sessions (2h each)</Label>
          <Input
            type="number"
            min={0}
            value={config.implementation.liveSessions}
            onChange={(e) =>
              updImpl("liveSessions", Math.max(0, Number(e.target.value) || 0))
            }
          />
          <p className="text-[11px] text-muted-foreground mt-1">405 € each</p>
        </div>
        <div>
          <Label>Services discount %</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={discounts.servicesPct}
            onChange={(e) =>
              onChange({
                ...config,
                discounts: { ...discounts, servicesPct: clampPct(Number(e.target.value)) },
              })
            }
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Applies to RCI, Onsite, and custom service lines.
          </p>
        </div>
      </div>

      {config.implementation.type === "Onsite" && (
        <div className="grid grid-cols-3 gap-3 border rounded-lg p-3 bg-secondary/30">
          <div>
            <Label className="text-xs">Client days</Label>
            <Input
              type="number"
              min={0}
              value={config.implementation.onsiteClientDays || 0}
              onChange={(e) => updImpl("onsiteClientDays", Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label className="text-xs">BackOffice days</Label>
            <Input
              type="number"
              min={0}
              value={config.implementation.onsiteBackofficeDays || 0}
              onChange={(e) => updImpl("onsiteBackofficeDays", Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label className="text-xs">Region</Label>
            <Select
              value={(config.implementation.onsiteRegion as OnsiteRegion) || "Portugal"}
              onValueChange={(v) => updImpl("onsiteRegion", v as OnsiteRegion)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Portugal">Portugal (695€ / 530€)</SelectItem>
                <SelectItem value="International">International (840€ / 530€)</SelectItem>
                <SelectItem value="Western Europe">Western Europe (1080€ / 790€)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="col-span-3 text-[11px] text-muted-foreground italic">
            Rates: Client day / BackOffice day. Add custom service lines below for any extras.
          </p>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-secondary/50 flex items-center justify-between">
          <h4 className="text-xs font-semibold text-foreground">
            Custom service lines ({config.implementation.customServices.length})
          </h4>
          <Button size="sm" variant="outline" onClick={addCustom}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add custom
          </Button>
        </div>
        <div className="divide-y">
          {config.implementation.customServices.map((cs, idx) => (
            <div key={idx} className="p-2 grid grid-cols-12 gap-2 items-center">
              <Input
                className="col-span-7 h-8"
                value={cs.label}
                onChange={(e) => {
                  const next = [...config.implementation.customServices];
                  next[idx] = { ...cs, label: e.target.value };
                  updImpl("customServices", next);
                }}
              />
              <Input
                type="number"
                className="col-span-4 h-8 text-right"
                value={cs.price}
                onChange={(e) => {
                  const next = [...config.implementation.customServices];
                  next[idx] = { ...cs, price: Number(e.target.value) || 0 };
                  updImpl("customServices", next);
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeCustom(idx)}
                className="col-span-1 h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {config.implementation.customServices.length === 0 && (
            <div className="p-3 text-center text-xs text-muted-foreground">
              No custom services yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleCard({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between bg-card border rounded-lg p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function BusinessPreviewStep({
  rules,
  config,
  language,
  proposalMode,
}: BusinessStepsProps) {
  const models = useMemo<ProposalLicenseModel[]>(() => {
    if (proposalMode === "keepit_only") return ["keepit"];
    if (proposalMode === "useit_only") return ["useit"];
    return ["keepit", "useit"];
  }, [proposalMode]);

  const result = useMemo(
    () => computeBusinessOptions(rules, config, models),
    [rules, config, models],
  );

  const fmt = (n: number) => formatEuro(n, language);

  const allOptions: Array<{ key: ProposalLicenseModel; data: BusinessOptionTotals | null; title: string }> = [
    { key: "keepit", data: result.keepit, title: "KeepIT (lifetime license)" },
    { key: "useit", data: result.useit, title: "UseIT (annual license)" },
  ];
  const options = allOptions.filter((o) => models.includes(o.key));

  const isCompare = options.length > 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary">Business</Badge>
        <Badge variant="outline">
          Hosting: {config.deployment === "saas" ? "SaaS" : "On-Premise"}
        </Badge>
        <Badge variant="outline">
          Mode: {proposalMode === "compare_keepit_useit" ? "Compare KeepIT vs UseIT" : proposalMode === "keepit_only" ? "KeepIT only" : "UseIT only"}
        </Badge>
        {config.implementation.type === "Onsite" && (
          <Badge variant="outline">
            Onsite region: {config.implementation.onsiteRegion || "Portugal"}
          </Badge>
        )}
      </div>

      <div className={`grid ${isCompare ? "grid-cols-2" : "grid-cols-1"} gap-4`}>
        {options.map((opt) =>
          opt.data ? (
            <OptionCard key={opt.key} title={opt.title} data={opt.data} fmt={fmt} />
          ) : (
            <div key={opt.key} className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
              Pricing rules missing for {opt.title}
            </div>
          ),
        )}
      </div>

      {isCompare && result.keepit && result.useit && (
        <div className="bg-card border rounded-lg p-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground tracking-wide">5-year total — KeepIT</p>
            <p className="text-2xl font-bold text-primary tabular-nums">{fmt(result.keepit.totalFiveYears)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground tracking-wide">5-year total — UseIT</p>
            <p className="text-2xl font-bold text-primary tabular-nums">{fmt(result.useit.totalFiveYears)}</p>
          </div>
          <p className="col-span-2 text-[11px] text-muted-foreground italic">
            Validation check — with equivalent configuration, KeepIT generally becomes more
            economically advantageous around year 5.
          </p>
        </div>
      )}
    </div>
  );
}

function OptionCard({
  title,
  data,
  fmt,
}: {
  title: string;
  data: BusinessOptionTotals;
  fmt: (n: number) => string;
}) {
  const hasDiscounts = data.hasDiscounts;

  const renderLine = (l: BusinessLineItem) => {
    if (!hasDiscounts || l.discountAmount === 0) {
      return (
        <div key={`${l.code}-${l.label}`} className="flex justify-between text-xs">
          <span className="text-muted-foreground truncate pr-2">
            {l.label}
            {l.qty > 1 ? ` ×${l.qty}` : ""}
          </span>
          <span className="font-medium tabular-nums shrink-0">{fmt(l.netAmount)}</span>
        </div>
      );
    }
    return (
      <div key={`${l.code}-${l.label}`} className="grid grid-cols-12 gap-1 text-xs items-center">
        <span className="text-muted-foreground truncate col-span-5">
          {l.label}
          {l.qty > 1 ? ` ×${l.qty}` : ""}
        </span>
        <span className="text-right tabular-nums col-span-3 text-muted-foreground line-through">
          {fmt(l.amount)}
        </span>
        <span className="text-right tabular-nums col-span-2 text-amber-700">
          -{l.discountPct}%
        </span>
        <span className="text-right tabular-nums col-span-2 font-medium">{fmt(l.netAmount)}</span>
      </div>
    );
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <div className="px-3 py-2 bg-secondary/60 border-b">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <div className="p-3 space-y-3">
        <Section title="Software">
          {data.software.length === 0 ? <Empty /> : data.software.map(renderLine)}
        </Section>
        {data.api && (
          <Section title="API">{renderLine(data.api)}</Section>
        )}
        {data.hosting.length > 0 && (
          <Section title="SaaS Hosting">{data.hosting.map(renderLine)}</Section>
        )}
        {data.sat && (
          <Section title="S&AT">
            {data.model === "useit" ? (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{data.sat.label}</span>
                <span className="font-medium">included</span>
              </div>
            ) : (
              renderLine(data.sat)
            )}
          </Section>
        )}
        {data.services.length > 0 && (
          <Section title="Services (one-time)">{data.services.map(renderLine)}</Section>
        )}

        <div className="border-t pt-2 space-y-1">
          <div className="flex justify-between text-sm">
            <span>Year 1 total</span>
            <span className="font-bold text-primary tabular-nums">{fmt(data.totalYear1)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Year 2+ per year</span>
            <span className="font-semibold tabular-nums">{fmt(data.totalYear2Plus)}</span>
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>5-year cumulative</span>
            <span className="tabular-nums">{fmt(data.totalFiveYears)}</span>
          </div>
        </div>

        <CalculationBreakdown data={data} fmt={fmt} />
      </div>
    </div>
  );
}

function CalculationBreakdown({
  data,
  fmt,
}: {
  data: BusinessOptionTotals;
  fmt: (n: number) => string;
}) {
  const isKeepIt = data.model === "keepit";
  const softwareGross = data.software.reduce((s, l) => s + l.amount, 0);
  const softwareDiscounts = data.software.reduce((s, l) => s + l.discountAmount, 0);
  const softwareNet = data.software.reduce((s, l) => s + l.netAmount, 0);
  const apiGross = data.api?.amount || 0;
  const apiDisc = data.api?.discountAmount || 0;
  const apiNet = data.api?.netAmount || 0;
  const hostingBase = data.hosting.find((l) => l.code === "BUS_SAAS_HOSTING_BASE");
  const hostingExtra = data.hosting.find((l) => l.code === "BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE");
  const hostingTotal = data.hosting.reduce((s, l) => s + l.netAmount, 0);
  const servicesGross = data.services.reduce((s, l) => s + l.amount, 0);
  const servicesDisc = data.services.reduce((s, l) => s + l.discountAmount, 0);
  const servicesNet = data.services.reduce((s, l) => s + l.netAmount, 0);
  const satAmount = data.sat?.netAmount || 0;
  const satRule = isKeepIt && data.sat ? data.sat : null;

  const recurringSoftware = data.software
    .filter((l) => l.recurring)
    .reduce((s, l) => s + (l.discountAppliesToRenewal ? l.netAmount : l.amount), 0);
  const apiRecurring = data.api ? (data.api.discountAppliesToRenewal ? apiNet : apiGross) : 0;

  const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
    <div className={`flex justify-between text-[11px] ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );

  return (
    <details className="border-t pt-2 mt-2 group">
      <summary className="cursor-pointer text-[11px] font-semibold text-primary select-none hover:underline">
        Calculation breakdown (audit)
      </summary>
      <div className="mt-2 space-y-3 bg-secondary/30 rounded p-2">
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase font-bold text-muted-foreground">License</p>
          {data.software.map((l) => (
            <Row
              key={`brk-${l.code}-${l.label}`}
              label={`  ${l.label}${l.qty > 1 ? ` ×${l.qty}` : ""}`}
              value={fmt(l.amount)}
            />
          ))}
          <Row label="License gross subtotal" value={fmt(softwareGross)} bold />
          <Row label="– Software discounts" value={`-${fmt(softwareDiscounts)}`} />
          <Row label={isKeepIt ? "License net subtotal" : "Annual license net subtotal"} value={fmt(softwareNet)} bold />
        </div>

        <div className="space-y-0.5">
          <p className="text-[10px] uppercase font-bold text-muted-foreground">S&AT</p>
          {isKeepIt ? (
            <>
              <Row label="S&AT base = License gross subtotal" value={fmt(data.licenseSubtotal)} />
              <Row
                label={`S&AT % = ${satRule ? Math.round((satAmount / Math.max(1, data.licenseSubtotal)) * 10000) / 100 : 0}%`}
                value=""
              />
              <Row label="S&AT amount" value={fmt(satAmount)} bold />
            </>
          ) : (
            <Row label="S&AT" value="included in UseIT subscription" />
          )}
        </div>

        {data.api && (
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">API</p>
            <Row label="API gross" value={fmt(apiGross)} />
            <Row label="API discount" value={apiDisc > 0 ? `-${fmt(apiDisc)} (${data.api.discountPct}%)` : "—"} />
            <Row label="API net" value={fmt(apiNet)} bold />
          </div>
        )}

        {data.hosting.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">SaaS Hosting</p>
            <Row label="Hosting base" value={fmt(hostingBase?.netAmount || 0)} />
            <Row
              label={`Hosting additional BackOffice${hostingExtra ? ` ×${hostingExtra.qty}` : ""}`}
              value={fmt(hostingExtra?.netAmount || 0)}
            />
            <Row label="Hosting total" value={fmt(hostingTotal)} bold />
          </div>
        )}

        {data.services.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Services</p>
            <Row label="Services gross subtotal" value={fmt(servicesGross)} />
            <Row label="– Services discounts" value={`-${fmt(servicesDisc)}`} />
            <Row label="Services net subtotal" value={fmt(servicesNet)} bold />
          </div>
        )}

        <div className="space-y-0.5 border-t pt-2">
          <p className="text-[10px] uppercase font-bold text-muted-foreground">Totals</p>
          <Row
            label="Year 1 = Software net + API net + Hosting + S&AT + Services net"
            value={fmt(data.totalYear1)}
            bold
          />
          <Row
            label="Year 2+ = Recurring software + API recurring + Hosting + S&AT"
            value={fmt(data.totalYear2Plus)}
            bold
          />
          <Row label="  Recurring software portion" value={fmt(recurringSoftware)} />
          <Row label="  API recurring portion" value={fmt(apiRecurring)} />
          <Row label="5-year license = Y1 + 4 × Y2+" value={fmt(data.totalFiveYears)} bold />
          <Row label="5-year project total = same (services are one-time, included in Y1)" value={fmt(data.totalFiveYears)} />
        </div>
      </div>
    </details>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Empty() {
  return <p className="text-xs italic text-muted-foreground">—</p>;
}
