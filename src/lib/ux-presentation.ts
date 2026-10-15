/** Presentation only: never changes commercial amounts, probabilities or access. */
export function formatAuditMoney(value: number, compact = false): string {
  if (!Number.isFinite(value)) return "Unavailable";
  if (compact && Math.abs(value) >= 1000) {
    return `€${(value / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}k`;
  }
  return `€${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
}

export const AWARDED_REVENUE_NOTE = "Commercial awards recorded in revenue history; not invoices or payments. Imported entries retain their source dates and values.";

/** Match the client tab's actual universe, not a separately refreshed metric. */
export function partnerClientScope(clients: { status: string | null }[]) {
  const current = clients.filter(c => c.status !== "Archived");
  return { current: current.length, active: current.filter(c => c.status === "Active").length, archived: clients.length - current.length };
}
