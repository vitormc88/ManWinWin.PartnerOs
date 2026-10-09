import { Building2, Star, AlertTriangle, CalendarClock, DollarSign, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, LOADING_PLACEHOLDER } from "@/lib/money";

interface ClientsKPIBarProps {
  active: number;
  total: number;
  premium: number;
  contractValues: Record<string, number>;
  renewals30: number;
  overdue: number;
  /** True until every source feeding these KPIs has resolved. */
  loading?: boolean;
  /** True when a source failed — shown explicitly, never as a zero. */
  error?: boolean;
}

export function ClientsKPIBar({ active, total, premium, contractValues, renewals30, overdue, loading = false, error = false }: ClientsKPIBarProps) {
  const ready = !loading && !error;
  const val = (render: () => string) => (error ? "!" : ready ? render() : LOADING_PLACEHOLDER);
  const sub = (text: string) => (error ? "Unavailable" : ready ? text : "Loading…");

  const kpis = [
    { label: "Active Clients", value: val(() => `${active}`), sub: sub(`of ${total}`), icon: Building2, color: "text-primary" },
    { label: "Premium", value: val(() => `${premium}`), sub: sub("clients"), icon: Star, color: "text-amber-600" },
    { label: "Current Contract Value", value: val(() => Object.entries(contractValues).map(([currency, amount]) => formatMoney(amount, { compact: true, currency })).join(" / ") || formatMoney(0)), sub: sub("Active clients · agreements in force"), icon: DollarSign, color: "text-emerald-600" },
    { label: "Due in 30 days", value: val(() => `${renewals30}`), sub: sub("clients"), icon: CalendarClock, color: "text-orange-600" },
    { label: "Overdue", value: val(() => `${overdue}`), sub: sub("clients with open renewals"), icon: ShieldAlert, color: "text-red-600" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="border shadow-md hover:shadow-lg transition-shadow">
          <CardContent className="p-4 flex items-start gap-3">
            <div className={`p-2 rounded-lg bg-muted/60 ${kpi.color}`}>
              <kpi.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p
                className={`text-lg font-extrabold text-foreground tabular-nums leading-tight ${!ready ? "text-muted-foreground animate-pulse" : ""}`}
                aria-busy={loading || undefined}
              >
                {kpi.value}
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{kpi.label}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{kpi.sub}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
