import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PartnerActivationReadiness } from "@/components/partner-growth/PartnerActivationReadiness";

const qa = vi.hoisted(() => ({
  plan: null as any,
  loading: false,
  error: false,
  contacts: [{ id: "ct1", name: "Prospect contact" }] as any[],
  tasks: [] as any[],
  taskLoading: false,
  pathPlans: [] as any[],
  createTask: vi.fn().mockResolvedValue({}),
  savePlan: vi.fn().mockResolvedValue({}),
  legalReview: vi.fn().mockResolvedValue({}),
  handoff: vi.fn().mockResolvedValue({}),
  savePath: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/components/partner-growth/PartnerConversionPanel", () => ({ PartnerConversionPanel: () => null }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "hq-admin-test" } }),
}));
vi.mock("@/hooks/usePartnerGrowth", () => ({
  useProspectContacts: () => ({ data: qa.contacts }),
  useProspectTasks: () => ({ data: qa.tasks, isLoading: qa.taskLoading }),
  useCreateProspectTask: () => ({ mutateAsync: qa.createTask, isPending: false }),
}));
vi.mock("@/hooks/usePartnerActivation", () => ({
  useActivationPlan: () => ({
    data: qa.plan, isLoading: qa.loading, isError: qa.error,
  }),
  useCapabilityPlans: () => ({ data: qa.pathPlans }),
  useSaveActivationPlan: () => ({ mutateAsync: qa.savePlan, isPending: false }),
  useApproveLegalReview: () => ({ mutateAsync: qa.legalReview, isPending: false }),
  useApproveActivationHandoff: () => ({ mutateAsync: qa.handoff, isPending: false }),
  useSaveCapabilityPlan: () => ({ mutateAsync: qa.savePath, isPending: false }),
}));

const prospect = (stage: string = "Agreement Pending", model = "CMSC") => ({
  id: "p1",
  company_name: "QA Industrial",
  recruitment_stage: stage,
  proposed_partner_type: model,
  signed_verified_by: stage === "Signed" ? "hq-admin-test" : null,
  signed_verified_at: stage === "Signed" ? "2026-10-10T12:00:00Z" : null,
  agreement_signed_on: stage === "Signed" ? "2026-10-10" : null,
  agreement_reference: stage === "Signed" ? "DOC-2026-TEST" : null,
}) as any;

const plan = (legal: boolean, ready = false) => ({
  prospect_id: "p1",
  target_model: "CMSC",
  hq_activation_owner: "hq-admin-test",
  kickoff_objective: "Kickoff meeting agreed",
  first_value_milestone: "First qualified customer introduction",
  enablement_plan: "",
  commercial_handoff_notes: "",
  legal_review_reference: legal ? "LEGAL-TEST-V1" : null,
  legal_review_status: legal ? "approved" : "pending",
  readiness_status: ready ? "ready_for_handoff" : "planning",
});

const mount = (stage = "Agreement Pending", canEdit = true, isAdmin = true, model = "CMSC") =>
  render(<PartnerActivationReadiness prospect={prospect(stage, model)} canEdit={canEdit} isAdmin={isAdmin} />);

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  qa.plan = null;
  qa.loading = false;
  qa.error = false;
  qa.contacts = [{ id: "ct1", name: "Prospect contact" }];
  qa.tasks = [];
  qa.taskLoading = false;
  qa.pathPlans = [];
});

describe("Partner Activation Readiness: interface acceptance", () => {
  it("presents readiness checks without suggesting signature activates a partner", () => {
    qa.plan = plan(false);
    mount();
    expect(screen.getByText("Operational handoff")).toBeInTheDocument();
    expect(screen.getByText(/no partner created/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve handoff readiness/i })).toBeDisabled();
    expect(screen.getByText(/not a legally approved template/i)).toBeInTheDocument();
  });

  it("HQ Standard can edit planning but cannot see either approval button", () => {
    qa.plan = plan(false);
    mount("Signed", true, false);
    expect(screen.getByRole("button", { name: /Save activation plan/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Record HQ legal review/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve handoff readiness/i })).not.toBeInTheDocument();
  });

  it("HQ Admin cannot approve handoff without a signed agreement or legal review", () => {
    qa.plan = plan(true);
    mount("Agreement Pending");
    const consent = screen.getByLabelText(/authorize preparation for operational handoff/i);
    fireEvent.click(consent);
    expect(screen.getByRole("button", { name: /Approve handoff readiness/i })).toBeDisabled();
  });

  it("HQ Admin can approve an eligible saved plan only after explicit acknowledgement", async () => {
    qa.plan = plan(true);
    mount("Signed");
    const button = screen.getByRole("button", { name: /Approve handoff readiness/i });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/authorize preparation for operational handoff/i));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(qa.handoff).toHaveBeenCalledOnce());
  });

  it("does not unlock handoff when there is no saved plan", () => {
    mount("Signed");
    expect(screen.queryByRole("button", { name: /Record HQ legal review/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Record HQ legal review/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Approve handoff readiness/i })).toBeDisabled();
  });

  it("highlights the selected pathway while other capability paths stay collapsed", () => {
    qa.plan = plan(false);
    mount();
    expect(screen.getByText("CMSC — Strategic Connector")).toBeInTheDocument();
    const other = screen.getByRole("button", { name: /Other pathways \(2\)/i });
    expect(other).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(other);
    expect(other).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("CMAR — Accredited Reseller")).toBeInTheDocument();
    expect(screen.getByText("CMAI — Accredited Implementer")).toBeInTheDocument();
  });

  it("does not imply a standard certification pathway for Strategic Alliance", () => {
    qa.plan = { ...plan(false), target_model: "Strategic Alliance" };
    mount("Engaged", true, true, "Strategic Alliance");
    expect(screen.getByText(/requires a separately approved plan/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Other pathways \(3\)/i })).toBeInTheDocument();
  });

  it("requires a due date before creating a first-value task", () => {
    qa.plan = plan(false);
    mount();
    expect(screen.getByRole("button", { name: /Create first-value task/i })).toBeDisabled();
    expect(screen.getByText(/Choose a due date/i)).toBeInTheDocument();
  });

  it("creates a dated first-value task after filling the date", async () => {
    qa.plan = plan(false);
    mount();
    fireEvent.change(screen.getByLabelText("First-value task due date"), { target: { value: "2026-11-10" } });
    fireEvent.click(screen.getByRole("button", { name: /Create first-value task/i }));
    await waitFor(() => expect(qa.createTask).toHaveBeenCalledWith({
      title: "Partner activation: First qualified customer introduction",
      due_date: "2026-11-10",
    }));
  });

  it("disables task creation for existing open milestones", () => {
    qa.plan = plan(false);
    qa.tasks = [{
      id: "t1",
      title: "Partner activation: First qualified customer introduction",
      due_date: "2026-10-11",
      status: "To Do",
      task_status: "Open",
    }];
    mount();
    fireEvent.change(screen.getByLabelText("First-value task due date"), { target: { value: "2026-11-10" } });
    expect(screen.getByRole("button", { name: /Create first-value task/i })).toBeDisabled();
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
  });

  it("ignores a completed task even if legacy task_status remains Open", () => {
    qa.plan = plan(false);
    qa.tasks = [{
      id: "t1",
      title: "Partner activation: First qualified customer introduction",
      due_date: "2026-10-11",
      status: "Done",
      task_status: "Open",
    }];
    mount();
    fireEvent.change(screen.getByLabelText("First-value task due date"), { target: { value: "2026-11-10" } });
    expect(screen.getByRole("button", { name: /Create first-value task/i })).toBeEnabled();
  });

  it("shows failure rather than empty successful content if the activation query fails", () => {
    qa.error = true;
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent(/Unable to load activation planning/i);
  });
});
