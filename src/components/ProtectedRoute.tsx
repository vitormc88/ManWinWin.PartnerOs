import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyPermissions } from "@/hooks/useUsers";

const routeModules: Array<{ prefix: string; moduleKey: string }> = [
  { prefix: "/clients", moduleKey: "clients" },
  { prefix: "/renewals", moduleKey: "renewals" },
  { prefix: "/pipeline", moduleKey: "pipeline" },
  { prefix: "/deals", moduleKey: "pipeline" },
  { prefix: "/deal-registrations", moduleKey: "deal_registrations" },
  { prefix: "/commissions", moduleKey: "commissions" },
  { prefix: "/onboarding", moduleKey: "onboarding" },
  { prefix: "/certifications", moduleKey: "certifications" },
  { prefix: "/knowledge", moduleKey: "knowledge_base" },
  { prefix: "/training", moduleKey: "training" },
  { prefix: "/announcements", moduleKey: "announcements" },
  { prefix: "/community", moduleKey: "community" },
  { prefix: "/settings", moduleKey: "settings" },
  { prefix: "/analytics", moduleKey: "dashboard" },
  { prefix: "/partners", moduleKey: "dashboard" },
  { prefix: "/notifications", moduleKey: "dashboard" },
  { prefix: "/tiers", moduleKey: "dashboard" },
  { prefix: "/performance", moduleKey: "dashboard" },
  { prefix: "/users", moduleKey: "_admin_only" },
];

// Order of modules to try when redirecting away from a denied dashboard
const fallbackModuleOrder = [
  { path: "/clients", moduleKey: "clients" },
  { path: "/pipeline", moduleKey: "pipeline" },
  { path: "/renewals", moduleKey: "renewals" },
  { path: "/deal-registrations", moduleKey: "deal_registrations" },
  { path: "/commissions", moduleKey: "commissions" },
  { path: "/knowledge", moduleKey: "knowledge_base" },
  { path: "/onboarding", moduleKey: "onboarding" },
  { path: "/certifications", moduleKey: "certifications" },
  { path: "/training", moduleKey: "training" },
  { path: "/announcements", moduleKey: "announcements" },
  { path: "/community", moduleKey: "community" },
];

const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const AccessDenied = ({ message }: { message: string }) => (
  <div className="min-h-screen flex items-center justify-center bg-background px-6">
    <div className="rounded-xl border bg-card p-6 text-center max-w-md">
      <h2 className="text-lg font-semibold text-foreground">Access restricted</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  </div>
);

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading, isAdmin } = useAuth();
  const location = useLocation();
  const { data: myPerms, isLoading: permsLoading, isError: permsError } = useMyPermissions();

  if (isLoading) return <LoadingSpinner />;
  if (!session) return <Navigate to="/auth" replace />;

  // HQ Admin bypasses all module checks
  if (isAdmin) return <>{children}</>;

  // Find which module this route belongs to
  const matchedRoute = routeModules.find((route) => {
    if (route.prefix === "/") return location.pathname === "/";
    return location.pathname === route.prefix || location.pathname.startsWith(`${route.prefix}/`);
  });

  // Admin-only routes (like /users) are blocked for non-admins
  if (matchedRoute?.moduleKey === "_admin_only") {
    return <AccessDenied message="This section is restricted to administrators." />;
  }

  // Wait for permissions to load before making any access decision
  if (permsLoading) return <LoadingSpinner />;

  if (permsError || !myPerms) {
    return <AccessDenied message="Unable to load permissions. Please refresh the page or contact your administrator." />;
  }

  // Helper: check if user has access to a specific module
  const hasModuleAccess = (moduleKey: string) =>
    myPerms.some((p) => p.module_key === moduleKey && p.access_level !== "no_access");

  // Dashboard / root "/" — if user has NO dashboard access, redirect to first available module
  if (!matchedRoute || location.pathname === "/") {
    if (hasModuleAccess("dashboard")) return <>{children}</>;

    // Find first available module to redirect to
    const firstAvailable = fallbackModuleOrder.find((m) => hasModuleAccess(m.moduleKey));
    if (firstAvailable) return <Navigate to={firstAvailable.path} replace />;

    // User has no permissions at all
    return <AccessDenied message="You do not have permission to access any module. Contact your administrator." />;
  }

  // Check access for the specific module ONLY
  if (!hasModuleAccess(matchedRoute.moduleKey)) {
    return <AccessDenied message="You do not have permission to access this module." />;
  }

  return <>{children}</>;
}
