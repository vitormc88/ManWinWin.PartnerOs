import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDealProposals } from "../useProposals";

const state = vi.hoisted(() => ({ filters: [] as Array<[string, string]> }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "proposals") throw new Error(`Unexpected table: ${table}`);
      const rows = [
        { id: "canonical", source_type: "deal", deal_id: "deal-1", lead_id: null },
        { id: "other-deal", source_type: "deal", deal_id: "deal-2", lead_id: "deal-1" },
        { id: "renewal", source_type: "renewal", deal_id: null, lead_id: "deal-1" },
      ];
      let selected = rows;
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          state.filters.push([column, value]);
          selected = selected.filter((row) => row[column as keyof typeof row] === value);
          return query;
        },
        order: async () => ({ data: selected, error: null }),
      };
      return query;
    },
  },
}));

describe("deal proposal source query", () => {
  it("shows proposals by canonical deal_id rather than legacy lead_id", async () => {
    state.filters = [];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDealProposals("deal-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((proposal) => proposal.id)).toEqual(["canonical"]);
    expect(state.filters).toEqual([["source_type", "deal"], ["deal_id", "deal-1"]]);
  });
});
