import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type {
  AcademyMission,
  AcademyModule,
  AcademyPhase,
  AcademyResource,
  MissionProgressRow,
  ModuleProgressStatus,
} from "@/lib/academy";

const QK = {
  phases: ["academy", "phases"] as const,
  modules: ["academy", "modules"] as const,
  missions: ["academy", "missions"] as const,
  resources: ["academy", "resources"] as const,
  moduleProgress: ["academy", "module-progress"] as const,
  missionProgress: ["academy", "mission-progress"] as const,
};

export function useAcademyPhases() {
  return useQuery({
    queryKey: QK.phases,
    queryFn: async (): Promise<AcademyPhase[]> => {
      const { data, error } = await supabase
        .from("academy_phases")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AcademyPhase[];
    },
  });
}

export function useAcademyModules() {
  return useQuery({
    queryKey: QK.modules,
    queryFn: async (): Promise<AcademyModule[]> => {
      const { data, error } = await supabase
        .from("academy_modules")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AcademyModule[];
    },
  });
}

export function useAcademyMissions(moduleId?: string) {
  return useQuery({
    queryKey: [...QK.missions, moduleId ?? "all"],
    queryFn: async (): Promise<AcademyMission[]> => {
      let query = supabase.from("academy_missions").select("*");
      if (moduleId) query = query.eq("module_id", moduleId);
      const { data, error } = await query.order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AcademyMission[];
    },
  });
}

export function useAcademyResources(moduleId?: string) {
  return useQuery({
    queryKey: [...QK.resources, moduleId ?? "all"],
    enabled: !!moduleId,
    queryFn: async (): Promise<AcademyResource[]> => {
      const { data, error } = await supabase
        .from("academy_resources")
        .select("*")
        .eq("module_id", moduleId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AcademyResource[];
    },
  });
}

/** Mission completions for the authenticated user only (RLS-scoped). */
export function useMyMissionProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...QK.missionProgress, user?.id ?? "anon"],
    enabled: !!user?.id,
    queryFn: async (): Promise<MissionProgressRow[]> => {
      const { data, error } = await supabase
        .from("academy_mission_progress")
        .select("mission_id, module_id, is_completed, checklist_state")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as MissionProgressRow[];
    },
  });
}

export function useMyModuleProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...QK.moduleProgress, user?.id ?? "anon"],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_module_progress")
        .select("module_id, status, progress_pct")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as Array<{
        module_id: string;
        status: ModuleProgressStatus;
        progress_pct: number;
      }>;
    },
  });
}

/** Explicit "Complete Mission" action — never triggered by scrolling. */
export function useCompleteMission() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      missionId: string;
      moduleId: string;
      completed: boolean;
      progressPct: number;
      moduleStatus: ModuleProgressStatus;
    }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error: mErr } = await supabase.from("academy_mission_progress").upsert(
        {
          user_id: user.id,
          mission_id: input.missionId,
          module_id: input.moduleId,
          is_completed: input.completed,
          completed_at: input.completed ? new Date().toISOString() : null,
        },
        { onConflict: "user_id,mission_id" }
      );
      if (mErr) throw mErr;

      const { error: modErr } = await supabase.from("academy_module_progress").upsert(
        {
          user_id: user.id,
          module_id: input.moduleId,
          status: input.moduleStatus,
          progress_pct: input.progressPct,
          started_at: new Date().toISOString(),
          completed_at: input.progressPct >= 100 ? new Date().toISOString() : null,
        },
        { onConflict: "user_id,module_id" }
      );
      if (modErr) throw modErr;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.missionProgress });
      qc.invalidateQueries({ queryKey: QK.moduleProgress });
      toast.success(vars.completed ? "Mission completed" : "Mission reopened");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update progress"),
  });
}

/** Persists an interactive checklist item toggle for the current user. */
export function useToggleChecklistItem() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      missionId: string;
      moduleId: string;
      checklistState: Record<string, boolean>;
    }) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { error } = await supabase.from("academy_mission_progress").upsert(
        {
          user_id: user.id,
          mission_id: input.missionId,
          module_id: input.moduleId,
          checklist_state: input.checklistState,
        },
        { onConflict: "user_id,mission_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.missionProgress });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save checklist"),
  });
}

// ── Admin content management ─────────────────────────────────────────────
type Table = "academy_phases" | "academy_modules" | "academy_missions" | "academy_resources";

export function useSaveAcademyRecord(table: Table) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (record: Record<string, any>) => {
      if (record.id) {
        const { id, ...rest } = record;
        const { error } = await (supabase.from(table) as any).update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from(table) as any).insert(record);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy"] });
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });
}

export function useDeleteAcademyRecord(table: Table) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy"] });
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not delete"),
  });
}
