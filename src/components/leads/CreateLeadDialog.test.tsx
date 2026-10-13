import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateLeadDialog } from "./CreateLeadDialog";

const state = vi.hoisted(() => ({
  isHQ: true,
  profile: { id: "miguel", full_name: "Miguel", email: "miguel@example.test", partner_id: null as string | null },
  insert: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state }));
vi.mock("@/hooks/usePartners", () => ({
  usePartners: () => ({ data: [{ id: "mena", company_name: "MENA" }] }),
  usePartner: () => ({ data: { country: "SA" } }),
}));
vi.mock("@/hooks/usePartnerUsers", () => ({ usePartnerUsers: () => ({ data: [{ id: "ahmed", full_name: "Ahmed", email: "ahmed@example.test" }] }) }));
vi.mock("@/hooks/useAssignableUsers", () => ({ useAssignableUsers: () => ({ data: [
  { id: "miguel", full_name: "Miguel", is_hq: true },
  { id: "margarida", full_name: "Margarida", is_hq: true },
  { id: "ahmed", full_name: "Ahmed", is_hq: false },
] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert: state.insert }) } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: state.error } }));
vi.mock("@/lib/activity-log", () => ({ logSystemActivity: vi.fn() }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h1>{children}</h1>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => <select value={value} disabled={disabled} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));
vi.mock("@/components/clients/CountryCombobox", () => ({ CountryCombobox: () => null }));
vi.mock("@/components/clients/SectorSelect", () => ({ SectorSelect: () => null }));

beforeEach(() => {
  cleanup(); vi.clearAllMocks();
  state.isHQ = true;
  state.profile = { id: "miguel", full_name: "Miguel", email: "miguel@example.test", partner_id: null };
  state.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "new-deal" }, error: null }) }) });
});
const create = async () => {
  fireEvent.change(screen.getByPlaceholderText("Company name"), { target: { value: "HQ Test" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Lead" }));
  await waitFor(() => expect(state.insert).toHaveBeenCalledTimes(1));
  return state.insert.mock.calls[0][0];
};

describe("HQ direct opportunity ownership", () => {
  it("defaults to direct HQ, enables assignment and saves the current HQ seller without a partner", async () => {
    render(<CreateLeadDialog open onOpenChange={vi.fn()} />);
    const selects = screen.getAllByRole("combobox");
    expect(selects[0]).toHaveValue("none");
    expect(selects[1]).toBeEnabled();
    expect(selects[1]).toHaveValue("miguel");
    expect(selects[1].textContent).toContain("Margarida");
    expect(selects[1].textContent).not.toContain("Ahmed");
    expect(await create()).toMatchObject({ partner_id: null, assigned_user_id: "miguel", assigned_salesperson: "Miguel", lead_source: null });
  });
  it("allows another active HQ seller to own a direct opportunity", async () => {
    render(<CreateLeadDialog open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "margarida" } });
    expect(await create()).toMatchObject({ partner_id: null, assigned_user_id: "margarida", assigned_salesperson: "Margarida" });
  });
  it("resets owner on partner switch and restores HQ self-assignment when returning to direct", () => {
    render(<CreateLeadDialog open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "mena" } });
    expect(screen.getAllByRole("combobox")[1]).toHaveValue("none");
    expect(screen.getAllByRole("combobox")[1].textContent).toContain("Ahmed");
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "none" } });
    expect(screen.getAllByRole("combobox")[1]).toHaveValue("miguel");
  });
  it("locks partner users to their existing organisation", async () => {
    state.isHQ = false;
    state.profile = { id: "ahmed", full_name: "Ahmed", email: "ahmed@example.test", partner_id: "mena" };
    render(<CreateLeadDialog open onOpenChange={vi.fn()} />);
    expect(screen.queryByText("ManWinWin HQ — Direct sale")).not.toBeInTheDocument();
    expect(await create()).toMatchObject({ partner_id: "mena", assigned_user_id: "ahmed" });
  });
  it("does not create an HQ opportunity for a partner user without membership", () => {
    state.isHQ = false;
    render(<CreateLeadDialog open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Company name"), { target: { value: "Blocked" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Lead" }));
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.error).toHaveBeenCalledWith("An active partner membership is required");
  });
});
