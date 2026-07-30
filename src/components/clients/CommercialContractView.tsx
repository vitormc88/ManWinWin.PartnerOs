import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useContractLines, useDeleteContractLine, type ContractLine } from "@/hooks/useContractLines";
import {
  classifyContractLine,
  computeContractFinancials,
  isRecurringClassifiedLine,
  UNCLASSIFIED_LABEL,
} from "@/lib/contract-lines";
import {
  buildCommercialGroups,
  effectiveLineCategory,
  resolveContractRenewal,
  type CommercialCategoryKey,
} from "@/lib/commercial-contract-view-model";
import { ContractLineDialog } from "./ContractLineDialog";
import { useLifecycleEvents, type LifecycleEvent } from "@/hooks/useLifecycleEvents";
import { useUpdateContract } from "@/hooks/useClients";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Sparkles, FileText, Calendar, RefreshCw, ChevronDown, ChevronRight,
  ExternalLink, CheckCircle2, Trophy, Package, UserPlus, Bell,
  Pencil, Info, ArrowDown, KeyRound, Puzzle, Server, LifeBuoy,
  Wrench, Tag, Minus, AlertTriangle, Plus, Trash2,
} from "lucide-react";

interface Props {
  contract: any;
  clientId: string;
  onEditLegacy?: () => void;
}

/* ─────────── Category model (shared, commercial not technical) ─────────── */

type CatKey = CommercialCategoryKey;

const CATEGORY_ICONS: Record<CatKey, any> = {
  license: KeyRound,
  modules: Package,
  plugins: Puzzle,
  hosting: Server,
  support: LifeBuoy,
  services: Wrench,
  discounts: Tag,
  needs_review: AlertTriangle,
};

function isRecurringLine(line: ContractLine) {
  return isRecurringClassifiedLine(classifyContractLine(line));
}


function fmt(amount: number, currency = "EUR") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "EUR", maximumFractionDigits: 0 }).format(amount || 0);
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ───────────────────────── Component ───────────────────────── */

export function CommercialContractView({ contract, clientId }: Props) {
  const { data: lines = [], isLoading: linesLoading } = useContractLines(contract.id);
  const { data: events = [] } = useLifecycleEvents(clientId);
  const updateContract = useUpdateContract();
  const deleteLine = useDeleteContractLine();
  const currency = contract.currency || "EUR";
  const [editOpen, setEditOpen] = useState(false);
  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<ContractLine | null>(null);

  const openNewLine = () => { setEditingLine(null); setLineDialogOpen(true); };
  const openEditLine = (l: ContractLine) => { setEditingLine(l); setLineDialogOpen(true); };
  const removeLine = async (l: ContractLine) => {
    try { await deleteLine.mutateAsync(l.id); toast.success("Contract line removed"); }
    catch (e: any) { toast.error(e?.message || "Failed to remove line"); }
  };

  const { data: renewal } = useQuery({
    queryKey: ["contract-renewal", contract.id, clientId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("renewals").select("*").eq("client_id", clientId)
        .order("renewal_date", { ascending: true });
      const list = (data || []) as any[];
      return list.find(r => r.target_type === "contract" && r.target_id === contract.id) || list[0] || null;
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
        .select("id, initial_contract_value, recurring_contract_value, billing_frequency, license_end_date, license_status")
        .eq("contract_id", contract.id).maybeSingle();
      return data;
    },
  });

  /* Values — structured contract lines are the calculation source when reliable.
     Legacy header fields and stored proposal/license totals are only fallbacks
     and are never summed together with the lines (no double counting). */
  const financials = useMemo(() => computeContractFinancials(lines), [lines]);

  const year1Value = useMemo(() => {
    if (financials.hasReliableLines) return financials.year1Value;
    if (proposal?.total_year_1) return Number(proposal.total_year_1);
    if (license?.initial_contract_value) return Number(license.initial_contract_value);
    return Number(contract.calculated_total || contract.contract_value || 0);
  }, [financials, proposal, license, contract]);

  const recurringValue = useMemo(() => {
    if (financials.hasReliableLines) return financials.recurringArr;
    if (renewal?.estimated_value) return Number(renewal.estimated_value);
    if (proposal?.total_recurring) return Number(proposal.total_recurring);
    if (license?.recurring_contract_value) return Number(license.recurring_contract_value);
    return 0;
  }, [financials, renewal, proposal, license]);

  /** True when the displayed figures are not an exact line-based calculation. */
  const isEstimated = !financials.hasReliableLines;

  const oneTimeValue = financials.hasReliableLines
    ? financials.oneTimeValue
    : Math.max(0, year1Value - recurringValue);
  const recurringLines = lines.filter(isRecurringLine);
  const oneTimeLines = lines.filter(l => !isRecurringLine(l));
  const recurringPct = year1Value > 0 ? Math.round((recurringValue / year1Value) * 100) : 0;
  const oneTimePct = year1Value > 0 ? Math.max(0, 100 - recurringPct) : 0;


  const groups = useMemo(
    () => buildCommercialGroups(lines).map((g) => ({ ...g, icon: CATEGORY_ICONS[g.key] })),
    [lines]
  );

  // Single renewal source of truth (workflow row → contract end → license end).
  const resolvedRenewal = resolveContractRenewal({ renewal, contract, license });
  const renewalDate = resolvedRenewal.date;
  const billing = renewal?.billing_frequency || license?.billing_frequency || "Annual";

  const timelineTypes = new Set([
    "proposal_won", "client_created", "client_linked", "license_created",
    "contract_created", "renewal_scheduled", "renewal_renewed",
  ]);
  const timelineEvents = events.filter(e => timelineTypes.has(e.event_type)).slice().reverse();

  /* Renewal preview groups: license/hosting/support get a single ✓; modules/plugins are expandable counts */
  const renewLicense = recurringLines.filter(l => effectiveLineCategory(l) === "license");
  const renewHosting = recurringLines.filter(l => effectiveLineCategory(l) === "hosting");
  const renewSupport = recurringLines.filter(l => ["sat", "mww_web"].includes(effectiveLineCategory(l)));
  const renewModules = recurringLines.filter(l => effectiveLineCategory(l) === "module");
  const renewPlugins = recurringLines.filter(l => effectiveLineCategory(l) === "plugin");

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardContent className="p-0">

        {/* ═══ 1. HERO SUMMARY ═══ */}
        <div className="relative bg-gradient-to-br from-primary/5 via-background to-background border-b border-border/60 px-8 py-10">
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                Commercial Agreement
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {fmtDate(contract.contract_start_date)} → {fmtDate(contract.contract_end_date)} · {currency}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-6 md:gap-8">
            <HeroMetric label="Year 1 Revenue" value={fmt(year1Value, currency)} emphasis />
            <div className="hidden md:flex justify-center text-muted-foreground/40">
              <ArrowDown className="h-5 w-5 -rotate-90" />
            </div>
            <HeroMetric label={isEstimated ? "Annual Renewal (estimated)" : "Annual Renewal (ARR)"} value={fmt(recurringValue, currency)} sub={fmtDate(renewalDate)} accent />
            <div className="hidden md:block w-px h-12 bg-border/60" />
            <HeroMetric label="Billing" value={billing} muted />
          </div>
        </div>

        <div className="px-8 py-7 space-y-8">

          {/* ═══ 2. PROPOSAL LINEAGE ═══ */}
          {proposal && (
            <button
              onClick={() => window.open(`/leads/${proposal.lead_id}?tab=proposals`, "_blank")}
              className="w-full flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3.5 py-2 hover:bg-muted/40 transition"
            >
              <div className="flex items-center gap-2 text-xs">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="text-foreground">Generated from <strong>Proposal v{proposal.version}</strong></span>
                <Badge variant="secondary" className="text-[10px] capitalize">{proposal.status}</Badge>
                <span className="text-muted-foreground">· {fmtDate(proposal.generated_at || proposal.proposal_date)}</span>
              </div>
              <span className="flex items-center gap-1 text-xs text-primary font-medium">
                Open Proposal <ExternalLink className="h-3 w-3" />
              </span>
            </button>
          )}

          {/* ═══ 3. COMMERCIAL SUMMARY ═══ */}
          <section>
            <SectionTitle>Commercial Summary</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryTile label="Year 1 Revenue" value={fmt(year1Value, currency)} />
              <SummaryTile label="Annual Renewal" value={fmt(recurringValue, currency)} accent />
              <SummaryTile label="Renewal Date" value={fmtDate(renewalDate)} />
              <SummaryTile label="Billing" value={billing} />
              <SummaryTile label="Currency" value={currency} />
            </div>
            <p className="mt-2.5 text-[11px] text-muted-foreground italic">
              Commercial values are automatically calculated from the commercial structure below. No manual totals are maintained.
            </p>
          </section>

          {/* ═══ 4. RENEWAL PREVIEW ═══ */}
          <section>
            <SectionTitle icon={RefreshCw}>Renewal Preview</SectionTitle>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5 rounded-lg border border-border/60 bg-card p-5">
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Renews</div>
                  {recurringLines.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No recurring items.</p>
                  ) : (
                    <ul className="space-y-1">
                      {renewLicense.map(l => <RenewRow key={l.id} label={l.description} />)}
                      {renewHosting.map(l => <RenewRow key={l.id} label={l.description} />)}
                      {renewSupport.map(l => <RenewRow key={l.id} label={l.description} />)}
                      {renewModules.length > 0 && (
                        <RenewCollapse label={`${renewModules.length} ${renewModules.length === 1 ? "Module" : "Modules"}`} items={renewModules} currency={currency} />
                      )}
                      {renewPlugins.length > 0 && (
                        <RenewCollapse label={`${renewPlugins.length} ${renewPlugins.length === 1 ? "Plugin" : "Plugins"}`} items={renewPlugins} currency={currency} />
                      )}
                    </ul>
                  )}
                </div>

                {oneTimeLines.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Not Renewed</div>
                    <ul className="space-y-1">
                      {oneTimeLines.map(l => (
                        <li key={l.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Minus className="h-3 w-3" /> {l.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="lg:border-l lg:border-border/60 lg:pl-5 flex lg:flex-col items-end lg:items-start justify-between gap-1">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Estimated Renewal</div>
                  <div className="text-2xl font-bold tabular-nums text-primary mt-1">{fmt(recurringValue, currency)}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {fmtDate(renewalDate)} · {billing}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ═══ 5. KPI CARDS ═══ */}
          <section>
            <SectionTitle>Revenue Composition</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiTile label="Recurring"      value={fmt(recurringValue, currency)} hint={`${recurringPct}%`} accent />
              <KpiTile label="One-Time"       value={fmt(oneTimeValue, currency)}   hint={`${oneTimePct}%`} />
              <KpiTile label="Recurring Items" value={String(recurringLines.length)} />
              <KpiTile label="One-Time Items"  value={String(oneTimeLines.length)} />
            </div>
          </section>

          {/* ═══ 6. COMMERCIAL STRUCTURE ═══ */}
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <SectionTitle inline>Commercial Structure</SectionTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{lines.length} {lines.length === 1 ? "line" : "lines"}</span>
                <Button variant="outline" size="sm" className="h-7" onClick={openNewLine}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add line
                </Button>
              </div>
            </div>
            {financials.unclassifiedCount > 0 && (
              <div className="mb-2.5 flex items-start gap-2 rounded-md border border-warning/50 bg-warning/5 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  {financials.unclassifiedCount} line{financials.unclassifiedCount === 1 ? "" : "s"} could not be
                  classified. They stay visible under “{UNCLASSIFIED_LABEL}” and are excluded from ARR until a
                  canonical type is chosen.
                </p>
              </div>
            )}
            {linesLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : groups.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-md">
                No commercial lines yet.
              </p>
            ) : (
              <div className="space-y-2">
                {groups.map(g => (
                  <StructureGroup
                    key={g.key}
                    group={g}
                    currency={currency}
                    defaultOpen={g.key === "license" || g.key === "needs_review"}
                    onEditLine={openEditLine}
                    onDeleteLine={removeLine}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ═══ 7. COMMERCIAL TIMELINE ═══ */}
          {timelineEvents.length > 0 && (
            <section>
              <SectionTitle>Commercial Timeline</SectionTitle>
              <Timeline events={timelineEvents} nextRenewalDate={renewalDate} />
            </section>
          )}

          {/* ═══ 8. TECHNICAL DETAILS ═══ */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground py-2.5 border-t border-border/60 group">
                <span className="flex items-center gap-1.5 font-medium">
                  <Info className="h-3 w-3" /> Technical Details
                </span>
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs pt-3 pb-1">
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

        </div>
      </CardContent>

      <ContractLineDialog
        open={lineDialogOpen}
        onOpenChange={setLineDialogOpen}
        contractId={contract.id}
        clientId={clientId}
        defaultCurrency={currency}
        line={editingLine}
      />

      {/* ═══ 9. EDIT DRAWER ═══ */}
      <EditCommercialAgreementDrawer
        open={editOpen}
        onOpenChange={setEditOpen}
        contract={contract}
        saving={updateContract.isPending}
        onSave={async (patch) => {
          try {
            await updateContract.mutateAsync({ id: contract.id, ...patch });
            toast.success("Commercial agreement updated");
            setEditOpen(false);
          } catch (e: any) { toast.error(e?.message || "Failed to update"); }
        }}
      />
    </Card>
  );
}

/* ─────────────── Subcomponents ─────────────── */

function SectionTitle({ children, icon: Icon, inline }: { children: React.ReactNode; icon?: any; inline?: boolean }) {
  return (
    <h4 className={`text-sm font-semibold flex items-center gap-1.5 ${inline ? "" : "mb-2.5"}`}>
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
      {children}
    </h4>
  );
}

function HeroMetric({ label, value, sub, emphasis, accent, muted }: { label: string; value: string; sub?: string; emphasis?: boolean; accent?: boolean; muted?: boolean }) {
  return (
    <div className={muted ? "text-muted-foreground" : ""}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-1.5">{label}</div>
      <div className={`tabular-nums font-bold leading-tight ${emphasis ? "text-4xl" : accent ? "text-4xl text-primary" : "text-2xl"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-1.5">{sub}</div>}
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border/60 bg-card px-3.5 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`tabular-nums mt-1 font-semibold text-sm ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function KpiTile({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-3.5 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`text-lg font-bold tabular-nums mt-1 ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{hint}</div>}
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

function RenewRow({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-1.5 text-xs">
      <CheckCircle2 className="h-3 w-3 text-success" />
      <span className="text-foreground">{label}</span>
    </li>
  );
}

function RenewCollapse({ label, items, currency }: { label: string; items: ContractLine[]; currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1.5 text-xs hover:text-primary transition">
            <CheckCircle2 className="h-3 w-3 text-success" />
            <span className="text-foreground">{label}</span>
            <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="ml-5 mt-1 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
          <ul className="space-y-0.5 border-l border-border/60 pl-2.5">
            {items.map(i => (
              <li key={i.id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{i.description}</span>
                <span className="tabular-nums">{fmt(Number(i.amount), i.currency || currency)}</span>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function StructureGroup({ group, currency, defaultOpen, onEditLine, onDeleteLine }: {
  group: { key: CatKey; label: string; icon: any; items: ContractLine[]; subtotal: number; recurring: boolean };
  currency: string;
  defaultOpen?: boolean;
  onEditLine?: (l: ContractLine) => void;
  onDeleteLine?: (l: ContractLine) => void;
}) {
  const unclassified = group.key === "needs_review";
  const [open, setOpen] = useState(!!defaultOpen);
  const Icon = group.icon;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`rounded-md border bg-card overflow-hidden ${unclassified ? "border-warning/50" : "border-border/60"}`}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/30 transition">
            <div className="flex items-center gap-2.5">
              {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <Icon className={`h-3.5 w-3.5 ${unclassified ? "text-warning" : "text-muted-foreground"}`} />
              <span className={`text-sm font-semibold ${unclassified ? "text-warning" : ""}`}>{group.label}</span>
              <span className="text-[11px] text-muted-foreground">· {group.items.length} {group.items.length === 1 ? "item" : "items"}</span>
            </div>
            <span className="text-sm font-semibold tabular-nums">{fmt(group.subtotal, currency)}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
          <div className="divide-y divide-border/40 border-t border-border/40">
            {group.items.map(line => {
              const recurring = isRecurringLine(line);
              return (
                <div key={line.id} className="grid grid-cols-12 gap-2 items-center px-3.5 py-2 text-xs group/line">
                  <div className="col-span-6">
                    <div className="text-sm text-foreground flex items-center gap-1.5 flex-wrap">
                      {line.description}
                      {unclassified && (
                        <span className="text-[10px] text-warning border border-warning/50 rounded px-1" title={`Stored type "${line.line_type || "empty"}"`}>
                          needs review
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground capitalize mt-0.5">
                      {line.billing_frequency || "frequency not set"}
                      {line.start_date ? ` · ${fmtDate(line.start_date)}` : ""}
                      {line.end_date ? ` → ${fmtDate(line.end_date)}` : ""}
                    </div>
                  </div>
                  <div className="col-span-2 text-[10px] text-muted-foreground">
                    {unclassified ? "Excluded from ARR" : recurring ? "Included in renewal" : "One-time"}
                  </div>
                  <div className="col-span-2 text-right text-sm font-medium tabular-nums">
                    {line.amount == null ? <span className="text-warning">no amount</span> : fmt(Number(line.amount), line.currency || currency)}
                  </div>
                  <div className="col-span-2 flex justify-end gap-1">
                    {onEditLine && (
                      <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => onEditLine(line)} aria-label="Edit line">
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                    {onDeleteLine && (
                      <Button variant="ghost" size="sm" className="h-6 px-1.5 text-muted-foreground hover:text-destructive" onClick={() => onDeleteLine(line)} aria-label="Delete line">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
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

const TIMELINE_META: Record<string, { icon: any; label: string }> = {
  proposal_won:      { icon: Trophy,    label: "Proposal Won" },
  client_created:    { icon: UserPlus,  label: "Client Created" },
  client_linked:     { icon: UserPlus,  label: "Client Linked" },
  license_created:   { icon: KeyRound,  label: "License Activated" },
  contract_created:  { icon: FileText,  label: "Commercial Agreement Generated" },
  renewal_scheduled: { icon: Bell,      label: "Renewal Scheduled" },
  renewal_renewed:   { icon: RefreshCw, label: "Renewal Completed" },
};

function Timeline({ events, nextRenewalDate }: { events: LifecycleEvent[]; nextRenewalDate?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSE_AT = 4;
  const visible = expanded || events.length <= COLLAPSE_AT ? events : events.slice(0, COLLAPSE_AT);
  return (
    <div>
      <ol className="relative">
        {visible.map((e, i) => {
          const meta = TIMELINE_META[e.event_type] || { icon: FileText, label: e.event_title };
          const Icon = meta.icon;
          return (
            <li key={e.id} className="flex gap-3 pb-3 last:pb-0 relative">
              <div className="flex flex-col items-center">
                <span className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                </span>
                {i < visible.length - 1 && <span className="flex-1 w-px bg-border/60 my-0.5" />}
              </div>
              <div className="flex-1 pt-1 pb-1">
                <div className="text-sm font-medium text-foreground">{meta.label}</div>
                <div className="text-[11px] text-muted-foreground">{fmtDate(e.occurred_at)}</div>
              </div>
            </li>
          );
        })}
        {nextRenewalDate && (
          <li className="flex gap-3 relative">
            <div className="flex flex-col items-center">
              <span className="h-7 w-7 rounded-full bg-muted border border-dashed border-border flex items-center justify-center shrink-0">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            </div>
            <div className="flex-1 pt-1">
              <div className="text-sm font-medium text-muted-foreground">Next Renewal</div>
              <div className="text-[11px] text-muted-foreground">{fmtDate(nextRenewalDate)}</div>
            </div>
          </li>
        )}
      </ol>
      {events.length > COLLAPSE_AT && (
        <button onClick={() => setExpanded(v => !v)} className="text-xs text-primary hover:underline mt-2">
          {expanded ? "Show less" : `Show ${events.length - COLLAPSE_AT} earlier event${events.length - COLLAPSE_AT === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}

/* ─────────────── Edit Drawer ─────────────── */

function EditCommercialAgreementDrawer({
  open, onOpenChange, contract, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: any;
  saving: boolean;
  onSave: (patch: Record<string, any>) => Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, any>>({});
  useEffect(() => {
    if (open) {
      setForm({
        contract_start_date: contract.contract_start_date || "",
        contract_end_date: contract.contract_end_date || "",
        notice_period_days: contract.notice_period_days ?? 30,
        num_installments: contract.num_installments ?? 1,
        renewal_increase_pct: contract.renewal_increase_pct ?? 0,
        billing_notes: contract.billing_notes || "",
        observations: contract.observations || "",
      });
    }
  }, [open, contract]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Commercial Agreement</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Commercial values are derived from contract lines and cannot be edited here.
          </p>
        </SheetHeader>

        <div className="space-y-4 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={form.contract_start_date || ""} onChange={(e) => set("contract_start_date", e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={form.contract_end_date || ""} onChange={(e) => set("contract_end_date", e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Notice Days</Label>
              <Input type="number" value={form.notice_period_days ?? ""} onChange={(e) => set("notice_period_days", Number(e.target.value))} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Installments</Label>
              <Input type="number" value={form.num_installments ?? ""} onChange={(e) => set("num_installments", Number(e.target.value))} className="h-9" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Renewal Increase (%)</Label>
            <Input type="number" step="0.1" value={form.renewal_increase_pct ?? ""} onChange={(e) => set("renewal_increase_pct", Number(e.target.value))} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Billing Notes</Label>
            <Textarea rows={2} value={form.billing_notes || ""} onChange={(e) => set("billing_notes", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Observations</Label>
            <Textarea rows={3} value={form.observations || ""} onChange={(e) => set("observations", e.target.value)} />
          </div>

          <div className="rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
            <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
            <span>Contract value, hosting, SAT, MWW Web and totals are calculated from the commercial structure and are the source of truth.</span>
          </div>
        </div>

        <SheetFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
