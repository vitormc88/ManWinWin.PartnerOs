import { useState } from "react";
import { mockHealthScores, getLeaderboard, mockBadges, mockMissions } from "@/data/partner-engagement-data";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, Trophy, Target, Zap, Medal } from "lucide-react";

const riskColors = {
  green: "text-emerald-600",
  yellow: "text-amber-600",
  red: "text-destructive",
};

const riskBg = {
  green: "bg-emerald-100 dark:bg-emerald-900/20",
  yellow: "bg-amber-100 dark:bg-amber-900/20",
  red: "bg-red-100 dark:bg-red-900/20",
};

const trendIcon = {
  improving: TrendingUp,
  stable: Minus,
  declining: TrendingDown,
};

const trendColor = {
  improving: "text-emerald-600",
  stable: "text-muted-foreground",
  declining: "text-destructive",
};

type LeaderboardMetric = "revenue" | "deals" | "pipeline" | "activity";

export default function PartnerPerformance() {
  const [lbMetric, setLbMetric] = useState<LeaderboardMetric>("revenue");
  const sortedScores = [...mockHealthScores].sort((a, b) => b.overallScore - a.overallScore);
  const leaderboard = getLeaderboard(lbMetric);

  const activeMissions = mockMissions.filter((m) => m.status === "Active");
  const completedMissions = mockMissions.filter((m) => m.status === "Completed");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="animate-reveal-up">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Performance & Gamification</h1>
        <p className="text-sm text-muted-foreground mt-1">Health scores, leaderboards, badges and missions</p>
      </div>

      {/* Health Score Cards */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden animate-reveal-up stagger-1">
        <div className="p-5 border-b">
          <h3 className="font-semibold text-foreground">Partner Health Scores</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Weighted composite: Revenue 30% · Activity 20% · Pipeline 15% · Conversion 15% · Renewals 10% · Certifications 10%</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Partner</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Score</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Risk</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Trend</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Activity</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Pipeline</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Conversion</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Renewals</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Certs</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedScores.map((s) => {
                const TrendIcon = trendIcon[s.trend];
                return (
                  <tr key={s.partnerId} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3">
                      <Link to={`/partners/${s.partnerId}`} className="font-medium text-foreground hover:text-primary transition-colors">{s.partnerName}</Link>
                      <p className="text-xs text-muted-foreground">{s.country}</p>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-lg font-bold tabular-nums ${riskColors[s.riskLevel]}`}>{s.overallScore}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${riskBg[s.riskLevel]} ${riskColors[s.riskLevel]}`}>
                        {s.riskLevel}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs ${trendColor[s.trend]}`}>
                        <TrendIcon className="h-3 w-3" />
                        {s.trend}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{s.revenueScore}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{s.activityScore}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{s.pipelineScore}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{s.conversionScore}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{s.renewalScore}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{s.certificationScore}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leaderboard */}
        <div className="bg-card rounded-xl border shadow-sm animate-reveal-up stagger-2">
          <div className="p-5 border-b flex items-center justify-between">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Leaderboard
            </h3>
            <div className="flex gap-1">
              {(["revenue", "deals", "pipeline", "activity"] as LeaderboardMetric[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setLbMetric(m)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${lbMetric === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y">
            {leaderboard.map((entry, i) => (
              <div key={entry.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-sm font-bold tabular-nums w-6 text-center ${i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "text-muted-foreground"}`}>
                    #{i + 1}
                  </span>
                  <div className="min-w-0">
                    <Link to={`/partners/${entry.id}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block">{entry.name}</Link>
                    <p className="text-xs text-muted-foreground">{entry.country}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">
                  {lbMetric === "revenue" || lbMetric === "pipeline" ? `€${entry.value.toLocaleString()}` : entry.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Badges */}
        <div className="bg-card rounded-xl border shadow-sm animate-reveal-up stagger-2">
          <div className="p-5 border-b">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Medal className="h-4 w-4 text-amber-500" />
              Recent Badges
            </h3>
          </div>
          <div className="divide-y">
            {mockBadges.slice(0, 8).map((badge) => (
              <div key={badge.id} className="flex items-center gap-3 px-5 py-3">
                <span className="text-2xl">{badge.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{badge.name}</p>
                  <p className="text-xs text-muted-foreground">{badge.description}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{badge.awardedAt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Missions */}
      <div className="bg-card rounded-xl border shadow-sm animate-reveal-up stagger-3">
        <div className="p-5 border-b flex items-center justify-between">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Active Missions
          </h3>
          <span className="text-xs text-muted-foreground">{activeMissions.length} active · {completedMissions.length} completed</span>
        </div>
        <div className="divide-y">
          {[...activeMissions, ...completedMissions].map((mission) => {
            const pct = Math.min(100, Math.round((mission.currentValue / mission.targetValue) * 100));
            return (
              <div key={mission.id} className="px-5 py-4 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground">{mission.name}</p>
                    <Badge variant={mission.status === "Completed" ? "success" : "outline"} className="text-[10px]">
                      {mission.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{mission.partnerName} · {mission.description}</p>
                </div>
                <div className="w-32 shrink-0">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="tabular-nums text-muted-foreground">{mission.currentValue}/{mission.targetValue}</span>
                    <span className="tabular-nums font-medium text-foreground">{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
