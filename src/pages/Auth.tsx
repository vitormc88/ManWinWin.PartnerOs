import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getAppRedirectUrl } from "@/lib/app-url";
import { getAuthFlowState, getResetPasswordTarget } from "@/lib/auth-flow";
import { BrandMark } from "@/components/BrandMark";

type AuthView = "login" | "forgot";

export default function Auth() {
  const { session, isLoading, isAuthReady, isInviteOrRecoveryFlow } = useAuth();
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (isLoading || !isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <BrandMark className="h-12 w-12" />
      </div>
    );
  }

  const authFlow = getAuthFlowState();
  if (isInviteOrRecoveryFlow || authFlow.shouldForcePasswordSetup) {
    return <Navigate to={getResetPasswordTarget()} replace />;
  }

  if (session) return <Navigate to="/" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Signed in successfully");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAppRedirectUrl("/reset-password"),
      });
      if (error) throw error;
      toast.success("If an account exists with that email, you will receive a password reset link.");
    } catch (error: any) {
      // Generic message to not expose user existence
      toast.success("If an account exists with that email, you will receive a password reset link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <BrandMark className="h-14 w-14 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground">PartnerOS</h1>
          <p className="text-sm text-muted-foreground mt-1 leading-snug">
            Powering Partners.
            <br />
            Driving Growth.
          </p>
          <p className="text-sm text-muted-foreground mt-3">
            {view === "login" && "Sign in to your account"}
            {view === "forgot" && "Reset your password"}
          </p>
        </div>

        {view === "forgot" ? (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 w-full h-10 px-3 rounded-lg border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                placeholder="you@company.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
            <p className="text-center text-sm text-muted-foreground">
              <button onClick={() => setView("login")} className="text-primary hover:underline font-medium">
                Back to Sign In
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 w-full h-10 px-3 rounded-lg border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1 w-full h-10 px-3 rounded-lg border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                placeholder="••••••••"
              />
            </div>
            <div className="text-right">
              <button
                type="button"
                onClick={() => setView("forgot")}
                className="text-xs text-primary hover:underline font-medium"
              >
                Forgot Password?
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Loading..." : "Sign In"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
