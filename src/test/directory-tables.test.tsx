import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import Partners from "@/pages/Partners";
import ClientsLicenses from "@/pages/ClientsLicenses";

const fixtures = vi.hoisted(() => ({
  hq: true,
  editable: false,
  error: false,
  partners: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      company_name: "Alpha Partner",
      country: "PT",
      status: "Active",
      partner_code: "PT-001",
      partnership_level: "Reseller",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      company_name: "Zeta Partner",
      country: "RO",
      status: "Active",
      partner_code: "RO-002",
      partnership_level: "Implementer",
    },
  ],
  clients: [
    {
      id: "a",
      commercial_name: "Alpha Client",
      client_code: "0010",
      country: "PT",
      status: "Active",
      license_type: "USE-IT",
      sector: "Manufacturing",
      partner_uuid: "11111111-1111-4111-8111-111111111111",
    },
    {
      id: "z",
      commercial_name: "Zeta Client",
      client_code: "0020",
      country: "RO",
      status: "Active",
      license_type: "KEEP-IT",
      sector: "Healthcare",
      partner_uuid: "22222222-2222-4222-8222-222222222222",
    },
  ],
}));
vi.mock("@/hooks/usePartners", () => ({
  usePartners: () => ({
    data: fixtures.partners,
    isLoading: false,
    isError: false,
  }),
  usePartnershipLevels: () => ({ data: [] }),
  useCreatePartner: () => ({ mutateAsync: vi.fn() }),
  useArchivePartner: () => ({ mutateAsync: vi.fn() }),
  useRestorePartner: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/usePartnerMetrics", () => ({
  usePartnerMetrics: () => ({
    data: {
      "11111111-1111-4111-8111-111111111111": {
        revenue: 1250,
        pipeline: 42.5,
        clients: 1,
        health_score: 50,
      },
    },
  }),
}));
vi.mock("@/hooks/useClients", () => ({
  useClients: () => ({
    data: fixtures.clients,
    isLoading: false,
    isError: fixtures.error,
    refetch: vi.fn(),
  }),
  useCreateClient: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useClientAggregates", () => ({
  useClientAggregates: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useDeals", () => ({
  useRenewals: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isHQ: fixtures.hq,
    isAdmin: fixtures.hq,
    profile: { partner_id: fixtures.hq ? null : fixtures.partners[0].id },
  }),
}));
vi.mock("@/hooks/useModuleAccess", () => ({
  useModuleAccess: () => ({ canEdit: () => fixtures.editable }),
}));
vi.mock("@/lib/clients-list-state", () => ({
  loadClientsListState: () => null,
  saveClientsListState: vi.fn(),
}));

function Location() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}
const show = (page: React.ReactNode) =>
  render(
    <MemoryRouter>
      {page}
      <Location />
    </MemoryRouter>,
  );
beforeEach(() => {
  cleanup();
  fixtures.hq = true;
  fixtures.editable = false;
  fixtures.error = false;
});
afterEach(cleanup);

describe("Shared directory table presentation and behavior", () => {
  it("keeps partner names linked, amounts precise and sorting keyboard-accessible", async () => {
    show(<Partners />);
    const table = screen.getByRole("table", { name: "Partners" });
    expect(table).toHaveClass("directory-table");
    expect(
      within(table).getByRole("link", { name: "Alpha Partner" }),
    ).toHaveClass("directory-name");
    expect(within(table).getByText("€1,250.00")).toBeInTheDocument();
    expect(within(table).getByText("€42.50")).toBeInTheDocument();
    const sort = screen.getByRole("button", { name: /Sort by Company/ });
    expect(sort.closest("th")).toHaveAttribute("aria-sort", "ascending");
    sort.focus();
    await userEvent.keyboard("{Enter}");
    expect(sort.closest("th")).toHaveAttribute("aria-sort", "descending");
    expect(table.querySelector("tbody tr")).toHaveTextContent("Zeta Partner");
    expect(
      screen.getByRole("button", { name: "Actions for Alpha Partner" }),
    ).toHaveClass("directory-action");
  });
  it("shows dark customer names, consistent statuses and retains client navigation", () => {
    show(<ClientsLicenses />);
    const table = screen.getByRole("table", { name: "Clients & licenses" });
    expect(table).toHaveClass("directory-table");
    const name = within(table).getByRole("button", {
      name: "Open client Alpha Client",
    });
    expect(name).toHaveClass("directory-name");
    expect(name).not.toHaveClass("text-primary");
    expect(within(table).getAllByText("Active")[0]).toHaveClass(
      "directory-tag--positive",
    );
    expect(
      screen.queryByRole("button", { name: /Add Client/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(name);
    expect(screen.getByTestId("location")).toHaveTextContent("/clients/a");
  });
  it("preserves client search and changes the sorting without remounting a header component", () => {
    show(<ClientsLicenses />);
    const table = screen.getByRole("table", { name: "Clients & licenses" });
    fireEvent.click(screen.getByRole("button", { name: /Sort by Client/ }));
    expect(table.querySelector("tbody tr")).toHaveTextContent("Zeta Client");
    fireEvent.change(screen.getByPlaceholderText("Search clients..."), {
      target: { value: "Alpha" },
    });
    expect(
      within(table).getByRole("button", { name: "Open client Alpha Client" }),
    ).toBeInTheDocument();
    expect(within(table).queryByText("Zeta Client")).not.toBeInTheDocument();
  });
  it("keeps the partner dimension hidden for a partner-scoped client list", () => {
    fixtures.hq = false;
    show(<ClientsLicenses />);
    expect(
      screen.queryByRole("columnheader", { name: "Partner" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add Client/ }),
    ).not.toBeInTheDocument();
  });
  it("preserves the client error state instead of showing a false empty table", () => {
    fixtures.error = true;
    show(<ClientsLicenses />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load clients",
    );
    expect(
      screen.queryByText("No clients match your filters."),
    ).not.toBeInTheDocument();
  });
});
