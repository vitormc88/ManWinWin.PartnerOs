import { useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Gauge,
  Lightbulb,
  Package,
  Plug,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  useClientCommercialIntelligence,
  type ClientCommercialIntelligence,
  type CommercialOpportunity,
  type CommercialRecommendedAction,
} from "@/hooks/useClientCommercialIntelligence";
import { ClientLifecycleTimeline } from "./ClientLifecycleTimeline";

interface Props {
  clientId: string;
  client?: any;
  ownerName?: string | null;
  contractStatus?: string | null;
  billing?: string | null;
  onViewFullTimeline?: () => void;
}

const fmtCurrency = (n: number | null | undefined, currency = "EUR") => {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(n));
  } catch {
    return `€${Math.round(Number(n) || 0)}`;
  }
};

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
};

function scoreTone(score: number) {
  if (score >= 80) return { label: "Strong", tone: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-200" };
  if (score >= 60) return { label: "Stable", tone: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-200" };
  if (score >= 40) return { label: "Developing", tone: "text-orange-600", bg: "bg-orange-50", ring: "ring-orange-200" };
  return { label: "Needs attention", tone: "text-destructive", bg: "bg-destructive/10", ring: "ring-destructive/30" };
}

function deriveRisk(data: ClientCommercialIntelligence) {
  if (data.renewal_risk && data.renewal_risk !== "unknown") return data.renewal_risk;
  const days = data.days_to_renewal;
  if (days == null) return "unknown";
  if (days < 0) return "high";
  if (days <= 30) return "high";
  if (days <= 90) return "medium";
  return "low";
}

function riskTone(risk: string) {
  switch (risk) {
    case "high":
      return { label: "High", tone: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30" };
    case "medium":
      return { label: "Medium", tone: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" };
    case "low":
      return { label: "Low", tone: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
    default:
      return { label: "Not scheduled", tone: "text-muted-foreground", bg: "bg-muted", border: "border-border" };
  }
}

function confidencePct(c: string) {
  return c === "high" ? "92%" : c === "medium" ? "68%" : "35%";
}

export function CommercialIntelligenceDashboard({
  clientId,
  client,
  ownerName,
  contractStatus,
  billing,
  onViewFullTimeline,
}: Props) {
  const { data, isLoading } = useClientCommercialIntelligence(clientId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Commercial Intelligence is not available for this client yet.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <CommercialHealthSection data={data} />
      <RecommendedActionsSection data={data} clientId={clientId} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 space-y-5">
          <ExpansionOpportunitiesSection data={data} clientId={clientId} />
          <CommercialTimelineSection clientId={clientId} onViewAll={onViewFullTimeline} />
        </div>
        <div className="space-y-5">
          <CommercialSnapshotSection
            data={data}
            client={client}
            ownerName={ownerName}
            contractStatus={contractStatus}
            billing={billing}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Section: Health ---------------- */
function CommercialHealthSection({ data }: { data: ClientCommercialIntelligence }) {
  const score = data.commercial_score ?? 0;
  const s = scoreTone(score);
  const risk = deriveRisk(data);
  const r = riskTone(risk);

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/40">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" /> Commercial Health
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-border/60">
          <HeroCell
            label="Commercial Health"
            primary={
              <span className={`text-3xl font-bold tabular-nums ${s.tone}`}>
                {score}
                <span className="text-base text-muted-foreground font-normal">/100</span>
              </span>
            }
            sub={<Badge variant="outline" className={`${s.tone} border-current`}>{s.label}</Badge>}
            bg={s.bg}
          />
          <HeroCell
            label="Renewal Risk"
            primary={<span className={`text-2xl font-bold ${r.tone}`}>{r.label}</span>}
            sub={
              data.next_renewal_date ? (
                <span className="text-xs text-muted-foreground">
                  {data.days_to_renewal != null && data.days_to_renewal >= 0
                    ? `In ${data.days_to_renewal} days`
                    : data.days_to_renewal != null
                    ? `${Math.abs(data.days_to_renewal)} days overdue`
                    : "—"}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">No renewal scheduled</span>
              )
            }
            bg={r.bg}
          />
          <HeroCell
            label="Confidence"
            primary={<span className="text-3xl font-bold tabular-nums">{confidencePct(data.confidence)}</span>}
            sub={<span className="text-xs text-muted-foreground capitalize">{data.confidence} data quality</span>}
          />
          <HeroCell
            label="Expansion Potential"
            primary={<span className="text-3xl font-bold tabular-nums text-primary">{fmtCurrency(data.expansion_potential)}</span>}
            sub={<span className="text-xs text-muted-foreground">High + medium confidence ARR</span>}
          />
          <HeroCell
            label="Recurring Revenue (ARR)"
            primary={
              <span className="text-3xl font-bold tabular-nums">
                {fmtCurrency(data.recurring_arr)}
                <span className="text-sm text-muted-foreground font-normal"> / year</span>
              </span>
            }
            sub={
              <span className="text-xs text-muted-foreground">
                Year 1 {fmtCurrency(data.year1_value)}
              </span>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function HeroCell({
  label,
  primary,
  sub,
  bg,
}: {
  label: string;
  primary: React.ReactNode;
  sub?: React.ReactNode;
  bg?: string;
}) {
  return (
    <div className={`p-5 ${bg ?? ""}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <div className="mt-2">{primary}</div>
      {sub && <div className="mt-1.5">{sub}</div>}
    </div>
  );
}

/* ---------------- Section: Recommended actions ---------------- */
function actionIcon(type: string) {
  switch (type) {
    case "renewal":
      return CalendarDays;
    case "upsell":
      return TrendingUp;
    case "data":
      return AlertTriangle;
    default:
      return Sparkles;
  }
}

function RecommendedActionsSection({
  data,
  clientId,
}: {
  data: ClientCommercialIntelligence;
  clientId: string;
}) {
  const navigate = useNavigate();
  const actions = (data.recommended_actions ?? []).slice().sort((a, b) => a.priority - b.priority);

  if (actions.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="font-medium">No commercial actions required.</span>
        <span className="text-emerald-700/80">This customer is healthy and no immediate actions are recommended.</span>
      </div>
    );
  }

  return (
    <Card className="border-primary/30 shadow-md">
      <CardHeader className="pb-3 border-b border-border/40">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Recommended Actions
          <Badge variant="secondary" className="ml-1 text-[10px]">{actions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <ul className="space-y-2">
          {actions.map((a) => (
            <ActionRow key={a.id} action={a} clientId={clientId} navigate={navigate} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ActionRow({
  action,
  clientId,
  navigate,
}: {
  action: CommercialRecommendedAction;
  clientId: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const Icon = actionIcon(action.action_type);
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors">
      <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground">{action.title}</p>
          <Badge variant="outline" className="text-[10px]">Priority {action.priority}</Badge>
          {action.estimated_arr > 0 && (
            <Badge variant="secondary" className="text-[10px]">+{fmtCurrency(action.estimated_arr)} ARR</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
        {action.reason && (
          <p className="text-[11px] text-muted-foreground/80 mt-0.5 italic">{action.reason}</p>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={() => navigate(action.related_route || `/clients/${clientId}`)}
      >
        Open <ArrowUpRight className="h-3 w-3 ml-1" />
      </Button>
    </li>
  );
}

/* ---------------- Section: Snapshot ---------------- */
function CommercialSnapshotSection({
  data,
  client,
  contractStatus,
  billing,
}: {
  data: ClientCommercialIntelligence;
  client?: any;
  ownerName?: string | null;
  contractStatus?: string | null;
  billing?: string | null;
}) {
  const isPremium = !!client?.is_premium;
  const renewal = data.next_renewal_date;
  const contractLabel = contractStatus || (data.has_contract ? `${data.active_contract_count} active` : "None");
  const modulesCount = (data.active_modules ?? []).length;
  const pluginsCount = (data.active_plugins ?? []).length;
  const billingLabel = billing || (data.recurring_items?.[0]?.billing_frequency as string | undefined) || "Annual";

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> Commercial Snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        {/* Licensing setup */}
        <SnapshotRow label="Product Family" value={data.license_family} />
        <SnapshotRow label="Variant" value={data.license_variant} />
        <SnapshotRow label="Deployment" value={data.deployment_type} />
        <Separator />
        {/* Commercial structure */}
        <SnapshotRow label="Contract Status" value={contractLabel} />
        <SnapshotRow label="Renewal Date" value={fmtDate(renewal)} />
        <SnapshotRow label="Billing Frequency" value={billingLabel} />
        <SnapshotRow
          label="Recurring Revenue (ARR)"
          value={`${fmtCurrency(data.recurring_arr)} / year`}
          strong
        />
        <SnapshotRow label="Year 1 Revenue" value={fmtCurrency(data.year1_value)} />
        <SnapshotRow
          label="Premium"
          value={<Badge variant={isPremium ? "default" : "secondary"} className="text-[10px]">{isPremium ? "Yes" : "No"}</Badge>}
        />
        <Separator />
        {/* Technical entitlements */}
        <SnapshotRow
          label="S&AT"
          value={<Badge variant={data.sat_active ? "default" : "secondary"} className="text-[10px]">{data.sat_active ? "Active" : "Not active"}</Badge>}
        />
        <SnapshotRow
          label="API"
          value={<Badge variant={data.api_access ? "default" : "secondary"} className="text-[10px]">{data.api_access ? "Enabled" : "Disabled"}</Badge>}
        />
        <SnapshotRow label="BackOffice users" value={data.backoffice_users} />
        <SnapshotRow label="Web / Mobile users" value={data.web_users} />
        <SnapshotRow label="Active Modules" value={modulesCount} />
        <SnapshotRow label="Active Plugins" value={pluginsCount} />
      </CardContent>
    </Card>
  );
}

function SnapshotRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs ${strong ? "font-semibold text-foreground" : "text-foreground"}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

/* ---------------- Section: Expansion opportunities ---------------- */
function confidenceStars(confidence: string) {
  const map: Record<string, number> = { high: 5, medium: 3, low: 2 };
  const n = map[confidence] ?? 2;
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function ExpansionOpportunitiesSection({
  data,
  clientId,
}: {
  data: ClientCommercialIntelligence;
  clientId: string;
}) {
  const navigate = useNavigate();
  const upsell = data.upsell_opportunities ?? [];
  const missingModules = data.missing_modules ?? [];
  const missingPlugins = data.missing_plugins ?? [];

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" /> Expansion Opportunities
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {upsell.length + missingModules.length + missingPlugins.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {upsell.length === 0 && missingModules.length === 0 && missingPlugins.length === 0 && (
          <p className="text-sm text-muted-foreground">No expansion opportunities detected.</p>
        )}

        {upsell.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Upsell & Reactivation
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {upsell.map((o) => (
                <OpportunityCard key={o.id} opp={o} clientId={clientId} navigate={navigate} />
              ))}
            </div>
          </div>
        )}

        {missingModules.length > 0 && (
          <CollapsibleGroup
            icon={<Package className="h-3 w-3" />}
            label="Missing Modules"
            items={missingModules.map((m) => m.name)}
          />
        )}

        {missingPlugins.length > 0 && (
          <CollapsibleGroup
            icon={<Plug className="h-3 w-3" />}
            label="Missing Plugins"
            items={missingPlugins.map((p) => p.name)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function CollapsibleGroup({
  icon,
  label,
  items,
  previewCount = 3,
}: {
  icon: React.ReactNode;
  label: string;
  items: string[];
  previewCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const total = items.length;
  const preview = items.slice(0, previewCount);
  const remaining = total - preview.length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-border/60 p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              {icon} {label}
            </p>
            <Badge variant="secondary" className="text-[10px]">{total} available</Badge>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              {open ? "Hide" : "Show all"}
              <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
        </div>

        {!open && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {preview.map((name, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">{name}</Badge>
            ))}
            {remaining > 0 && (
              <Badge variant="secondary" className="text-[10px]">+{remaining} more</Badge>
            )}
          </div>
        )}

        <CollapsibleContent>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {items.map((name, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">{name}</Badge>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function OpportunityCard({
  opp,
  clientId,
  navigate,
}: {
  opp: CommercialOpportunity;
  clientId: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className="rounded-lg border border-border/60 p-3 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{opp.title}</p>
          <p className="text-[11px] text-amber-500 mt-0.5" title={`${opp.confidence} confidence`}>
            {confidenceStars(opp.confidence)}
          </p>
        </div>
        {opp.estimated_arr > 0 && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            +{fmtCurrency(opp.estimated_arr)}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{opp.description}</p>
      <p className="text-[11px] text-muted-foreground/80 mt-1 italic line-clamp-2">{opp.reason}</p>
      <div className="flex items-center justify-between mt-3">
        <Badge variant="outline" className="text-[10px] capitalize">{opp.priority} priority</Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => navigate(`/clients/${clientId}?tab=contract`)}
        >
          <Zap className="h-3 w-3 mr-1" /> Act
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Section: Timeline ---------------- */
function CommercialTimelineSection({ clientId, onViewAll }: { clientId: string; onViewAll?: () => void }) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" /> Recent Commercial Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <ClientLifecycleTimeline clientId={clientId} limit={5} onViewAll={onViewAll} />
      </CardContent>
    </Card>
  );
}
