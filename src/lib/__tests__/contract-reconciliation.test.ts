import { describe, it, expect } from "vitest";
import {
  reconcileContract,
  historicalSourceValues,
  HISTORICAL_SOURCE_EXPLANATION,
} from "@/lib/contract-reconciliation";
import { selectActiveRenewalRecord } from "@/lib/renewal-active-cycle";

// APS after the 2026 closure: structured lines are the calculation source.
const APS_TOTALS = { recurringArr: 2520, oneTimeValue: 825, year1Value: 3345 };

describe("contract reconciliation — current values vs preserved imported headers", () => {
  it("reports the APS contract as reconciled against the current header", () => {
    const r = reconcileContract(
      { contract_value: 2520, calculated_total: 3345, sat_value: 936, invoiced_value: 1656, total_value: 1656, is_imported: true },
      APS_TOTALS,
      true
    );
    expect(r.state).toBe("reconciled");
    expect(r.label).toBe("Current contract reconciled");
    expect(r.isWarning).toBe(false);
  });

  it("never warns because a preserved imported header differs", () => {
    const r = reconcileContract(
      { contract_value: 2520, calculated_total: 3345, sat_value: 936, invoiced_value: 1656 },
      APS_TOTALS,
      true
    );
    expect(r.isWarning).toBe(false);
  });

  it("still warns on a genuine mismatch of the current structured totals", () => {
    const r = reconcileContract({ contract_value: 2000, calculated_total: 3345 }, APS_TOTALS, true);
    expect(r.state).toBe("mismatch");
    expect(r.isWarning).toBe(true);
    expect(r.recurringDiff).toBeCloseTo(520);
  });

  it("treats an undeclared header value as not a mismatch", () => {
    expect(reconcileContract({ contract_value: 0, calculated_total: null }, APS_TOTALS, true).state).toBe("reconciled");
  });

  it("labels each preserved imported value explicitly and excludes zeros", () => {
    const values = historicalSourceValues({ sat_value: 936, invoiced_value: 1656, total_value: 0 });
    expect(values.map(v => v.key)).toEqual(["sat_value", "invoiced_value"]);
    expect(values[0].label).toContain("Previous imported");
    expect(HISTORICAL_SOURCE_EXPLANATION).toContain("not included in the current calculation");
  });
});

describe("commercial next renewal — closed cycle plus upcoming successor", () => {
  const closed2026 = {
    id: "r-2026",
    renewal_date: "2026-08-08",
    status: "Won",
    outcome: "renewed",
    closed_at: "2026-08-08T10:00:00Z",
    estimated_value: 3345,
  };
  const upcoming2027 = {
    id: "r-2027",
    renewal_date: "2027-08-08",
    status: "Upcoming",
    outcome: null,
    closed_at: null,
    estimated_value: 2520,
  };

  it("selects the upcoming 2027 successor, never the closed 2026 cycle", () => {
    const active = selectActiveRenewalRecord([closed2026, upcoming2027]);
    expect(active?.id).toBe("r-2027");
    expect(active?.renewal_date).toBe("2027-08-08");
    expect(active?.estimated_value).toBe(2520);
  });

  it("returns nothing to work on when every cycle is closed", () => {
    expect(selectActiveRenewalRecord([closed2026])).toBeNull();
  });
});
