import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getAuthFlowState } from "@/lib/auth-flow";

type DiagnosticReason =
  | "expired"
  | "already_used"
  | "invalid"
  | "no_token";

const REASON_COPY: Record<DiagnosticReason, { title: string; description: string }> = {
  expired: {
    title: "Invitation expired",
    description:
      "This invitation link has expired. Please ask your administrator to resend it from User Management.",
  },
  already_used: {
    title: "Account already activated",
    description:
      "This account has already been activated. You can sign in with your password, or use 'Forgot password' to reset it.",
  },
  invalid: {
    title: "Invalid invitation link",
    description:
      "We couldn't validate this invitation token. The link may have been opened in a different browser or device than where it was issued.",
  },
  no_token: {
    title: "Missing invitation token",
    description:
      "This page must be opened from the invitation email. If you got here by accident, please return to sign in.",
  },
};

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);
  const [isInvite, setIsInvite] = useState(false);
  const [checking, setChecking] = useState(true);
  const [reason, setReason] = useState<DiagnosticReason>("invalid");
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;

    const flow = getAuthFlowState();
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(window.location.search);
    const errorCode =
      hashParams.get("error_code") ||
      search.get("error_code") ||
      hashParams.get("error") ||
      search.get("error");
    const errorDesc =
      hashParams.get("error_description") || search.get("error_description") || "";
    const code = search.get("code") || hashParams.get("code");

    setIsInvite(flow.isInviteFlow);

    // Diagnose Supabase-returned errors first.
    if (errorCode) {
      const ec = errorCode.toLowerCase();
      const ed = errorDesc.toLowerCase();
      if (ec.includes("otp_expired") || ed.includes("expired")) setReason("expired");
      else if (ed.includes("already") || ed.includes("used")) setReason("already_used");
      else setReason("invalid");
      console.warn("[reset-password] Supabase auth error", { errorCode, errorDesc });
      setTokenValid(false);
      setChecking(false);
      return;
    }

    // Listen for auth state. Supabase-js with detectSessionInUrl=true will
    // parse the hash tokens, create a session, then strip the hash. This
    // listener catches that and accepts the session as proof of valid token.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "PASSWORD_RECOVERY" ||
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION" ||
        event === "TOKEN_REFRESHED"
      ) {
        // Only flip to valid if a session actually exists.
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) {
            console.log("[reset-password] valid session via onAuthStateChange", { event });
            setTokenValid(true);
            setChecking(false);
          }
        });
      }
    });

    const bootstrap = async () => {
      try {
        // 1. Already-established session (hash auto-consumed by supabase-js)?
        const { data: existing } = await supabase.auth.getSession();
        if (existing.session) {
          console.log("[reset-password] existing session found");
          setTokenValid(true);
          setChecking(false);
          return;
        }

        // 2. PKCE / code exchange flow.
        if (code) {
          console.log("[reset-password] exchanging code for session");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("[reset-password] exchangeCodeForSession failed", error);
            const msg = (error.message || "").toLowerCase();
            setReason(msg.includes("expired") ? "expired" : "invalid");
            setTokenValid(false);
            setChecking(false);
            return;
          }
          setTokenValid(true);
          setChecking(false);
          return;
        }

        // 3. Hash tokens flow — wait briefly for supabase-js to consume them.
        if (flow.shouldForcePasswordSetup) {
          // The onAuthStateChange listener above will flip tokenValid.
          // Add a fallback timeout in case nothing fires.
          setTimeout(async () => {
            const { data } = await supabase.auth.getSession();
            if (data.session) {
              setTokenValid(true);
            } else {
              console.warn("[reset-password] no session established after hash flow");
              setReason("invalid");
              setTokenValid(false);
            }
            setChecking(false);
          }, 1500);
          return;
        }

        // 4. No token of any kind.
        console.warn("[reset-password] no token in URL and no session");
        setReason("no_token");
        setTokenValid(false);
        setChecking(false);
      } catch (err) {
        console.error("[reset-password] bootstrap exception", err);
        setReason("invalid");
        setTokenValid(false);
        setChecking(false);
      }
    };

    void bootstrap();

    return () => {
      subscription.unsubscribe();
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
    const copy = REASON_COPY[reason];
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-5 text-center">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center mx-auto">
            <span className="text-primary-foreground font-bold text-lg">M</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
          <div className="space-y-2">
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/auth");
              }}
              className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Go to sign in
            </button>
            <button
              onClick={() => navigate("/auth?forgot=1")}
              className="w-full h-10 rounded-lg border bg-card text-sm font-medium hover:bg-muted transition-colors"
            >
              Request a new link
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            If the problem persists, ask your HQ administrator to resend your invitation from
            User Management.
          </p>
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
