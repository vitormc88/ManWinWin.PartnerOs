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

vi.mock("@/lib/auth-flow", () => ({
  getAuthFlowState: vi.fn(() => ({
    hasTokens: false,
    isInviteFlow: false,
    isRecoveryFlow: false,
    shouldForcePasswordSetup: false,
  })),
  getResetPasswordTarget: vi.fn(() => "/reset-password"),
}));

describe("ProtectedRoute", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      session: { user: { id: "user-1" } },
      isLoading: false,
      isAuthReady: true,
      isInviteOrRecoveryFlow: false,
      isAdmin: false,
      profile: { is_hq: false, is_active: true, partner_id:'partner-1' },
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

  it("redirects dashboard-only users away from unrelated modules instead of inheriting dashboard access", async () => {
    mockUseMyPermissions.mockReturnValue({
      data: [{ module_key: "dashboard", access_level: "view" }],
      isLoading: false,
      isResolved: true,
      isError: false,
    });

    render(
      <MemoryRouter initialEntries={["/analytics"]}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><div>Dashboard content</div></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><div>Analytics content</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    expect(screen.queryByText("Analytics content")).not.toBeInTheDocument();
  });

  it("allows Customer Explorer for partners with Knowledge Base permission", async () => {
    mockUseMyPermissions.mockReturnValue({
      data: [{ module_key: "knowledge_base", access_level: "view" }],
      isLoading: false, isResolved: true, isError: false,
    });
    render(<MemoryRouter initialEntries={["/customer-explorer"]}><Routes>
      <Route path="/customer-explorer" element={<ProtectedRoute><div>Customer network</div></ProtectedRoute>} />
    </Routes></MemoryRouter>);
    expect(await screen.findByText("Customer network")).toBeInTheDocument();
  });

  it("allows all active partner members independently of module permissions", async () => {
    render(<MemoryRouter initialEntries={["/customer-explorer"]}><Routes>
      <Route path="/customer-explorer" element={<ProtectedRoute><div>Customer network</div></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute><div>Scoped clients</div></ProtectedRoute>} />
    </Routes></MemoryRouter>);
    expect(await screen.findByText("Customer network")).toBeInTheDocument();
    expect(screen.queryByText("Scoped clients")).not.toBeInTheDocument();
  });

  it('denies the directory to inactive users',async()=>{
    mockUseAuth.mockReturnValue({session:{user:{id:'user-1'}},isLoading:false,isAuthReady:true,isAdmin:false,profile:{is_active:false,is_hq:false,partner_id:'partner-1'}});
    render(<MemoryRouter initialEntries={['/customer-explorer']}><ProtectedRoute><div>Customer network</div></ProtectedRoute></MemoryRouter>);
    expect(await screen.findByText('An active PartnerOS membership is required.')).toBeInTheDocument();
    expect(screen.queryByText('Customer network')).not.toBeInTheDocument();
  });

  it("forces invite or recovery sessions to reset-password before app access", async () => {
    mockUseAuth.mockReturnValue({
      session: { user: { id: "user-1" } },
      isLoading: false,
      isAuthReady: true,
      isInviteOrRecoveryFlow: true,
      isAdmin: false,
      profile: { is_hq: false },
    });

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<ProtectedRoute><div>Dashboard content</div></ProtectedRoute>} />
          <Route path="/reset-password" element={<div>Reset Password</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Reset Password")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });
});
