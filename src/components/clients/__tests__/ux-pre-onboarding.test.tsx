import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatMoney, LOADING_PLACEHOLDER } from "@/lib/money";
import { isPartnerScopedView, clientsSubtitle } from "@/lib/partner-scope";
import { ClientsKPIBar } from "@/components/clients/ClientsKPIBar";

describe("canonical currency formatting", () => {
  it("renders detailed values with symbol, separators and exactly 2 decimals", () => {
    expect(formatMoney(4221.6)).toBe("€4,221.60");
    expect(formatMoney(1656)).toBe("€1,656.00");
    expect(formatMoney(null)).toBe("€0.00");
  });

  it("abbreviates only via the explicit compact option", () => {
    expect(formatMoney(4221.6, { compact: true })).toBe("€4.2k");
    expect(formatMoney(1_250_000, { compact: true })).toBe("€1.3M");
  });

  it("respects an explicit currency and falls back to EUR", () => {
    expect(formatMoney(1000, { currency: "USD" })).toContain("1,000.00");
    expect(formatMoney(1000, { currency: null })).toBe("€1,000.00");
  });
});

describe("partner-scoped presentation", () => {
  it("is scoped for a non-HQ user linked to one partner", () => {
    expect(isPartnerScopedView({ isHQ: false, partnerId: "p1" })).toBe(true);
    expect(isPartnerScopedView({ isHQ: false, partnerId: null, visiblePartnerCount: 1 })).toBe(true);
  });

  it("keeps the partner dimension for HQ or multi-partner visibility", () => {
    expect(isPartnerScopedView({ isHQ: true, partnerId: "p1" })).toBe(false);
    expect(isPartnerScopedView({ isHQ: false, partnerId: null, visiblePartnerCount: 4 })).toBe(false);
  });

  it("uses partner-appropriate copy", () => {
    expect(clientsSubtitle(true)).toBe("Your clients, licenses and contract status");
    expect(clientsSubtitle(false)).toContain("across all partners");
  });
});

describe("KPIs never flash false zeroes", () => {
  it("shows a placeholder while sources load", () => {
    render(<ClientsKPIBar active={0} total={0} premium={0} totalValue={0} renewals30={0} overdue={0} loading />);
    expect(screen.getAllByText(LOADING_PLACEHOLDER).length).toBe(5);
    expect(screen.queryByText("€0")).toBeNull();
  });

  it("renders resolved values once loading completes", () => {
    render(<ClientsKPIBar active={3} total={4} premium={1} totalValue={4221.6} renewals30={1} overdue={0} />);
    expect(screen.getByText("€4.2k")).toBeTruthy();
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.queryByText(LOADING_PLACEHOLDER)).toBeNull();
  });
});
