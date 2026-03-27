import { Building2, Star, AlertTriangle, CalendarClock, DollarSign, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ClientsKPIBarProps {
  active: number;
  total: number;
  premium: number;
  totalValue: number;
  renewals30: number;
  overdue: number;
}

export function ClientsKPIBar({ active, total, premium, totalValue, renewals30, overdue }: ClientsKPIBarProps) {
  const kpis = [
    { label: "Active Clients", value: `${active}`, sub: `of ${total}`, icon: Building2, color: "text-primary" },
    { label: "Premium", value: `${premium}`, sub: "clients", icon: Star, color: "text-amber-600" },
    { label: "Contract Value", value: `€${(totalValue / 1000).toFixed(0)}k`, sub: "total", icon: DollarSign, color: "text-emerald-600" },
    { label: "Due in 30 days", value: `${renewals30}`, sub: "renewals", icon: CalendarClock, color: "text-orange-600" },
    { label: "Overdue", value: `${overdue}`, sub: "expired", icon: ShieldAlert, color: "text-red-600" },
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
              <p className="text-lg font-extrabold text-foreground tabular-nums leading-tight">{kpi.value}</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{kpi.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
