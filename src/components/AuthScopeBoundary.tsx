import { Fragment, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ANONYMOUS_SCOPE } from "@/lib/query-scope";

/**
 * Remounts the protected subtree whenever the authenticated identity changes,
 * so no component memo/local state derived from the previous user survives a
 * sign-out or a user switch.
 */
export function AuthScopeBoundary({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <Fragment key={user?.id ?? ANONYMOUS_SCOPE}>{children}</Fragment>;
}
