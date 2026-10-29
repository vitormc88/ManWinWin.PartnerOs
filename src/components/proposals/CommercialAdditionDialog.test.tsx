import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommercialAdditionDialog } from "./CommercialAdditionDialog";
import { calculateAddition, initialAdditionSelection, type AdditionDraft, type AdditionBaseline } from "@/lib/commercial-additions";
import type { Proposal, PricingRule } from "@/types/proposal";
const baseline: AdditionBaseline = { clientId: "c", clientName: "Synthetic customer", partnerId: null, licenseId: "l", contractId: "k", family: "Business", model: "useit", plan: null, deployment: "saas", backoffice: 10, web: 11, owned: [], renewalDate: "2028-04-14", priceTable: "2023", recordedAnnual: 14031, satActive: true };
const rules: PricingRule[] = [
  { id: "bo", code: "BUS_USEIT_ADDITIONAL_BACKOFFICE", unit_price: 352, unit_type: "yearly", label: "BO", category: "business", active: true, currency: "EUR", notes: null },
  { id: "host", code: "BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE", unit_price: 10, unit_type: "per-user-month", label: "Hosting", category: "business", active: true, currency: "EUR", notes: null },
];
const selection = { ...initialAdditionSelection(baseline, "2026-10-29"), backoffice: 1, monthPolicy: "started" as const, pricingBasis: "direct" as const, offerBasis: "customer" as const, implementationReview: "not_needed" as const, priceReview: "QA catalogue approved" };

const state = vi.hoisted(() => ({ isHQ: true, editable: true, rpc: vi.fn(), error: vi.fn(), pricing: [] as unknown[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isHQ: state.isHQ, user: { id: "qa" } }) }));
vi.mock("@/hooks/useModuleAccess", () => ({ useModuleAccess: () => ({ canEdit: () => state.editable }) }));
vi.mock("@/hooks/useProposals", () => ({ usePricingRules: () => ({ data: state.pricing, isLoading: false, isError: false }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: "saved", status: "Draft", updated_at: "2026-10-29", version: 1 } }) }) }) }) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: state.error } }));
const draft = (): AdditionDraft => ({ schema: "commercial_addition_v1", action: "add_users", baseline, selection, rules, quote: calculateAddition(baseline, selection, rules) });
const proposal = (d = draft(), status = "Draft") => ({ id: "draft", version: 1, status, business_config: { commercial_addition: d }, payment_terms: "Payment in 30 days", updated_at: "2026-10-29" }) as Proposal;
const source = { source_type: "client" as const, client_id: baseline.clientId, contract_id: baseline.contractId, license_id: baseline.licenseId, partner_uuid: null, deal_id: null, renewal_id: null };
const show = (p = proposal()) => render(<CommercialAdditionDialog open onOpenChange={() => {}} proposalSource={source} editingProposal={p} />);
beforeEach(() => { cleanup(); vi.clearAllMocks(); state.isHQ = true; state.editable = true; state.pricing = []; state.rpc.mockResolvedValue({ data: "saved", error: null }); });
describe("Addition proposal editor", () => {
  it("reopens the saved snapshot without using new catalogue defaults and saves only through the atomic RPC", async () => {
    show();
    expect(screen.getByLabelText("Additional BackOffice (not total)")).toHaveValue(1);
    expect(screen.getByRole("region", { name: "Incremental investment summary" })).toHaveTextContent("€708.00");
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledOnce());
    expect(state.rpc.mock.calls[0][0]).toBe("save_commercial_addition_draft");
    expect(state.rpc.mock.calls[0][1]._payload.total_recurring).toBe(472);
    expect(state.rpc.mock.calls[0][1]._payload.total_year_1).toBe(708);
    expect(state.rpc.mock.calls[0][1]._payload.proposal_mode).toBe("useit_only");
  });
  it("blocks invalid quantities immediately", () => { show(); fireEvent.change(screen.getByLabelText("Additional WEB / Mobility (not total)"), { target: { value: "1.5" } }); expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled(); });
  it("does not edit validated proposals or users without edit access", () => { show(proposal(draft(), "Ready")); expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled(); cleanup(); state.editable = false; show(); expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled(); });
  it("blocks partner revenue shares for a non-HQ user", () => { const d = draft(); d.selection = { ...selection, offerBasis: "partner", licenseShare: 60, hostingShare: 100 }; state.isHQ = false; show(proposal(d)); expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled(); expect(screen.queryByRole("option", { name: /Navaltik to partner/ })).toBeNull(); });
  it("disables already-owned plugins and API", () => { const d = draft(); d.action = "add_plugins"; d.baseline = { ...baseline, owned: ["api", "sla"] }; show(proposal(d)); expect(screen.getByLabelText(/API ManWinWin/)).toBeDisabled(); expect(screen.getByLabelText(/SLA/)).toBeDisabled(); });
  it("fails closed on a malformed saved addition", () => { show({ ...proposal(), business_config: { commercial_addition: { schema: "commercial_addition_v1" } } }); expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled(); });
});
