import { describe, it, expect } from "vitest";
import { selectActiveCycle, isClosedComponent, isDerivedComponent } from "../renewal-active-cycle";

const closedCycle = {
  id: "r-old",
  status: "Won",
  closed_at: "2026-08-08T10:00:00Z",
  renewal_date: "2026-08-08",
  estimated_value: 1656,
};
const nextCycle = {
  id: "r-next",
  status: "Upcoming",
  renewal_date: "2027-08-08",
  estimated_value: 2520,
};
const staleDerivedLicense = {
  id: "derived-license-1",
  status: "Expired",
  renewal_date: "2026-08-08",
  estimated_value: null,
};

describe("selectActiveCycle", () => {
  it("APS: shows the new open cycle, not the closed or stale derived one", () => {
    const sel = selectActiveCycle([closedCycle, nextCycle, staleDerivedLicense])!;
    expect(sel.primary.id).toBe("r-next");
    expect(sel.primary.renewal_date).toBe("2027-08-08");
    expect(sel.isClosed).toBe(false);
    expect(Math.max(...sel.valueComponents.map((c) => Number(c.estimated_value || 0)))).toBe(2520);
  });

  it("falls back to derived rows when no operational cycle is open", () => {
    const sel = selectActiveCycle([staleDerivedLicense])!;
    expect(sel.primary.id).toBe("derived-license-1");
    expect(sel.isClosed).toBe(false);
  });

  it("keeps the latest closed cycle when everything is closed", () => {
    const sel = selectActiveCycle([closedCycle, { ...closedCycle, id: "r-older", renewal_date: "2025-08-08" }])!;
    expect(sel.primary.id).toBe("r-old");
    expect(sel.isClosed).toBe(true);
  });

  it("picks the earliest actionable open cycle", () => {
    const sel = selectActiveCycle([nextCycle, { ...nextCycle, id: "r-soon", renewal_date: "2026-12-01" }])!;
    expect(sel.primary.id).toBe("r-soon");
  });

  it("classifies closed and derived rows", () => {
    expect(isClosedComponent({ status: "Lost" })).toBe(true);
    expect(isClosedComponent({ status: "Due Soon" })).toBe(false);
    expect(isDerivedComponent({ id: "derived-contract-x" })).toBe(true);
    expect(isDerivedComponent({ id: "r1" })).toBe(false);
  });

  it("returns null with no components", () => {
    expect(selectActiveCycle([])).toBeNull();
  });
});
