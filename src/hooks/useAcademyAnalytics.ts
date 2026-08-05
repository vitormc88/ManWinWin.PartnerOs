import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  cleanFilters,
  type AcademyAnalyticsFilters,
  type AcademyAnalyticsPerms,
  type AcademyOverview,
  type AttemptDetail,
  type LearnerProfile,
  type LearnerRow,
  type PartnerAnalyticsRow,
  type QuestionAnalyticsRow,
} from "@/lib/academy-analytics";

const STALE = 60_000;

const QK = {
  perms: ["academy", "analytics", "perms"],
  overview: (f: AcademyAnalyticsFilters) => ["academy", "analytics", "overview", cleanFilters(f)],
  partners: (f: AcademyAnalyticsFilters) => ["academy", "analytics", "partners", cleanFilters(f)],
  learners: (f: AcademyAnalyticsFilters) => ["academy", "analytics", "learners", cleanFilters(f)],
  user: (id?: string) => ["academy", "analytics", "user", id ?? "none"],
  attempt: (id?: string) => ["academy", "analytics", "attempt", id ?? "none"],
  questions: (moduleId?: string | null) => ["academy", "analytics", "questions", moduleId ?? "all"],
};

/** Which analytics capabilities the signed-in user has (server-decided). */
export function useAcademyAnalyticsPerms() {
  const { user } = useAuth();
  return useQuery({
    queryKey: QK.perms,
    enabled: !!user?.id,
    staleTime: STALE,
    queryFn: async (): Promise<AcademyAnalyticsPerms> => {
      const { data, error } = await supabase.rpc("academy_my_analytics_perms" as any);
      if (error) throw error;
      return data as unknown as AcademyAnalyticsPerms;
    },
  });
}

export function useAcademyOverview(filters: AcademyAnalyticsFilters, enabled: boolean) {
  return useQuery({
    queryKey: QK.overview(filters),
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<AcademyOverview> => {
      const { data, error } = await supabase.rpc("academy_analytics_overview" as any, {
        _filters: cleanFilters(filters),
      });
      if (error) throw error;
      return data as unknown as AcademyOverview;
    },
  });
}

export function useAcademyPartnerAnalytics(filters: AcademyAnalyticsFilters, enabled: boolean) {
  return useQuery({
    queryKey: QK.partners(filters),
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<PartnerAnalyticsRow[]> => {
      const { data, error } = await supabase.rpc("academy_analytics_partners" as any, {
        _filters: cleanFilters(filters),
      });
      if (error) throw error;
      return (data as unknown as PartnerAnalyticsRow[]) ?? [];
    },
  });
}

export function useAcademyLearners(filters: AcademyAnalyticsFilters, enabled: boolean) {
  return useQuery({
    queryKey: QK.learners(filters),
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<LearnerRow[]> => {
      const { data, error } = await supabase.rpc("academy_analytics_learners" as any, {
        _filters: cleanFilters(filters),
      });
      if (error) throw error;
      return (data as unknown as LearnerRow[]) ?? [];
    },
  });
}

export function useAcademyLearnerProfile(userId?: string) {
  return useQuery({
    queryKey: QK.user(userId),
    enabled: !!userId,
    staleTime: STALE,
    queryFn: async (): Promise<LearnerProfile> => {
      const { data, error } = await supabase.rpc("academy_analytics_user" as any, { _user_id: userId! });
      if (error) throw error;
      return data as unknown as LearnerProfile;
    },
  });
}

/** Attempt detail is access-logged server-side; only fetch when actually opened. */
export function useAcademyAttemptDetail(attemptId?: string, enabled = true) {
  return useQuery({
    queryKey: QK.attempt(attemptId),
    enabled: !!attemptId && enabled,
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<AttemptDetail> => {
      const { data, error } = await supabase.rpc("academy_analytics_attempt" as any, {
        _attempt_id: attemptId!,
      });
      if (error) throw error;
      return data as unknown as AttemptDetail;
    },
  });
}

export function useAcademyQuestionAnalytics(moduleId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: QK.questions(moduleId),
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<QuestionAnalyticsRow[]> => {
      const { data, error } = await supabase.rpc("academy_analytics_questions" as any, {
        _module_id: moduleId,
      });
      if (error) throw error;
      return (data as unknown as QuestionAnalyticsRow[]) ?? [];
    },
  });
}
