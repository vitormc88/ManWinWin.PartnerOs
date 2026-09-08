import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const state: any = { data: undefined, isLoading: true, isError: false, error: null };
const saveMock = vi.fn();

vi.mock("@/hooks/usePartnerDiscountLimits", async () => {
  const actual = await vi.importActual<any>("@/hooks/usePartnerDiscountLimits");
  return {
    ...actual,
    usePartnerDiscountLimits: () => ({ ...state, refetch: vi.fn(), isFetching: false }),
    useSavePartnerDiscountLimits: () => ({ mutateAsync: saveMock, isPending: false }),
  };
});

import { PartnerDiscountLimitsCard } from "../PartnerDiscountLimitsCard";

function setup() {
  return render(
    <PartnerDiscountLimitsCard partnerId="p1" partnershipLevel="Reseller" canEdit />,
  );
}

describe("PartnerDiscountLimitsCard async states", () => {
  beforeEach(() => {
    saveMock.mockReset();
  });

  it("shows a loading state and no Edit button while the read is pending", () => {
    Object.assign(state, { data: undefined, isLoading: true, isError: false, error: null });
    setup();
    expect(screen.getByText(/loading discount limits/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
    // Defaults must NOT be presented as known saved values while loading.
    expect(screen.queryByText("10%")).toBeNull();
  });

  it("shows a retry affordance and blocks editing on a genuine load error", () => {
    Object.assign(state, {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
    });
    setup();
    expect(screen.getByText(/could not load the discount limits/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
  });

  it("shows a friendly not-yet-available state with editing disabled for a missing schema", () => {
    Object.assign(state, {
      data: { row: null, missingSchema: true },
      isLoading: false,
      isError: false,
      error: null,
    });
    setup();
    expect(screen.getByText(/not available in this environment yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
  });

  it("distinguishes no-row (defaults) from missing schema and allows editing", () => {
    Object.assign(state, {
      data: { row: null, missingSchema: false },
      isLoading: false,
      isError: false,
      error: null,
    });
    setup();
    expect(screen.getAllByText(/using default/i).length).toBe(2);
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });

  it("renders stored overrides, including an explicit zero, as custom limits", () => {
    Object.assign(state, {
      data: {
        row: { partner_id: "p1", max_software_discount_pct: 0, max_services_discount_pct: 25 },
        missingSchema: false,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    setup();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getAllByText(/custom limit/i).length).toBe(2);
  });
});
