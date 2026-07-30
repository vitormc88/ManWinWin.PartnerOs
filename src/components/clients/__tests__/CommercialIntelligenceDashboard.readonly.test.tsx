import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CommercialIntelligenceDashboard } from "@/components/clients/CommercialIntelligenceDashboard";

const data = {
  client_id: "c1",
  recommended_actions: [
    {
      id: "a1",
      priority: 1,
      title: "Schedule renewal call",
      description: "Renewal approaching",
      reason: "90 days out",
      impact: "high",
      estimated_arr: 1000,
      action_type: "renewal",
      related_route: "/renewals",
    },
  ],
  upsell_opportunities: [
    {
      id: "o1",
      type: "module",
      title: "Add Inventory module",
      description: "Not licensed",
      reason: "Peers use it",
      estimated_arr: 2000,
      confidence: "high",
      priority: "high",
      source: "catalog",
      related_item: "inv",
      recommended_action: "Propose",
    },
  ],
  missing_modules: [],
  missing_plugins: [],
  risk_signals: [],
  commercial_score: 70,
  renewal_risk: "low",
};

vi.mock("@/hooks/useClientCommercialIntelligence", () => ({
  useClientCommercialIntelligence: () => ({ data, isLoading: false }),
}));

vi.mock("./ClientLifecycleTimeline", () => ({ ClientLifecycleTimeline: () => null }));
vi.mock("@/components/clients/ClientLifecycleTimeline", () => ({ ClientLifecycleTimeline: () => null }));

function renderDash(readOnly: boolean) {
  return render(
    <MemoryRouter>
      <CommercialIntelligenceDashboard clientId="c1" readOnly={readOnly} />
    </MemoryRouter>
  );
}

describe("CommercialIntelligenceDashboard readOnly", () => {
  it("hides Act and Open CTAs but keeps the intelligence readable", () => {
    renderDash(true);
    expect(screen.getByText(/schedule renewal call/i)).toBeInTheDocument();
    expect(screen.getByText(/add inventory module/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /act/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open/i })).not.toBeInTheDocument();
  });

  it("shows CTAs when writable", () => {
    renderDash(false);
    expect(screen.getByRole("button", { name: /act/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
  });
});
