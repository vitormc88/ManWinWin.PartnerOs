import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DealRegistrations from "@/pages/DealRegistrations";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { id: "u1" } },
    user: { id: "u1" },
    profile: { id: "u1", is_hq: false, partner_id: "fitc-uuid", full_name: "FITC Sales" },
    roles: ["partner_sales"],
    isLoading: false,
    isAuthReady: true,
    isHQ: false,
    isAdmin: false,
  }),
}));

vi.mock("@/hooks/useUsers", () => ({
  useMyPermissions: () => ({
    data: [{ module_key: "deal_registrations", access_level: "edit" }],
    isLoading: false,
    isResolved: true,
    isError: false,
  }),
}));

vi.mock("@/hooks/useCommissions", () => ({
  useDealRegistrations: () => ({ data: [], isLoading: false, isError: false, error: null }),
}));

vi.mock("@/hooks/usePartners", () => ({
  usePartners: () => ({ data: undefined, isLoading: false, isError: false }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DealRegistrations />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DealRegistrations (partner_sales)", () => {
  it("renders the heading and an explicit empty state", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /deal registrations/i })).toBeInTheDocument();
    expect(screen.getByText(/no deal registrations yet/i)).toBeInTheDocument();
  });

  it("does not render HQ review actions for partner users", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument();
  });
});
