import type { QueryClient } from "@tanstack/react-query";
export function invalidateClientViews(qc: QueryClient) {
  for (const key of ["clients", "client", "licenses", "contracts", "contract-lines", "client-aggregates", "renewals", "client-commercial-intelligence", "commercial-intelligence-summary", "licensed_modules", "tasks"]) {
    void qc.invalidateQueries({ queryKey: [key] });
  }
}
