import { describe, expect, it, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  ANONYMOUS_SCOPE,
  getQueryScope,
  resetQueryScope,
  scopedQueryKeyHashFn,
  setQueryScope,
} from "@/lib/query-scope";

describe("authenticated query scope isolation", () => {
  beforeEach(() => resetQueryScope());

  it("hashes identical query keys differently per authenticated user", () => {
    setQueryScope("raven-user");
    const ravenHash = scopedQueryKeyHashFn(["partners", undefined]);
    setQueryScope("fitc-user");
    const fitcHash = scopedQueryKeyHashFn(["partners", undefined]);
    expect(ravenHash).not.toBe(fitcHash);
  });

  it("keeps the same hash for the same user (refetch may reuse confirmed data)", () => {
    setQueryScope("raven-user");
    const a = scopedQueryKeyHashFn(["clients", { status: "Active" }]);
    const changed = setQueryScope("raven-user");
    const b = scopedQueryKeyHashFn(["clients", { status: "Active" }]);
    expect(changed).toBe(false);
    expect(a).toBe(b);
  });

  it("discards the previous user's cached data on logout and on user switch", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { queryKeyHashFn: scopedQueryKeyHashFn } },
    });

    // Raven signs in and her dashboard data is cached.
    setQueryScope("raven-user", queryClient);
    queryClient.setQueryData(["partners", undefined], [{ company_name: "Raven" }]);
    expect(queryClient.getQueryData(["partners", undefined])).toBeTruthy();

    // Sign out: cache is cleared synchronously.
    setQueryScope(null, queryClient);
    expect(getQueryScope()).toBe(ANONYMOUS_SCOPE);
    expect(queryClient.getQueryData(["partners", undefined])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);

    // FITC signs in: no Raven data is visible during loading.
    setQueryScope("fitc-user", queryClient);
    expect(queryClient.getQueryData(["partners", undefined])).toBeUndefined();

    queryClient.setQueryData(["partners", undefined], [{ company_name: "FITC" }]);
    expect(queryClient.getQueryData(["partners", undefined])).toEqual([{ company_name: "FITC" }]);
  });

  it("never leaks data when switching directly between two users", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { queryKeyHashFn: scopedQueryKeyHashFn } },
    });
    setQueryScope("raven-user", queryClient);
    queryClient.setQueryData(["deals", undefined], [{ id: "raven-deal" }]);
    setQueryScope("fitc-user", queryClient);
    expect(queryClient.getQueryData(["deals", undefined])).toBeUndefined();
  });
});
