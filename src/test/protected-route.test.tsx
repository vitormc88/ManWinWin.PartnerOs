import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const mockUseAuth = vi.fn();
const mockUseMyPermissions = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks/useUsers", () => ({
  useMyPermissions: () => mockUseMyPermissions(),
}));

describe("ProtectedRoute", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      session: { user: { id: "user-1" } },
      isLoading: false,
      isAdmin: false,
    });

    mockUseMyPermissions.mockReturnValue({
      data: [
        { module_key: "clients", access_level: "view" },
        { module_key: "renewals", access_level: "view" },
        { module_key: "pipeline", access_level: "view" },
      ],
      isLoading: false,
      isResolved: true,
      isError: false,
    });
  });

  it("redirects root users without dashboard access to the first allowed module", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><div>Dashboard content</div></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute><div>Clients content</div></ProtectedRoute>} />
          <Route path="/renewals" element={<ProtectedRoute><div>Renewals content</div></ProtectedRoute>} />
          <Route path="/pipeline" element={<ProtectedRoute><div>Pipeline content</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Clients content")).toBeInTheDocument();
    expect(screen.queryByText("Access restricted")).not.toBeInTheDocument();
  });

  it("redirects denied module routes to the first allowed module instead of blocking globally", async () => {
    render(
      <MemoryRouter initialEntries={["/deal-registrations"]}>
        <Routes>
          <Route path="/deal-registrations" element={<ProtectedRoute><div>Deal Registrations content</div></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute><div>Clients content</div></ProtectedRoute>} />
          <Route path="/renewals" element={<ProtectedRoute><div>Renewals content</div></ProtectedRoute>} />
          <Route path="/pipeline" element={<ProtectedRoute><div>Pipeline content</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Clients content")).toBeInTheDocument();
    expect(screen.queryByText("Access restricted")).not.toBeInTheDocument();
  });

  it("keeps showing loading while permissions are still unresolved", () => {
    mockUseMyPermissions.mockReturnValue({
      data: undefined,
      isLoading: true,
      isResolved: false,
      isError: false,
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><div>Dashboard content</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText("Access restricted")).not.toBeInTheDocument();
  });
});