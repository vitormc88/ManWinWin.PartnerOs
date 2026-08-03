// Authenticated-scope isolation for the React Query cache.
//
// Cross-session stale data (user A's cached results briefly rendered inside
// user B's session) is prevented by two mechanisms:
//   1. Every cache entry is hashed together with the current authenticated
//      scope, so two different users can never share a cache entry even if
//      their query keys are identical.
//   2. The cache is cleared synchronously whenever the scope changes.
//
// The scope is a module-level value (not React state) because the query client
// needs it during hashing, outside of the React render cycle.

import type { QueryClient, QueryKey } from "@tanstack/react-query";

export const ANONYMOUS_SCOPE = "anon";

let currentScope: string = ANONYMOUS_SCOPE;

export function getQueryScope(): string {
  return currentScope;
}

/**
 * Sets the authenticated scope. When the scope actually changes (sign-in,
 * sign-out, user switch) every cached entry from the previous identity is
 * discarded synchronously, before any new render can read it.
 * Returns true when the scope changed.
 */
export function setQueryScope(scope: string | null | undefined, queryClient?: QueryClient): boolean {
  const next = scope || ANONYMOUS_SCOPE;
  if (next === currentScope) return false;
  currentScope = next;
  if (queryClient) {
    queryClient.cancelQueries();
    queryClient.clear();
  }
  return true;
}

/** Test helper: reset module state between cases. */
export function resetQueryScope() {
  currentScope = ANONYMOUS_SCOPE;
}

/** Hash function that namespaces every query key by the authenticated scope. */
export function scopedQueryKeyHashFn(queryKey: QueryKey): string {
  return JSON.stringify([currentScope, queryKey], (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value)
          .sort()
          .reduce((acc: Record<string, unknown>, k) => {
            acc[k] = (value as Record<string, unknown>)[k];
            return acc;
          }, {})
      : value
  );
}
