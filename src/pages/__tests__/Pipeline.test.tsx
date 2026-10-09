import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Pipeline from "../Pipeline";
const state = vi.hoisted(() => ({ editable: true, failed: false }));
const fixtures = vi.hoisted(() =>
  Array.from({ length: 29 }, (_, i) => ({
    id: `d${i}`,
    company_name: `Opportunity ${i}`,
    status: i < 16 ? "Open" : "Lost",
    stage: i < 16 ? "Qualified" : "Lost",
    partner_id: "p",
    created_at: "2026-01-01",
    lost_at: `2026-09-${String(i - 15).padStart(2, "0")}`,
    expected_value: 10,
    total_value: 20,
    probability: 20,
    assigned_salesperson: "Owner",
  })),
);
vi.mock("@/hooks/useDeals", () => ({
  useDeals: () => ({
    data: fixtures,
    isLoading: false,
    isError: state.failed,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePartners", () => ({
  usePartners: () => ({
    data: [
      { id: "p", company_name: "Active Partner", status: "Active" },
      { id: "archive", company_name: "Archived Partner", status: "Archived" },
    ],
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isHQ: true, profile: {} }),
}));
vi.mock("@/hooks/useModuleAccess", () => ({
  useModuleAccess: () => ({ isLoading: false, canEdit: () => state.editable }),
}));
vi.mock("@/hooks/useDealsHealth", () => ({
  useDealsHealth: () => ({
    data: new Map(
      fixtures.map((d, i) => [
        d.id,
        {
          health: i === 0 ? "Stalled" : i === 1 ? "AtRisk" : "Healthy",
          warnings: [],
          daysInStage: 1,
        },
      ]),
    ),
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useAssignableUsers", () => ({
  useAllProfilesMap: () => ({ data: {} }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/useAgreedNextSteps", () => ({
  useLogStageGateOverride: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/components/leads/CreateLeadDialog", () => ({
  CreateLeadDialog: () => null,
}));
vi.mock("@/components/deals/DealHealthBadge", () => ({
  DealHealthBadge: () => null,
}));
beforeEach(() => {
  cleanup();
  state.editable = true;
  state.failed = false;
});
const mount = () =>
  render(
    <MemoryRouter>
      <Pipeline />
    </MemoryRouter>,
  );
describe("Sales pipeline browsing and safeguards", () => {
  it("keeps long stages inside a keyboard-accessible scroll area", () => {
    mount();
    const area = screen.getByLabelText("Qualified / Call Done opportunities");
    expect(area).toHaveClass("overflow-y-auto");
    expect(area).toHaveAttribute("tabindex", "0");
    expect(
      screen
        .getByText("Closed opportunities · 0 Won · 13 Lost")
        .closest("details"),
    ).not.toHaveAttribute("open");
  });
  it("filters both stalled and at-risk when their combined KPI is clicked", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Stalled \/ At Risk/ }));
    expect(
      screen.getByRole("link", { name: /Opportunity 0/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Opportunity 1/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Opportunity 2 / }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Health")).toHaveValue("stalled-risk");
  });
  it("paginates the open list and uses the same authoritative value as KPIs", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(
      screen.getByText("16 opportunities · page 1 / 2"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(16);
    expect(screen.getAllByText("€20.00")).toHaveLength(25);
  });
  it("removes creation and draggable cards for read-only users", () => {
    state.editable = false;
    mount();
    expect(
      screen.queryByRole("button", { name: "New Opportunity" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Opportunity 0/ })).toHaveAttribute(
      "draggable",
      "false",
    );
  });
  it("shows a retry state on query failure instead of empty pipeline", () => {
    state.failed = true;
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Pipeline unavailable");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
  it("offers archived partners only on explicit selection", () => {
    mount();
    expect(
      screen.queryByRole("option", { name: /Archived Partner/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      screen.getByRole("option", { name: /Archived Partner/ }),
    ).toBeInTheDocument();
  });
});
