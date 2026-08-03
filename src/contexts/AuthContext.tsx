import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthFlowState } from "@/lib/auth-flow";
import { setQueryScope } from "@/lib/query-scope";


interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  partner_id: string | null;
  is_hq: boolean;
  is_active: boolean;
  avatar_url: string | null;
  invitation_status?: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: string[];
  isLoading: boolean;
  isAuthReady: boolean;
  isInviteOrRecoveryFlow: boolean;
  isHQ: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  roles: [],
  isLoading: true,
  isAuthReady: false,
  isInviteOrRecoveryFlow: false,
  isHQ: false,
  isAdmin: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isInviteOrRecoveryFlow, setIsInviteOrRecoveryFlow] = useState(false);
  const queryClient = useQueryClient();

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) setProfile(data as Profile);
  };

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (data) setRoles(data.map((r: any) => r.role));
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await Promise.all([fetchProfile(user.id), fetchRoles(user.id)]);
    }
  };

  useEffect(() => {
    const syncAuthFlow = () => {
      const flow = getAuthFlowState();
      setIsInviteOrRecoveryFlow(flow.shouldForcePasswordSetup);
      return flow;
    };

    syncAuthFlow();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const flow = syncAuthFlow();
        // Synchronously discard every cache entry + derived state belonging to
        // the previous identity BEFORE the next protected render happens.
        const scopeChanged = setQueryScope(session?.user?.id ?? null, queryClient);
        if (scopeChanged) {
          setProfile(null);
          setRoles([]);
          if (session?.user) {
            setIsLoading(true);
            setIsAuthReady(false);
          }
        }
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(async () => {
            await Promise.all([
              fetchProfile(session.user.id),
              fetchRoles(session.user.id),
            ]);

            // Safety net: if a user signs in with an active session (not in
            // the middle of a password recovery / invite flow) but their
            // profile is still marked "pending", flip it to "active". This
            // covers the manual-creation bug where the profile timestamp
            // wasn't stamped at create time.
            if (event === "SIGNED_IN" && !flow.shouldForcePasswordSetup && !window.location.pathname.startsWith("/reset-password")) {
              const { data: p } = await supabase
                .from("profiles")
                .select("invitation_status")
                .eq("id", session.user.id)
                .single();
              if (p && p.invitation_status === "pending") {
                await supabase
                  .from("profiles")
                  .update({
                    invitation_status: "active",
                    invitation_accepted_at: new Date().toISOString(),
                  })
                  .eq("id", session.user.id);
                await fetchProfile(session.user.id);
              }
            }

            setIsLoading(false);
            setIsAuthReady(true);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setIsLoading(false);
          setIsAuthReady(true);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      syncAuthFlow();
      setQueryScope(session?.user?.id ?? null, queryClient);
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        Promise.all([
          fetchProfile(session.user.id),
          fetchRoles(session.user.id),
        ]).then(() => {
          setIsLoading(false);
          setIsAuthReady(true);
        });
      } else {
        setIsLoading(false);
        setIsAuthReady(true);
      }
    });


    const handleUrlChange = () => {
      syncAuthFlow();
    };

    window.addEventListener("hashchange", handleUrlChange);
    window.addEventListener("popstate", handleUrlChange);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("hashchange", handleUrlChange);
      window.removeEventListener("popstate", handleUrlChange);
    };
  }, []);

  const isHQ = profile?.is_hq === true && roles.some(r => ["hq_admin", "hq_standard"].includes(r));
  const isAdmin = roles.includes("hq_admin") && profile?.is_hq === true;

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    // Clear all permission caches on logout so next login starts fresh
    queryClient.removeQueries({ queryKey: ["my-permissions"] });
    queryClient.removeQueries({ queryKey: ["user-permissions"] });
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, roles, isLoading, isAuthReady, isInviteOrRecoveryFlow, isHQ, isAdmin, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
