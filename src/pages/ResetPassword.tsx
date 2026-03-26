import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [isInvite, setIsInvite] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check hash fragment for token type
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.replace("#", ""));
    const hashType = hashParams.get("type");
    const accessToken = hashParams.get("access_token");

    // Check query params as fallback
    const searchParams = new URLSearchParams(window.location.search);
    const queryType = searchParams.get("type");

    const type = hashType || queryType;

    if (type === "invite" || type === "signup") {
      setIsInvite(true);
      setIsRecovery(true);
    }
    if (type === "recovery") {
      setIsRecovery(true);
    }

    // If we have an access_token in the hash, Supabase will auto-set the session
    if (accessToken) {
      setIsRecovery(true);
    }

    // Listen for auth state changes (Supabase auto-processes the token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setIsRecovery(true);
        setChecking(false);
      }
    });

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

      // Update invitation_status to active
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ invitation_status: "active" })
          .eq("id", user.id);
      }

      toast.success(
        isInvite
          ? "Password set successfully! Welcome to ManWinWin PartnerOS."
          : "Password updated successfully."
      );
      setTimeout(() => navigate("/dashboard"), 1500);
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

  if (!isRecovery) {
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
            onClick={() => navigate("/auth")}
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
        </form>
      </div>
    </div>
  );
}
