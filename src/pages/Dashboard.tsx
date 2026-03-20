import { DollarSign, Users, TrendingUp, Activity } from "lucide-react";
import { KPICard } from "@/components/dashboard/KPICard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { PartnerHealthList } from "@/components/dashboard/PartnerHealthList";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { partners } from "@/data/mock-data";

export default function Dashboard() {
  const totalRevenue = partners.reduce((s, p) => s + p.revenue, 0);
  const totalPipeline = partners.reduce((s, p) => s + p.pipeline, 0);
  const activePartners = partners.filter((p) => p.status === "Active").length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="animate-reveal-up">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Partner ecosystem overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Revenue"
          value={`€${(totalRevenue / 1000).toFixed(0)}k`}
          change="+12.3% vs last quarter"
          changeType="positive"
          icon={DollarSign}
          delay={60}
        />
        <KPICard
          title="Active Partners"
          value={String(activePartners)}
          change={`of ${partners.length} total`}
          changeType="neutral"
          icon={Users}
          delay={120}
        />
        <KPICard
          title="Pipeline Value"
          value={`€${(totalPipeline / 1000).toFixed(0)}k`}
          change="+8.7% this month"
          changeType="positive"
          icon={TrendingUp}
          delay={180}
        />
        <KPICard
          title="Avg Engagement"
          value={`${Math.round(partners.reduce((s, p) => s + p.engagementScore, 0) / partners.length)}`}
          change="2 partners at risk"
          changeType="negative"
          icon={Activity}
          delay={240}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <PartnerHealthList />
      </div>

      <RecentActivity />
    </div>
  );
}
