import { describe, it, expect } from "vitest";
import { currentLicenses, primaryContract } from "../client-primary-records";
const today = new Date(2026, 9, 9);
describe("client primary records", () => {
  it("excludes draft, replaced and future licenses, while retaining expired active licenses for renewal context", () => {
    expect(currentLicenses([
      { id: "draft", is_draft: true },
      { id: "old", license_status: "replaced" },
      { id: "future", license_status: "active", license_start_date: "2026-10-10" },
      { id: "current", license_status: "active", license_start_date: "2026-01-01" },
      { id: "older", license_status: "active", license_start_date: "2025-01-01" },
    ], today).map(l => l.id)).toEqual(["current", "older"]);
  });
  it("chooses a current agreement regardless of query ordering and ignores future agreements", () => {
    const current = { id: "current", contract_start_date: "2026-01-01", contract_end_date: "2026-12-31" };
    expect(primaryContract([
      { id: "old", contract_start_date: "2025-01-01", contract_end_date: "2025-12-31" },
      { id: "future", contract_start_date: "2027-01-01", contract_end_date: "2027-12-31" },
      current,
    ], today)).toEqual(current);
  });
  it("keeps the latest expired agreement available and resolves ties deterministically", () => {
    const rows = [
      { id: "z", contract_start_date: "2026-01-01", contract_end_date: "2026-10-08" },
      { id: "a", contract_start_date: "2026-01-01", contract_end_date: "2026-10-08" },
      { id: "old", contract_start_date: "2025-01-01", contract_end_date: "2025-10-08" },
    ];
    expect(primaryContract(rows, today)?.id).toBe("a");
    expect(primaryContract(rows.reverse(), today)?.id).toBe("a");
    expect(primaryContract([], today)).toBeNull();
  });
});
