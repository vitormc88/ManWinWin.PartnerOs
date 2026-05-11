import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getAuthFlowState } from "@/lib/auth-flow";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);
  const [isInvite, setIsInvite] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const flow = getAuthFlowState();
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(window.location.search);
    const errorCode = hashParams.get("error_code") || search.get("error_code");
    const code = search.get("code") || hashParams.get("code");

    if (errorCode) {
      setTokenValid(false);
      setChecking(false);
      return;
    }

    setIsInvite(flow.isInviteFlow);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Supabase auto-establishes a recovery session from the URL hash. We
      // accept it as proof the token is valid, but we deliberately KEEP the
      // user on this page until they set a password. No redirect, no auto
      // login into the app.
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setTokenValid(true);
        setChecking(false);
      }
    });

    const bootstrapInviteSession = async () => {
      if (!flow.shouldForcePasswordSetup) {
        setChecking(false);
        return;
      }

      if (code) {
        const { data: existing } = await supabase.auth.getSession();
        if (!existing.session) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setTokenValid(false);
            setChecking(false);
            return;
          }
        }
      }

      setTokenValid(true);
      setChecking(false);
    };

    void bootstrapInviteSession();

    const timer = setTimeout(() => setChecking(false), 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({
            invitation_status: "active",
            invitation_accepted_at: new Date().toISOString(),
          })
          .eq("id", user.id);
      }

      toast.success(
        isInvite
          ? "Password set successfully! Welcome to ManWinWin PartnerOS."
          : "Password updated successfully."
      );
      // The user already has an authenticated session at this point — safe to enter the app.
      setTimeout(() => navigate("/dashboard", { replace: true }), 1200);
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-lg">M</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">Invalid or Expired Link</h1>
          <p className="text-sm text-muted-foreground">
            This invitation link is invalid or has expired. Please contact your administrator to request a new invitation.
          </p>
          <button
            onClick={async () => { await supabase.auth.signOut(); navigate("/auth"); }}
            className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-lg">M</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">
            {isInvite ? "Welcome to ManWinWin PartnerOS" : "Set New Password"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isInvite
              ? "Set your password to activate your account and access the partner platform"
              : "Enter your new password below"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">
              {isInvite ? "Password" : "New Password"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoFocus
              className="mt-1 w-full h-10 px-3 rounded-lg border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1 w-full h-10 px-3 rounded-lg border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Setting up..." : isInvite ? "Set Password & Access Platform" : "Update Password"}
          </button>
          <p className="text-[11px] text-muted-foreground text-center">
            You must set a password before accessing the platform.
          </p>
        </form>
      </div>
    </div>
  );
}
