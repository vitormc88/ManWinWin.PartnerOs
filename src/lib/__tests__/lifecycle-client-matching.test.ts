import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Behavioural test for canonical client matching on re-processing a deal.
 * The supabase client is fully mocked — no real query is ever issued and no
 * production data is touched.
 */

type Row = Record<string, any>;

const state: {
  clients: Row[];
  captured: { column: string; value: any; op: string }[];
  inserted: Row[];
} = { clients: [], captured: [], inserted: [] };

function clientsQuery() {
  let rows = [...state.clients];
  const q: any = {
    select: () => q,
    ilike: (col: string, pattern: string) => {
      const needle = pattern.replace(/%/g, "").toLowerCase();
      rows = rows.filter((r) => String(r[col] ?? "").toLowerCase().includes(needle));
      return q;
    },
    eq: (col: string, val: any) => {
      state.captured.push({ op: "eq", column: col, value: val });
      rows = rows.filter((r) => r[col] === val);
      return q;
    },
    is: (col: string, val: any) => {
      state.captured.push({ op: "is", column: col, value: val });
      rows = rows.filter((r) => (r[col] ?? null) === val);
      return q;
    },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => ({ data: rows[0] ?? null, error: null }),
    limit: async () => ({ data: rows, error: null }),
    order: () => q,
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "clients") {
        const q = clientsQuery();
        return {
          ...q,
          insert: (row: Row) => {
            const created = { id: `new-${state.inserted.length + 1}`, ...row };
            state.inserted.push(created);
            state.clients.push(created);
            return {
              select: () => ({ single: async () => ({ data: created, error: null }) }),
            };
          },
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
        insert: async () => ({ data: null, error: null }),
      };
    },
  },
}));

vi.mock("@/lib/activity-log", () => ({ logSystemActivity: vi.fn() }));

const { findOrCreateClientFromDeal } = await import("@/lib/lifecycle");

const PARTNER = "db1b15b7-3333-4333-8333-333333333333";

beforeEach(() => {
  state.clients = [];
  state.captured = [];
  state.inserted = [];
});

describe("findOrCreateClientFromDeal — canonical partner matching", () => {
  it("finds an existing canonical-only client on a second processing of the same deal", async () => {
    state.clients = [
      { id: "c-1", commercial_name: "Watsons", partner_uuid: PARTNER, partner_id: null },
    ];
    const res = await findOrCreateClientFromDeal({
      id: "deal-1",
      company_name: "Watsons",
      partner_id: PARTNER,
    } as any);

    expect(res.created).toBe(false);
    expect(res.client.id).toBe("c-1");
    expect(state.inserted).toHaveLength(0);
    expect(state.captured.some((c) => c.column === "partner_uuid" && c.value === PARTNER)).toBe(true);
    expect(state.captured.some((c) => c.column === "partner_id")).toBe(false);
  });

  it("does not promote or attach a legacy-only client to the partner", async () => {
    state.clients = [
      { id: "c-legacy", commercial_name: "Watsons", partner_uuid: null, partner_id: PARTNER },
    ];
    const res = await findOrCreateClientFromDeal({
      id: "deal-2",
      company_name: "Watsons",
      partner_id: PARTNER,
    } as any);

    // The legacy row is never claimed by the canonical partner scope.
    expect(res.client.id).not.toBe("c-legacy");
    expect(res.created).toBe(true);
    expect(state.inserted[0].partner_uuid).toBe(PARTNER);
    expect("partner_id" in state.inserted[0]).toBe(false);
    // The legacy row itself stays untouched.
    expect(state.clients.find((c) => c.id === "c-legacy")).toEqual({
      id: "c-legacy",
      commercial_name: "Watsons",
      partner_uuid: null,
      partner_id: PARTNER,
    });
  });
});
