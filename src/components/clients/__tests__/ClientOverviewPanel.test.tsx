import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ClientOverviewPanel } from "@/components/clients/ClientOverviewPanel";
import { resolveRenewal } from "@/lib/renewal-resolution";

const contacts: any[] = [
  { id: "1", contact_name: "Ana Silva", role_function: "IT Manager", email: "ana@watsons.test", is_primary: true },
  { id: "2", contact_name: "Bruno Costa" },
];

vi.mock("@/hooks/useClients", () => ({
  useClientContacts: (_id: string) => ({ data: (globalThis as any).__contacts ?? [] }),
}));

const today = new Date("2026-08-03T00:00:00Z");

function renderPanel(opts: {
  contacts: any[];
  intelligence: any;
  contractEnd: string | null;
  readOnly?: boolean;
}) {
  (globalThis as any).__contacts = opts.contacts;
  const resolved = resolveRenewal({
    contract: opts.contractEnd ? { contract_end_date: opts.contractEnd, status: "Active" } : null,
    today,
  });
  return render(
    <MemoryRouter>
      <ClientOverviewPanel
        clientId="c1"
        client={{ id: "c1", status: "Active", commercial_name: "Test" }}
        intelligence={opts.intelligence}
        resolvedRenewal={resolved}
        contractStatus="Active"
        hasLicense
        readOnly={opts.readOnly}
      />
    </MemoryRouter>,
  );
}

describe("ClientOverviewPanel", () => {
  it("Watsons: lean overview with no health/confidence/expansion/snapshot blocks", () => {
    renderPanel({
      contacts,
      intelligence: { recurring_arr: 4221.6, year1_value: 4221.6 },
      contractEnd: "2027-07-19",
    });
    expect(screen.getByText(/primary contact/i)).toBeInTheDocument();
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText(/view all \(1 more\)/i)).toBeInTheDocument();
    expect(screen.getByText(/recurring revenue \(arr\)/i)).toBeInTheDocument();
    expect(screen.getByText(/19 Jul 2027/)).toBeInTheDocument();
    expect(screen.getByText(/no immediate action required/i)).toBeInTheDocument();

    expect(screen.queryByText(/commercial health/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/expansion opportunities/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recent commercial activity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/commercial snapshot/i)).not.toBeInTheDocument();
  });

  it("APS: one priority (renewal in 5 days) and Year 1 stays visible with €0 ARR", () => {
    renderPanel({
      contacts: [],
      intelligence: { recurring_arr: 0, year1_value: 1656 },
      contractEnd: "2026-08-08",
    });
    expect(screen.getByText(/renewal due in 5 days/i)).toBeInTheDocument();
    expect(screen.getByText(/no recurring revenue recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/year 1 value/i)).toBeInTheDocument();
    expect(screen.getByText("€1,656")).toBeInTheDocument();
    expect(screen.getByText(/no contacts yet/i)).toBeInTheDocument();
    // Only a single attention item is rendered.
    expect(screen.queryByText(/no contact on record/i)).not.toBeInTheDocument();
  });

  it("read-only users get the insight without any action CTA", () => {
    renderPanel({
      contacts,
      intelligence: { recurring_arr: 0, year1_value: 1656 },
      contractEnd: "2026-08-08",
      readOnly: true,
    });
    expect(screen.getByText(/renewal due in 5 days/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open commercial/i })).not.toBeInTheDocument();
  });
});
