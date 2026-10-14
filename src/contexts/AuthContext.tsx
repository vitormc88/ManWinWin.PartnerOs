import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthFlowState, initialAuthFlow, clearInitialAuthFlow } from "@/lib/auth-flow";
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
  const [isInviteOrRecoveryFlow, setIsInviteOrRecoveryFlow] = useState(initialAuthFlow.shouldForcePasswordSetup);
  const passwordSetupFlow = useRef(initialAuthFlow.shouldForcePasswordSetup);
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
      passwordSetupFlow.current ||= flow.shouldForcePasswordSetup;
      setIsInviteOrRecoveryFlow(passwordSetupFlow.current);
      return flow;
    };

    syncAuthFlow();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_OUT") {
          clearInitialAuthFlow();
          passwordSetupFlow.current = false;
          setIsInviteOrRecoveryFlow(false);
        } else {
          if (event === "PASSWORD_RECOVERY") passwordSetupFlow.current = true;
          syncAuthFlow();
        }
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

            // Activation is stamped only after successful password setup.
            // A SIGNED_IN event from opening an invite is not proof of completion.

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
    // Reset scoped state first so nothing from this identity can be rendered
    // (or refetched) while the sign-out request is in flight.
    clearInitialAuthFlow();
    passwordSetupFlow.current = false;
    setIsInviteOrRecoveryFlow(false);
    setProfile(null);
    setRoles([]);
    setSession(null);
    setUser(null);
    setQueryScope(null, queryClient);
    await supabase.auth.signOut();
  };


  return (
    <AuthContext.Provider value={{ session, user, profile, roles, isLoading, isAuthReady, isInviteOrRecoveryFlow, isHQ, isAdmin, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
