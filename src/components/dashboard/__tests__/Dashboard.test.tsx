import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
const state = vi.hoisted(() => ({
  hq: true,
  modules: [
    "partners",
    "clients",
    "pipeline",
    "renewals",
    "tasks",
    "notifications",
    "announcements",
  ],
  failed: false,
  renewals: [
    {
      id: "closed",
      status: "Completed",
      client_id: "c",
      renewal_date: "2020-01-01",
    },
  ] as any[],
  revenue: [] as any[],
  tasks: [] as any[],
}));
const result = (data: any) => ({
  data,
  isLoading: false,
  isError: state.failed,
  dataUpdatedAt: 1,
  refetch: vi.fn(),
});
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isHQ: state.hq,
    user: { id: "u" },
    profile: { partner_id: "p" },
  }),
}));
vi.mock("@/hooks/useModuleAccess", () => ({
  useModuleAccess: () => ({
    isLoading: false,
    canView: (key: string) => state.modules.includes(key),
  }),
}));
const spies = vi.hoisted(() => ({
  revenue: vi.fn(),
  health: vi.fn(),
  deals: vi.fn(),
}));
vi.mock("@/hooks/usePartners", () => ({
  usePartners: () =>
    result([
      { id: "p", status: "Active", company_name: "Active Partner" },
      { id: "archive", status: "Archived", company_name: "Archived Partner" },
    ]),
}));
vi.mock("@/hooks/useClients", () => ({
  useClients: () =>
    result([
      {
        id: "c",
        partner_uuid: "p",
        status: "Active",
        client_code: "0438",
        commercial_name: "Client",
      },
    ]),
}));
vi.mock("@/hooks/useDeals", () => ({
  useDeals: (_a: any, o: any) => {
    spies.deals(o.enabled);
    return result([
      {
        id: "d",
        company_name: "Old open opportunity",
        status: "Open",
        stage: "Qualified",
        partner_id: "p",
        expected_value: 200,
        expected_close_date: null,
      },
    ]);
  },
  useRenewals: () => result(state.renewals),
  useNotifications: () => result([]),
}));
vi.mock("@/hooks/usePartnerMetrics", () => ({
  usePartnerMetrics: (enabled: boolean) => {
    spies.health(enabled);
    return result({
      p: { health_score: 25, negative_factors: ["No next meeting"] },
      archive: { health_score: 0 },
    });
  },
}));
vi.mock("@/hooks/useDashboard", () => ({
  useDashboardRevenue: (enabled: boolean) => {
    spies.revenue(enabled);
    return result(state.revenue);
  },
  useDashboardTasks: () => result(state.tasks),
  useDashboardPartnerName: () => result("Own Partner"),
}));
vi.mock("@/components/dashboard/RevenueChart", () => ({
  RevenueChart: () => <div>Awarded chart</div>,
}));
vi.mock("@/components/dashboard/RecentActivity", () => ({
  RecentActivity: () => <div>Announcements</div>,
}));
vi.mock("@/components/dashboard/PartnerLearning", () => ({
  PartnerLearning: () => <div>Partner learning</div>,
}));
beforeEach(() => {
  cleanup();
  state.hq = true;
  state.failed = false;
  state.modules = [
    "partners",
    "clients",
    "pipeline",
    "renewals",
    "tasks",
    "notifications",
    "announcements",
  ];
  state.revenue = [];
  state.tasks = [];
  state.renewals = [
    {
      id: "closed",
      status: "Completed",
      client_id: "c",
      renewal_date: "2020-01-01",
    },
  ];
  vi.clearAllMocks();
});
const mount = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
describe("Dashboard role, error and filter behavior", () => {
  it("excludes completed renewals and archived partners and exposes the same calculated health", () => {
    mount();
    expect(
      screen.queryByRole("link", { name: /overdue renewals/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/health requires attention/)).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Archived Partner" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No next meeting")).toBeInTheDocument();
  });
  it("does not query or render financial sections without their module permissions", () => {
    state.modules = ["tasks"];
    mount();
    expect(spies.revenue).toHaveBeenCalledWith(false);
    expect(spies.health).toHaveBeenCalledWith(false);
    expect(spies.deals).toHaveBeenCalledWith(false);
    expect(screen.queryByText("Awarded chart")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Partner Health Monitor"),
    ).not.toBeInTheDocument();
  });
  it("gives partners their own title, actions and chart without HQ comparisons or partner filters", () => {
    state.hq = false;
    state.modules = ["clients", "tasks", "onboarding"];
    mount();
    expect(
      screen.getByRole("heading", { name: "Own Partner Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("My Next Actions")).toBeInTheDocument();
    expect(screen.queryByLabelText("Partner")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Partner Health Monitor"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Awarded chart")).toBeInTheDocument();
    expect(screen.getByText("Partner learning")).toBeInTheDocument();
  });
  it("shows unavailability rather than no urgent renewals or no new alerts after failure", () => {
    state.failed = true;
    mount();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.queryByText(/No overdue renewals/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No unread alerts/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/health requires attention/),
    ).not.toBeInTheDocument();
  });
  it("updates financial cards with selected quarter and includes archived historical selection only explicitly", () => {
    const year = new Date().getFullYear();
    state.revenue = [
      {
        id: "r",
        client_id: "c",
        partner_id: "p",
        currency: "EUR",
        amount: 123,
        revenue_date: `${year}-01-01`,
        revenue_type: "initial_sale",
        renewal_id: null,
      },
    ];
    mount();
    fireEvent.change(screen.getByLabelText("Period"), {
      target: { value: "q2" },
    });
    expect(screen.getByText("Awarded Revenue · Q2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      screen.getByRole("option", { name: "Archived Partner (archived)" }),
    ).toBeInTheDocument();
  });
  it("shows one BPS action with access to all three underlying tasks", () => {
    state.tasks = ["decision", "overdue", "automatic"].map((id, index) => ({
      id, title: `BPS ${id}`, source: index === 2 ? "renewal" : "manual",
      related_type: "renewal", related_entity_id: "bps", related_route: "/renewals?renewal=bps",
      priority: "Critical", priority_score: 120 - index,
      due_date: index === 0 ? "2026-10-02" : "2026-10-08", owner_name: "George",
    }));
    mount();
    expect(screen.getByText(/3 tasks for this renewal/)).toBeInTheDocument();
    expect(screen.getByText(/3 tasks for this renewal/).closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText(/3 tasks for this renewal/).closest("details")?.querySelectorAll("a")).toHaveLength(3);
    fireEvent.click(screen.getByText(/3 tasks for this renewal/));
    expect(screen.getByRole("link", {name: /BPS overdue/})).toHaveAttribute("href", "/tasks?view=team&task=overdue");
  });
  it("does not present zero as a reliable forecast when all opportunities are undated", () => {
    mount();
    expect(screen.getByText(/Forecast unavailable/)).toBeInTheDocument();
    expect(
      screen.queryByText(/currently open opportunities scheduled/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Ordered by priority, then earliest due date/),
    ).toBeInTheDocument();
  });
  it("links missing dates to the exact open undated pipeline filter", () => {
    mount();
    expect(
      screen.getByRole("link", { name: /without an expected close date/ }),
    ).toHaveAttribute("href", "/pipeline?dashboard=undated");
  });
});
