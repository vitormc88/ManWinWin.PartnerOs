import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { JOB_ROLE_OPTIONS, SECTOR_OPTIONS } from "@/data/client-field-options";
import { EditLeadDialog } from "./EditLeadDialog";
import type { IncomingLead } from "@/hooks/useIncomingLeads";
const state = vi.hoisted(() => ({ mutate: vi.fn(), pending: false }));
vi.mock("@/hooks/useIncomingLeads", () => ({ useUpdateIncomingLead: () => ({ mutate: state.mutate, isPending: state.pending }) }));
vi.mock("@/components/clients/CountryCombobox", () => ({ CountryCombobox: ({ value, onChange }: any) => <input aria-label="Country" value={value} onChange={e => onChange(e.target.value)} /> }));
const lead = { id: "test-lead", company_name: "Original", contact_name: "Jane", email: "jane@example.com", phone: "123", country: "Portugal", job_role: null, converted_to_deal_id: null } as IncomingLead;
beforeEach(() => {
  state.mutate.mockReset(); state.pending = false;
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(cleanup);
describe("Edit lead details", () => {
  it("uses the shared job-role and sector dropdowns and saves both selections", () => {
    render(<EditLeadDialog lead={lead} canEdit onClose={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Job role" }), { key: "ArrowDown" });
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["— None —", ...JOB_ROLE_OPTIONS]);
    fireEvent.click(screen.getByRole("option", { name: "Plant Manager", exact: true }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Sector" }), { key: "ArrowDown" });
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["— None —", ...SECTOR_OPTIONS]);
    fireEvent.click(screen.getByRole("option", { name: "Energy", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(state.mutate.mock.calls[0][0]).toEqual({ id: "test-lead", requireUnconverted: true, job_role: "Plant Manager", sector: "Energy" });
  });
  it("preserves legacy values while changing unrelated details", () => {
    render(<EditLeadDialog lead={{ ...lead, job_role: "Technical Director", sector: "Legacy sector" }} canEdit onClose={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Job role" })).toHaveTextContent("Technical Director (current value)");
    expect(screen.getByRole("combobox", { name: "Sector" })).toHaveTextContent("Legacy sector (current value)");
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Corrected contact" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(state.mutate.mock.calls[0][0]).toEqual({ id: "test-lead", requireUnconverted: true, contact_name: "Corrected contact" });
  });
  it("Cancel discards the draft without writing", () => {
    const close = vi.fn(); render(<EditLeadDialog lead={lead} canEdit onClose={close} />);
    fireEvent.change(screen.getByLabelText(/Company name/), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledOnce(); expect(state.mutate).not.toHaveBeenCalled();
  });
  it("sends only changed basic fields, trims values and closes on success", () => {
    const close = vi.fn(); render(<EditLeadDialog lead={lead} canEdit onClose={close} />);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Company name/), { target: { value: " Corrected " } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(state.mutate.mock.calls[0][0]).toEqual({ id: "test-lead", requireUnconverted: true, company_name: "Corrected", phone: null });
    expect(close).not.toHaveBeenCalled(); state.mutate.mock.calls[0][1].onSuccess(); expect(close).toHaveBeenCalledOnce();
  });
  it("rejects whitespace-only company names", () => {
    render(<EditLeadDialog lead={lead} canEdit onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Company name/), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Company name is required"); expect(state.mutate).not.toHaveBeenCalled();
  });
  it("blocks converted leads and view-only access", () => {
    const { rerender } = render(<EditLeadDialog lead={{ ...lead, converted_to_deal_id: "deal" }} canEdit onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Company name/)).toBeDisabled();
    rerender(<EditLeadDialog lead={lead} canEdit={false} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled(); expect(state.mutate).not.toHaveBeenCalled();
  });
  it("retains the draft after a failed save", () => {
    state.mutate.mockImplementation((_data, options) => options.onError());
    const close = vi.fn(); render(<EditLeadDialog lead={lead} canEdit onClose={close} />);
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "New name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save"); expect(screen.getByLabelText("Contact name")).toHaveValue("New name"); expect(close).not.toHaveBeenCalled();
  });
  it("prevents duplicate submissions while saving", () => {
    state.pending = true; render(<EditLeadDialog lead={lead} canEdit onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
