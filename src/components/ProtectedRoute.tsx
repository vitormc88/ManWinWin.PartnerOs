import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyPermissions } from "@/hooks/useUsers";
import { getFirstAllowedModule, getRouteModule, hasModuleAccess } from "@/lib/module-access";
import { BrandMark } from "@/components/BrandMark";
import { getAuthFlowState, getResetPasswordTarget } from "@/lib/auth-flow";

const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <BrandMark className="h-12 w-12" />
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
  const { session, isLoading, isAuthReady, isInviteOrRecoveryFlow, isAdmin, profile } = useAuth();
  const location = useLocation();
  const {
    data: myPerms,
    isLoading: permsLoading,
    isError: permsError,
    isResolved: permsResolved,
  } = useMyPermissions();
  const isPartnerUser = profile?.is_hq === false;
  const authFlow = getAuthFlowState();

  if (isLoading || !isAuthReady) return <LoadingSpinner />;

  if ((isInviteOrRecoveryFlow || authFlow.shouldForcePasswordSetup) && location.pathname !== "/reset-password") {
    return <Navigate to={getResetPasswordTarget()} replace />;
  }

  if (!session) return <Navigate to="/auth" replace />;

  // Force invited users who haven't completed password setup back to /reset-password.
  if (profile?.invitation_status === "pending" && location.pathname !== "/reset-password") {
    return <Navigate to="/reset-password" replace />;
  }

  if (isAdmin) return <>{children}</>;

  if (permsLoading || !permsResolved) return <LoadingSpinner />;

  if (permsError || !myPerms) {
    return <AccessDenied message="Unable to load permissions. Please refresh the page or contact your administrator." />;
  }

  const firstAvailable = getFirstAllowedModule(myPerms, { isPartnerUser });

  if (location.pathname === "/") {
    if (hasModuleAccess(myPerms, "dashboard", { isPartnerUser })) return <>{children}</>;
    if (firstAvailable) return <Navigate to={firstAvailable.path} replace />;

    return <AccessDenied message="You do not have permission to access any module. Contact your administrator." />;
  }

  const matchedRoute = getRouteModule(location.pathname);

  if (!matchedRoute) {
    return <>{children}</>;
  }

  if (!hasModuleAccess(myPerms, matchedRoute.moduleKey, { isPartnerUser })) {
    if (firstAvailable && firstAvailable.path !== location.pathname) {
      return <Navigate to={firstAvailable.path} replace />;
    }

    return <AccessDenied message="You do not have permission to access this module." />;
  }

  return <>{children}</>;
}
