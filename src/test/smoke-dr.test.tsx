import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const session = {
  user: { id: "u1", email: "sales@fitc.pt" },
  access_token: "t",
};

function builder(result: any) {
  const b: any = {
    select: () => b,
    eq: () => b,
    order: () => b,
    single: async () => ({ data: result?.[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: result?.[0] ?? null, error: null }),
    then: (res: any) => Promise.resolve({ data: result, error: null }).then(res),
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({}),
    },
    rpc: async (name: string) => {
      if (name === "get_my_effective_permissions") {
        return { data: [{ module_key: "deal_registrations", access_level: "edit" }], error: null };
      }
      return { data: [], error: null };
    },
    from: (table: string) => {
      if (table === "profiles") return builder([{ id: "u1", is_hq: false, partner_id: "p1", invitation_status: "active" }]);
      if (table === "user_roles") return builder([{ role: "partner_sales" }]);
      return builder([]);
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  },
}));

describe("full app smoke at /deal-registrations", () => {
  it("renders the page", async () => {
    window.history.pushState({}, "", "/deal-registrations");
    const App = (await import("@/App")).default;
    render(<App />);
    await new Promise((r) => setTimeout(r, 1500));
    console.log("DOM>>>", document.body.innerHTML.slice(0, 2000));
  }, 60000);
});
