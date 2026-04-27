/**
 * Business proposal wizard step content.
 *
 * Renders Software/Services/Preview steps for Business proposals.
 * Independent from the Professional flow — does NOT touch Professional logic.
 */
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import {
  computeBusinessOptions,
  type BusinessConfig,
  type BusinessOptionTotals,
  type BusinessLineItem,
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
            Beyond the 3 included. Triggers extra SaaS hosting if deployment = SaaS.
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
    </div>
  );
}

export function BusinessServicesStep({ config, onChange }: BusinessStepsProps) {
  const update = <K extends keyof BusinessConfig>(k: K, v: BusinessConfig[K]) =>
    onChange({ ...config, [k]: v });

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
      <div className="grid grid-cols-2 gap-4">
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
            <Input
              value={config.implementation.onsiteRegion || ""}
              onChange={(e) => updImpl("onsiteRegion", e.target.value)}
            />
          </div>
          <p className="col-span-3 text-[11px] text-muted-foreground italic">
            Onsite pricing for Business is using simple day inputs in this MVP. Add line items
            below as Custom services.
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

  const options: Array<{ key: ProposalLicenseModel; data: BusinessOptionTotals | null; title: string }> = [
    { key: "keepit", data: result.keepit, title: "KeepIT (lifetime license)" },
    { key: "useit", data: result.useit, title: "UseIT (annual license)" },
  ].filter((o) => models.includes(o.key));

  const isCompare = options.length > 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">Business</Badge>
        <Badge variant="outline">
          Deployment: {config.deployment === "saas" ? "SaaS" : "On-Premise"}
        </Badge>
        <Badge variant="outline">
          Mode: {proposalMode === "compare_keepit_useit" ? "Compare KeepIT vs UseIT" : proposalMode === "keepit_only" ? "KeepIT only" : "UseIT only"}
        </Badge>
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
  const renderLine = (l: BusinessLineItem) => (
    <div key={`${l.code}-${l.label}`} className="flex justify-between text-xs">
      <span className="text-muted-foreground truncate pr-2">
        {l.label}
        {l.qty > 1 ? ` ×${l.qty}` : ""}
      </span>
      <span className="font-medium tabular-nums shrink-0">{fmt(l.amount)}</span>
    </div>
  );

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
      </div>
    </div>
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
