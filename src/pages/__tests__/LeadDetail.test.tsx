import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";
import LeadDetail from "../LeadDetail";
const state = vi.hoisted(() => ({
  hq: true,
  lead: {
    id: "lead",
    company_name: "Test lead",
    qualification_stage: "New",
    status: "New",
    created_at: "2026-10-09T12:00:00Z",
    linked_partner_id: null,
    email: "lead@example.com",
    phone: "12345",
  },
  mutate: vi.fn(),
}));
vi.mock("@/hooks/useIncomingLeads", () => ({
  useIncomingLead: () => ({ data: state.lead, isLoading: false }),
  useUpdateIncomingLead: () => ({ mutate: state.mutate, isPending: false }),
  useDeleteIncomingLead: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/usePartners", () => ({ usePartners: () => ({ data: [] }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isHQ: state.hq, isAdmin: false }),
}));
vi.mock("@/hooks/useLeadContactAttempts", () => ({
  useLeadContactAttempts: () => ({ data: [] }),
  OUTCOME_LABEL: {},
  CHANNEL_LABEL: {},
}));
vi.mock("@/hooks/useLeadTasks", () => ({ useLeadTasks: () => ({ data: [] }) }));
vi.mock("@/hooks/usePartnerUsers", () => ({
  usePartnerUsers: () => ({ data: [] }),
}));
vi.mock("@/hooks/useHQUsers", () => ({ useHQUsers: () => ({ data: [] }) }));
vi.mock("@/components/leads/ConvertToOpportunityDialog", () => ({
  ConvertToOpportunityDialog: () => null,
}));
vi.mock("@/components/leads/LeadTaskList", () => ({
  LeadTaskList: () => null,
}));
vi.mock("@/components/leads/AddLeadTaskDialog", () => ({
  AddLeadTaskDialog: ({ open }: any) =>
    open ? <div>Task planner opened</div> : null,
}));
vi.mock("@/components/leads/LogContactAttemptDialog", () => ({
  LogContactAttemptDialog: () => null,
}));
vi.mock("@/components/leads/DisqualifyLeadDialog", () => ({
  DisqualifyLeadDialog: () => null,
}));
vi.mock("@/components/leads/MoveToNurtureDialog", () => ({
  MoveToNurtureDialog: () => null,
}));
vi.mock("@/components/leads/SendEmailDialog", () => ({
  SendEmailDialog: () => null,
}));
vi.mock("@/components/leads/OutreachIntelligence", () => ({
  OutreachIntelligence: () => null,
}));
vi.mock("@/components/commercial/DiscoveryWorkspace", () => ({
  DiscoveryWorkspace: () => <div>Discovery workspace retained</div>,
}));
vi.mock("@/components/commercial/NextStepPanel", () => ({
  NextStepPanel: () => null,
}));
beforeEach(() => {
  cleanup();
  state.hq = true;
  state.mutate.mockClear();
});
const mount = () =>
  render(
    <MemoryRouter initialEntries={["/incoming-leads/lead"]}>
      <Routes>
        <Route path="/incoming-leads/:id" element={<LeadDetail />} />
      </Routes>
    </MemoryRouter>,
  );
describe("Incoming lead progressive disclosure", () => {
  it("opens in overview with exactly four tabs and optional help closed", () => {
    mount();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Qualification help" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Contact strategy and templates").closest("details"),
    ).not.toHaveAttribute("open");
  });
  it("offers a single actionable next step for a new lead", () => {
    mount();
    expect(
      screen.getAllByText("Schedule the first qualification touch"),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Plan contact" }));
    expect(screen.getByText("Task planner opened")).toBeInTheDocument();
  });
  it("opens qualification help on demand", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Qualification help" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Qualification help");
    expect(screen.queryByText("What to do next")).not.toBeInTheDocument();
  });
  it("does not expose HQ conversion to partners", () => {
    state.hq = false;
    mount();
    expect(
      screen.queryByRole("button", { name: "Convert" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Routing reason")).not.toBeInTheDocument();
  });
  it("keeps discovery reachable and uses neutral wording for unknown information", async () => {
    mount();
    await userEvent.click(screen.getByRole("tab", { name: "Qualification" }));
    expect(screen.getByText("Information to confirm")).toBeInTheDocument();
    expect(screen.queryByText("Potential risks")).not.toBeInTheDocument();
    expect(
      screen.getByText("Discovery and current situation").closest("details"),
    ).not.toHaveAttribute("open");
    expect(
      screen.getByText("Discovery workspace retained"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Interest/ }));
    await userEvent.click(
      screen.getByRole("button", { name: "Qualification help" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Working on Interest");
  });
  it("retains autosave after moving internal notes into overview", async () => {
    mount();
    const field = screen.getByPlaceholderText(
      "Add internal notes about this lead…",
    );
    fireEvent.change(field, { target: { value: "Contact needs a follow-up" } });
    await waitFor(
      () =>
        expect(state.mutate).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "lead",
            notes: "Contact needs a follow-up",
            status: "New",
          }),
          expect.any(Object),
        ),
      { timeout: 3000 },
    );
  });
});
