import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { academyErrorMessage } from "@/hooks/useAcademy";
import type { Database } from "@/integrations/supabase/types";
import type {
  CertAttemptState,
  CertEligibility,
  CertResult,
} from "@/lib/academy-certification";

const QK = {
  eligibility: (moduleId?: string) => ["academy", "cert", "eligibility", moduleId ?? "none"],
  attempt: (attemptId?: string) => ["academy", "cert", "attempt", attemptId ?? "none"],
  result: (attemptId?: string) => ["academy", "cert", "result", attemptId ?? "none"],
};

/** Server-authoritative eligibility for the module certification. */
export function useCertEligibility(moduleId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: QK.eligibility(moduleId),
    enabled: !!moduleId && !!user?.id,
    queryFn: async (): Promise<CertEligibility> => {
      const { data, error } = await supabase.rpc("academy_cert_eligibility", {
        _module_id: moduleId!,
      });
      if (error) throw error;
      return data as unknown as CertEligibility;
    },
  });
}

export function useStartCertification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (moduleId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("academy_cert_start", { _module_id: moduleId });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academy", "cert"] }),
    onError: (e) => toast.error(academyErrorMessage(e, "Could not start the certification")),
  });
}

/**
 * Active attempt as the server sees it — including remaining time, so a browser
 * refresh can never extend the exam.
 */
export function useAttemptState(attemptId?: string) {
  return useQuery({
    queryKey: QK.attempt(attemptId),
    enabled: !!attemptId,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<CertAttemptState> => {
      const { data, error } = await supabase.rpc("academy_cert_state", { _attempt_id: attemptId! });
      if (error) throw error;
      return data as unknown as CertAttemptState;
    },
  });
}

export function useAnswerQuestion(attemptId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { questionId: string; answer: unknown }) => {
      const { error } = await supabase.rpc("academy_cert_answer", {
        _attempt_id: attemptId!,
        _question_id: input.questionId,
        _answer: input.answer as never,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.attempt(attemptId) }),
    onError: (e) => toast.error(academyErrorMessage(e, "Could not save your answer")),
  });
}

export function useSubmitAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attemptId: string) => {
      const { data, error } = await supabase.rpc("academy_cert_submit", { _attempt_id: attemptId });
      if (error) throw error;
      return data as unknown as { passed: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academy"] }),
    onError: (e) => toast.error(academyErrorMessage(e, "Could not submit the certification")),
  });
}

export function useAttemptResult(attemptId?: string) {
  return useQuery({
    queryKey: QK.result(attemptId),
    enabled: !!attemptId,
    queryFn: async (): Promise<CertResult> => {
      const { data, error } = await supabase.rpc("academy_cert_result", {
        _attempt_id: attemptId!,
      });
      if (error) throw error;
      return data as unknown as CertResult;
    },
  });
}

// ── Admin question bank ──────────────────────────────────────────────────
// Reads/writes are protected by Academy-admin RLS on `academy_questions`;
// learners never touch this table (they only see sanitized RPC output).
const QK_QUESTIONS = ["academy", "cert", "questions"] as const;

export type AcademyQuestionRow =
  Database["public"]["Tables"]["academy_questions"]["Row"];

export function useAcademyQuestions(moduleId?: string) {
  return useQuery({
    queryKey: [...QK_QUESTIONS, moduleId ?? "all"],
    enabled: !!moduleId,
    queryFn: async (): Promise<AcademyQuestionRow[]> => {
      const { data, error } = await supabase
        .from("academy_questions")
        .select("*")
        .eq("module_id", moduleId!)
        .order("question_code", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveAcademyQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      record: Partial<Database["public"]["Tables"]["academy_questions"]["Insert"]> & {
        id?: string;
      }
    ) => {
      const { id, ...rest } = record;
      if (id) {
        const { error } = await supabase
          .from("academy_questions")
          .update(rest as never)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("academy_questions").insert(rest as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_QUESTIONS });
      toast.success("Question saved");
    },
    onError: (e) => toast.error(academyErrorMessage(e, "Could not save the question")),
  });
}

export function useDeleteAcademyQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("academy_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_QUESTIONS });
      toast.success("Question deleted");
    },
    onError: (e) => toast.error(academyErrorMessage(e, "Could not delete the question")),
  });
}
