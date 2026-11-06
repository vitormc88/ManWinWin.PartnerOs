import type { ReactNode } from "react";
import { useSalesCapability } from "@/hooks/useSalesCapability";

/** UX gate for /sales/* routes. Database RLS remains the authority. */
export function DirectSalesGate({ children }: { children: ReactNode }) {
  const { isLoading, hasAccess, isError } = useSalesCapability();
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (isError || !hasAccess)
    return (
      <div className="max-w-xl mx-auto mt-16 rounded-xl border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">Direct Sales is not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Direct Sales is limited to active internal HQ Sales users.
        </p>
      </div>
    );
  return <>{children}</>;
}
