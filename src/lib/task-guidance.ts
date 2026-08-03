// Pure Work Guidance derivation for the Task Center.
// Derived from the same scoped task set that feeds the KPIs, so guidance can
// never contradict them (e.g. never suggest closing critical items when
// Critical = 0).

export interface GuidanceTask {
  status: string;
  priority: string;
  due_date?: string | null;
  source: string;
  revenue_impact?: number | null;
}

function isOverdue(due: string | null | undefined, today: Date): boolean {
  if (!due) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(due);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(due);
  if (isNaN(d.getTime())) return false;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return d.getTime() < start.getTime();
}

export function deriveWorkGuidance(
  tasks: GuidanceTask[],
  sourceLabel: (s: string) => string = (s) => s,
  now: Date = new Date()
): string[] {
  const open = tasks.filter((t) => t.status !== "done");
  if (open.length === 0) return ["Inbox clear — no open work to interpret."];

  const overdue = open.filter((t) => isOverdue(t.due_date, now));
  const critical = open.filter((t) => t.priority === "Critical");
  const criticalOverdue = critical.filter((t) => overdue.includes(t));

  const bySource = new Map<string, { count: number; revenue: number }>();
  for (const t of open) {
    const cur = bySource.get(t.source) || { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += t.revenue_impact || 0;
    bySource.set(t.source, cur);
  }
  const top = Array.from(bySource.entries()).sort((a, b) => b[1].count - a[1].count)[0];

  const out: string[] = [];
  if (top && top[1].count >= 2) {
    out.push(`Most open work is concentrated in ${sourceLabel(top[0])} (${top[1].count} tasks).`);
  }

  const overdueRevenue = overdue.reduce((s, t) => s + (t.revenue_impact || 0), 0);
  const totalRevenue = open.reduce((s, t) => s + (t.revenue_impact || 0), 0);
  if (criticalOverdue.length > 0) {
    out.push(`${criticalOverdue.length} critical task${criticalOverdue.length > 1 ? "s are" : " is"} overdue — handle these first.`);
  } else if (overdueRevenue > 0 && totalRevenue > 0 && overdueRevenue / totalRevenue > 0.5) {
    out.push("Overdue tasks hold the majority of revenue at stake — prioritize them.");
  }

  const overdueRenewals = overdue.filter((t) => t.source === "renewal");
  if (overdueRenewals.length >= 2) {
    out.push("Renewal work is accumulating — review overdue renewals first.");
  }

  if (out.length === 0) {
    if (critical.length > 0) {
      out.push(`Workload is balanced. Focus on closing ${critical.length} critical item${critical.length > 1 ? "s" : ""}.`);
    } else if (overdue.length > 0) {
      out.push(`No critical tasks open. Clear the ${overdue.length} overdue item${overdue.length > 1 ? "s" : ""} next.`);
    } else {
      out.push("No critical or overdue tasks. Work through open items in priority order.");
    }
  }
  return out.slice(0, 2);
}
