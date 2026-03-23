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
  { prefix: "/", moduleKey: "dashboard" },
];

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading, isAdmin } = useAuth();
  const location = useLocation();
  const { data: myPerms, isLoading: permsLoading } = useMyPermissions();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;

  if (isAdmin) return <>{children}</>;

  const matchedRoute = routeModules.find((route) => location.pathname === route.prefix || location.pathname.startsWith(`${route.prefix}/`));
  if (!matchedRoute) return <>{children}</>;

  if (permsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasAccess = myPerms?.some((permission) => permission.module_key === matchedRoute.moduleKey && permission.access_level !== "no_access");
  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="rounded-xl border bg-card p-6 text-center max-w-md">
          <h2 className="text-lg font-semibold text-foreground">Access restricted</h2>
          <p className="mt-2 text-sm text-muted-foreground">You do not have permission to access this module.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
