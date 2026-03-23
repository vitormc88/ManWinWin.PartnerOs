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
  { prefix: "/analytics", moduleKey: "_admin_only" },
  { prefix: "/partners", moduleKey: "_admin_only" },
  { prefix: "/notifications", moduleKey: "_admin_only" },
  { prefix: "/tiers", moduleKey: "_admin_only" },
  { prefix: "/performance", moduleKey: "_admin_only" },
  { prefix: "/users", moduleKey: "_admin_only" },
];

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
  const {
    data: myPerms,
    isLoading: permsLoading,
    isError: permsError,
    isResolved: permsResolved,
  } = useMyPermissions();

  if (isLoading) return <LoadingSpinner />;
  if (!session) return <Navigate to="/auth" replace />;
  if (isAdmin) return <>{children}</>;

  const matchedRoute = routeModules.find((route) =>
    location.pathname === route.prefix || location.pathname.startsWith(`${route.prefix}/`)
  );

  if (matchedRoute?.moduleKey === "_admin_only") {
    return <AccessDenied message="This section is restricted to administrators." />;
  }

  if (permsLoading || !permsResolved) return <LoadingSpinner />;

  if (permsError || !myPerms) {
    return <AccessDenied message="Unable to load permissions. Please refresh the page or contact your administrator." />;
  }

  const hasModuleAccess = (moduleKey: string) =>
    myPerms.some((p) => p.module_key === moduleKey && p.access_level !== "no_access");

  const firstAvailable = fallbackModuleOrder.find((module) => hasModuleAccess(module.moduleKey));

  if (location.pathname === "/") {
    if (hasModuleAccess("dashboard")) return <>{children}</>;
    if (firstAvailable) return <Navigate to={firstAvailable.path} replace />;

    return <AccessDenied message="You do not have permission to access any module. Contact your administrator." />;
  }

  if (!matchedRoute) {
    return <>{children}</>;
  }

  if (!hasModuleAccess(matchedRoute.moduleKey)) {
    if (firstAvailable && firstAvailable.path !== location.pathname) {
      return <Navigate to={firstAvailable.path} replace />;
    }

    return <AccessDenied message="You do not have permission to access this module." />;
  }

  return <>{children}</>;
}
