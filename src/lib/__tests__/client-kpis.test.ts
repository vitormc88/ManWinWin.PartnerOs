import { describe, it, expect } from "vitest";
import { currentContractValues, countOverdueClients } from "../client-kpis";
const today = new Date(2026, 9, 9);
describe("Clients KPI scope and current cycles", () => {
  it("counts distinct overdue clients, excluding closed results and filtered clients", () => {
    expect(countOverdueClients([
      { client_id: "a", renewal_date: "2026-10-08", status: "Upcoming" },
      { client_id: "a", renewal_date: "2026-09-01", status: "InProgress" },
      { client_id: "b", renewal_date: "2026-09-01", status: "Lost" },
      { client_id: "c", renewal_date: "2026-09-01", status: "Won" },
      { client_id: "d", renewal_date: "2026-09-01", status: "Completed" },
      { client_id: "e", renewal_date: "2026-09-01", status: "Upcoming" },
      { client_id: "a", renewal_date: "2026-10-09", status: "Upcoming" },
    ], new Set(["a", "b", "c", "d"]), today)).toBe(1);
  });
  it("uses current value, excludes expired/future agreements and keeps currencies separate", () => {
    const base = { client_id: "a", contract_start_date: "2026-01-01", contract_end_date: "2026-12-31", currency: "EUR", contract_value: 2520 };
    expect(currentContractValues([
      { ...base, total_value: 1656 } as any,
      { ...base, contract_end_date: "2026-10-08", contract_value: 999 },
      { ...base, contract_start_date: "2026-10-10", contract_value: 888 },
      { ...base, client_id: "b", contract_value: 777 },
      { ...base, currency: "USD", contract_value: 100 },
      { ...base, contract_end_date: "2026-10-09", contract_value: 50 },
    ], new Set(["a"]), today)).toEqual({ EUR: 2570, USD: 100 });
  });
});
