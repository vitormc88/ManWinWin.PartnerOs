import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useContractLines, type ContractLine } from "@/hooks/useContractLines";
import { useLifecycleEvents, type LifecycleEvent } from "@/hooks/useLifecycleEvents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sparkles, FileText, Calendar, RefreshCw, ChevronDown, ChevronRight,
  Repeat, CircleDot, ExternalLink, CheckCircle2, XCircle, Trophy,
  Package, UserPlus, Bell, Pencil, Info,
} from "lucide-react";

interface Props {
  contract: any;
  clientId: string;
  onEditLegacy: () => void;
}

const GROUP_DEFS: Array<{
  key: string;
  label: string;
  types: string[];
  defaultOpen?: boolean;
}> = [
  { key: "license", label: "Core License", types: ["license"], defaultOpen: true },
  { key: "services", label: "Annual Services", types: ["hosting", "sat", "mww_web"] },
  { key: "modules", label: "Modules & Plugins", types: ["module", "plugin"] },
  { key: "professional", label: "Professional Services", types: ["implementation", "training", "other"] },
  { key: "discounts", label: "Discounts", types: ["discount"] },
];

const ONE_TIME_TYPES = new Set(["implementation", "training"]);

function isRecurring(line: ContractLine) {
  const f = (line.billing_frequency || "").toLowerCase();
  if (f === "one-time" || f === "one_time" || f === "once") return false;
  if (ONE_TIME_TYPES.has(line.line_type)) return false;
  if (f === "yearly" || f === "annual" || f === "monthly" || f === "quarterly") return true;
  // default: recurring for license/hosting/sat/mww_web/module/plugin
  return ["license", "hosting", "sat", "mww_web", "module", "plugin"].includes(line.line_type);
}

function fmt(amount: number, currency = "EUR") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "EUR", maximumFractionDigits: 0 }).format(amount || 0);
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function CommercialContractView({ contract, clientId, onEditLegacy }: Props) {
  const { data: lines = [], isLoading: linesLoading } = useContractLines(contract.id);
  const { data: events = [] } = useLifecycleEvents(clientId);
  const currency = contract.currency || "EUR";

  const { data: renewal } = useQuery({
    queryKey: ["contract-renewal", contract.id, clientId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("renewals")
        .select("*")
        .eq("client_id", clientId)
        .order("renewal_date", { ascending: true });
      const list = (data || []) as any[];
      // prefer one explicitly targeting this contract
      const targeted = list.find(r => (r.target_type === "contract" && r.target_id === contract.id));
      return targeted || list[0] || null;
    },
  });

  const { data: proposal } = useQuery({
    queryKey: ["contract-proposal", contract.source_proposal_id],
    enabled: !!contract.source_proposal_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("id, version, status, total_year_1, total_recurring, proposal_date, generated_at, lead_id")
        .eq("id", contract.source_proposal_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: license } = useQuery({
    queryKey: ["contract-license", contract.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("licenses")
        .select("id, initial_contract_value, recurring_contract_value, billing_frequency")
        .eq("contract_id", contract.id)
        .maybeSingle();
      return data;
    },
  });

  // Commercial values — never recalculate; use stored values with safe fallbacks.
  const year1Value = useMemo(() => {
    if (proposal?.total_year_1) return Number(proposal.total_year_1);
    if (license?.initial_contract_value) return Number(license.initial_contract_value);
    const calc = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
    return calc || Number(contract.calculated_total || contract.contract_value || 0);
  }, [proposal, license, lines, contract]);

  const recurringValue = useMemo(() => {
    if (renewal?.estimated_value) return Number(renewal.estimated_value);
    if (proposal?.total_recurring) return Number(proposal.total_recurring);
    if (license?.recurring_contract_value) return Number(license.recurring_contract_value);
    return lines.filter(isRecurring).reduce((s, l) => s + Number(l.amount || 0), 0);
  }, [renewal, proposal, license, lines]);

  const oneTimeValue = Math.max(0, year1Value - recurringValue);

  const recurringLines = lines.filter(isRecurring);
  const oneTimeLines = lines.filter(l => !isRecurring(l));

  const groups = useMemo(() => {
    return GROUP_DEFS.map(g => {
      const items = lines.filter(l => g.types.includes(l.line_type));
      const subtotal = items.reduce((s, l) => s + Number(l.amount || 0), 0);
      return { ...g, items, subtotal };
    }).filter(g => g.items.length > 0);
  }, [lines]);

  const totalItems = lines.length || 1;
  const recurringPct = Math.round((recurringLines.length / totalItems) * 100);
  const oneTimePct = 100 - recurringPct;

  const renewalDate = renewal?.renewal_date || contract.contract_end_date;
  const billing = renewal?.billing_frequency || license?.billing_frequency || "Annual";

  const timelineTypes = new Set([
    "proposal_won", "client_created", "client_linked", "license_created",
    "contract_created", "renewal_scheduled", "renewal_renewed",
  ]);
  const timelineEvents = events.filter(e => timelineTypes.has(e.event_type)).slice().reverse();

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Contract · {fmtDate(contract.contract_start_date)} → {fmtDate(contract.contract_end_date)}
            <Badge variant="secondary" className="text-[10px]">{currency}</Badge>
          </CardTitle>
          <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary">
            <Sparkles className="h-3 w-3" /> Generated from approved proposal
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onEditLegacy}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit dates & notes
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Proposal Lineage banner */}
        {proposal && (
          <button
            onClick={() => window.open(`/leads/${proposal.lead_id}?tab=proposals`, "_blank")}
            className="w-full text-left flex items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 hover:bg-primary/10 transition"
          >
            <div className="flex items-center gap-2 text-xs">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span className="text-foreground">Generated from <strong>Proposal v{proposal.version}</strong></span>
              <Badge variant="secondary" className="text-[10px]">{proposal.status}</Badge>
              <span className="text-muted-foreground">· {fmtDate(proposal.generated_at || proposal.proposal_date)}</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}

        {/* Commercial Summary + Renewal Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
              Commercial Summary
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Metric label="Year 1 Value" value={fmt(year1Value, currency)} primary />
              <Metric label="Recurring (Year 2+ ARR)" value={fmt(recurringValue, currency)} accent />
              <Metric label="One-time Services" value={fmt(oneTimeValue, currency)} />
              <Metric label="Renewal Date" value={fmtDate(renewalDate)} />
              <Metric label="Billing" value={billing} />
              <Metric label="Currency" value={currency} />
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3" /> Next Renewal
            </div>
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-2xl font-semibold tabular-nums">{fmt(recurringValue, currency)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">on {fmtDate(renewalDate)}</div>
              </div>
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Calendar className="h-3 w-3" /> {billing}
              </Badge>
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Includes</div>
              {recurringLines.length === 0 ? (
                <p className="text-xs text-muted-foreground">No recurring items.</p>
              ) : (
                <ul className="space-y-0.5">
                  {recurringLines.map(l => (
                    <li key={l.id} className="flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-success" />
                      <span className="text-foreground">{l.description}</span>
                      <span className="ml-auto text-muted-foreground tabular-nums">{fmt(Number(l.amount), currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {oneTimeLines.length > 0 && (
                <>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold pt-2">Excluded</div>
                  <ul className="space-y-0.5">
                    {oneTimeLines.map(l => (
                      <li key={l.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <XCircle className="h-3 w-3" />
                        <span>{l.description}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Commercial Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile label="Recurring" value={`${recurringPct}%`} />
          <KpiTile label="One-time" value={`${oneTimePct}%`} />
          <KpiTile label="Recurring items" value={String(recurringLines.length)} />
          <KpiTile label="One-time items" value={String(oneTimeLines.length)} />
        </div>

        {/* Commercial Structure */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">Commercial Structure</h4>
            <span className="text-xs text-muted-foreground">{lines.length} lines</span>
          </div>
          {linesLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : groups.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-md">
              No commercial lines yet.
            </p>
          ) : (
            <div className="space-y-2">
              {groups.map(g => (
                <StructureGroup key={g.key} group={g} currency={currency} />
              ))}
            </div>
          )}
        </div>

        {/* Financial Timeline */}
        {timelineEvents.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Commercial Timeline</h4>
            <ol className="space-y-1.5">
              {timelineEvents.map(e => (
                <TimelineStep key={e.id} event={e} />
              ))}
            </ol>
          </div>
        )}

        {/* Technical Details (collapsible) */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground py-2 border-t border-border/60">
              <span className="flex items-center gap-1.5">
                <Info className="h-3 w-3" /> Technical details
              </span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs pt-2">
              <TechRow label="Start" value={fmtDate(contract.contract_start_date)} />
              <TechRow label="End" value={fmtDate(contract.contract_end_date)} />
              <TechRow label="Notice" value={contract.notice_period_days ? `${contract.notice_period_days} days` : "—"} />
              <TechRow label="Installments" value={contract.num_installments ?? "—"} />
              <TechRow label="Renewal increase" value={contract.renewal_increase_pct ? `${contract.renewal_increase_pct}%` : "—"} />
              <TechRow label="Price table" value={contract.price_table_reference || "—"} />
            </div>
            {contract.observations && (
              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Observations</p>
                <p className="text-xs text-foreground">{contract.observations}</p>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, primary, accent }: { label: string; value: string; primary?: boolean; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`tabular-nums mt-0.5 ${primary ? "text-xl font-bold" : accent ? "text-lg font-semibold text-primary" : "text-sm font-medium"}`}>
        {value}
      </div>
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function TechRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}

function StructureGroup({ group, currency }: { group: { key: string; label: string; items: ContractLine[]; subtotal: number; defaultOpen?: boolean }; currency: string }) {
  const [open, setOpen] = useState(!!group.defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border/60 bg-card">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30">
            <div className="flex items-center gap-2">
              {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="text-sm font-semibold">{group.label}</span>
              <Badge variant="ghost" className="text-[10px]">{group.items.length}</Badge>
            </div>
            <span className="text-sm font-semibold tabular-nums">{fmt(group.subtotal, currency)}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="divide-y divide-border/40 border-t border-border/40">
            {group.items.map(line => {
              const recurring = isRecurring(line);
              return (
                <div key={line.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2 text-xs">
                  <div className="col-span-6">
                    <div className="text-sm text-foreground">{line.description}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {recurring ? (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <Repeat className="h-2.5 w-2.5" /> Recurring
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <CircleDot className="h-2.5 w-2.5" /> One-time
                        </Badge>
                      )}
                      {line.billing_frequency && (
                        <span className="text-[10px] text-muted-foreground capitalize">{line.billing_frequency}</span>
                      )}
                      {line.related_license_id && (
                        <span className="text-[10px] text-muted-foreground">· Linked to license</span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-4 text-[10px] text-muted-foreground">
                    {recurring ? "Included in renewal" : "Not renewed"}
                  </div>
                  <div className="col-span-2 text-right text-sm font-medium tabular-nums">
                    {fmt(Number(line.amount), line.currency || currency)}
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

const TIMELINE_ICONS: Record<string, any> = {
  proposal_won: Trophy,
  client_created: UserPlus,
  client_linked: UserPlus,
  license_created: Package,
  contract_created: FileText,
  renewal_scheduled: Bell,
  renewal_renewed: RefreshCw,
};

function TimelineStep({ event }: { event: LifecycleEvent }) {
  const Icon = TIMELINE_ICONS[event.event_type] || FileText;
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </span>
      <span className="text-foreground">{event.event_title}</span>
      <span className="text-muted-foreground ml-auto">{fmtDate(event.occurred_at)}</span>
    </li>
  );
}
