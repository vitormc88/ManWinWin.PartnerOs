import { mockTiers, tierNames, tierCriteria } from "@/data/partner-engagement-data";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Minus, Shield, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

const tierBadgeClass: Record<number, string> = {
  1: "bg-muted text-muted-foreground",
  2: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  3: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  4: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

export default function PartnerTiers() {
  const tierCounts = [1, 2, 3, 4].map((t) => ({
    tier: t,
    name: tierNames[t],
    count: mockTiers.filter((p) => p.currentTier === t).length,
  }));

  const upgradesPending = mockTiers.filter((p) => p.suggestedTier > p.currentTier);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="animate-reveal-up">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Partner Tiers</h1>
        <p className="text-sm text-muted-foreground mt-1">Progression path and tier management</p>
      </div>

      {/* Tier Distribution */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 animate-reveal-up stagger-1">
        {tierCounts.map((t) => (
          <div key={t.tier} className="bg-card rounded-xl border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tierBadgeClass[t.tier]} border-0`}>
                Tier {t.tier}
              </span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">{t.count}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t.name}</p>
          </div>
        ))}
      </div>

      {/* Tier Criteria Reference */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden animate-reveal-up stagger-2">
        <div className="p-5 border-b">
          <h3 className="font-semibold text-foreground">Tier Upgrade Criteria</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Tier</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Min Revenue</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Min Deals</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Certified Users</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Win Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[2, 3, 4].map((tier) => (
                <tr key={tier} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tierBadgeClass[tier]} border-0`}>
                      {tierNames[tier]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-foreground">€{tierCriteria[tier].revenue.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-foreground">{tierCriteria[tier].deals}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-foreground">{tierCriteria[tier].certUsers}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-foreground">{tierCriteria[tier].winRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upgrade Suggestions */}
      {upgradesPending.length > 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30 rounded-xl p-5 animate-reveal-up stagger-2">
          <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
            <ArrowUp className="h-4 w-4 text-emerald-600" />
            Upgrade Suggestions ({upgradesPending.length})
          </h3>
          <div className="space-y-2">
            {upgradesPending.map((p) => (
              <div key={p.partnerId} className="flex items-center justify-between bg-card rounded-lg p-3 border">
                <div>
                  <Link to={`/partners/${p.partnerId}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors">{p.partnerName}</Link>
                  <p className="text-xs text-muted-foreground">{p.country}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tierBadgeClass[p.currentTier]} border-0`}>
                    {tierNames[p.currentTier]}
                  </span>
                  <ArrowUp className="h-3 w-3 text-emerald-600" />
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tierBadgeClass[p.suggestedTier]} border-0`}>
                    {tierNames[p.suggestedTier]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Partners Table */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden animate-reveal-up stagger-3">
        <div className="p-5 border-b">
          <h3 className="font-semibold text-foreground">All Partners</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Partner</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Country</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Current Tier</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Suggested</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Deals</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Win Rate</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Cert. Users</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {mockTiers.map((p) => {
                const direction = p.suggestedTier > p.currentTier ? "up" : p.suggestedTier < p.currentTier ? "down" : "same";
                return (
                  <tr key={p.partnerId} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3">
                      <Link to={`/partners/${p.partnerId}`} className="font-medium text-foreground hover:text-primary transition-colors">{p.partnerName}</Link>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{p.country}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tierBadgeClass[p.currentTier]} border-0`}>
                        T{p.currentTier} — {p.tierName}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tierBadgeClass[p.suggestedTier]} border-0`}>
                        T{p.suggestedTier}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-foreground">€{p.annualRevenue.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-foreground">{p.totalDeals}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-foreground">{p.winRate}%</td>
                    <td className="px-5 py-3 text-right tabular-nums text-foreground">{p.certifiedUsers}</td>
                    <td className="px-5 py-3">
                      {direction === "up" && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><ArrowUp className="h-3 w-3" /> Upgrade</span>
                      )}
                      {direction === "down" && (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium"><ArrowDown className="h-3 w-3" /> At risk</span>
                      )}
                      {direction === "same" && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3 w-3" /> Validated</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
