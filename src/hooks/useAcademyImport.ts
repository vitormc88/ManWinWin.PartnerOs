import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { academyErrorMessage } from "@/hooks/useAcademy";
import type { DuplicateMode, QuestionImportRecord } from "@/lib/academy-import";

export interface ImportOutcome {
  inserted: number;
  updated: number;
  skipped: number;
}

/**
 * Transactional bulk import. The RPC is Academy-admin only and performs every
 * row inside a single database transaction — one failure rolls everything back.
 */
export function useImportAcademyQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      moduleId: string;
      records: QuestionImportRecord[];
      mode: Exclude<DuplicateMode, "cancel">;
    }): Promise<ImportOutcome> => {
      const rows = args.records.map((r) => ({
        question_code: r.question_code,
        question_text: r.question_text,
        scenario_text: r.scenario_text,
        scenario_group: r.scenario_group,
        category: r.category,
        question_type: r.question_type,
        difficulty: r.difficulty,
        weight: r.weight,
        status: r.status,
        is_mandatory: r.is_mandatory,
        explanation: r.explanation,
        options_json: r.options_json,
        correct_answer_json: r.correct_answer_json,
        tags_json: r.tags_json,
        mission_id: r.mission_id,
      }));
      const { data, error } = await supabase.rpc("academy_import_records", {
        _entity: "questions",
        _module_id: args.moduleId,
        _rows: rows as never,
        _mode: args.mode,
      });
      if (error) throw error;
      return data as unknown as ImportOutcome;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy", "questions"] });
    },
    onError: (e) => toast.error(academyErrorMessage(e, "Could not import the questions")),
  });
}
