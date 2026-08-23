import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";
import {
  ACADEMY_STORAGE_BUCKET,
  academyObjectPath,
  isDeletableAcademyObjectPath,
  validateAcademyUpload,
  type AcademyMission,
  type AcademyModule,
  type AcademyPhase,
  type AcademyResource,
  type AcademyTable,
  type ChecklistState,
  type MissionProgressRow,
  type ModuleProgressStatus,
} from "@/lib/academy";

const QK = {
  phases: ["academy", "phases"] as const,
  modules: ["academy", "modules"] as const,
  missions: ["academy", "missions"] as const,
  resources: ["academy", "resources"] as const,
  moduleProgress: ["academy", "module-progress"] as const,
  missionProgress: ["academy", "mission-progress"] as const,
};

/** Turns a Postgres/PostgREST error into an actionable message. */
export function academyErrorMessage(error: unknown, fallback: string): string {
  const e = error as { message?: string; code?: string; details?: string } | null;
  const raw = e?.message ?? "";
  if (!raw) return fallback;
  if (e?.code === "42501" || /row-level security|permission denied/i.test(raw)) {
    return "You do not have permission to perform this Academy action.";
  }
  if (e?.code === "23505" || /duplicate key/i.test(raw)) {
    return "That slug is already used by another Academy record.";
  }
  if (e?.code === "23503") {
    return "The selected parent record no longer exists. Refresh and try again.";
  }
  return raw;
}

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

/** Every resource (admin view). */
export function useAllAcademyResources() {
  return useQuery({
    queryKey: [...QK.resources, "all-admin"],
    queryFn: async (): Promise<AcademyResource[]> => {
      const { data, error } = await supabase
        .from("academy_resources")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AcademyResource[];
    },
  });
}

/** Mission completions for the authenticated user only (RLS-scoped, read-only). */
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

/**
 * Explicit "Complete Mission" action.
 *
 * Progress is written by a single transactional RPC: the server validates the
 * mission is published and unlocked, writes mission progress and recomputes
 * module progress from authoritative rows. The browser cannot forge
 * `progress_pct` or a certified status.
 */
export function useCompleteMission() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { missionId: string; completed: boolean }) => {
      const { data, error } = await supabase.rpc("academy_complete_mission", {
        _mission_id: input.missionId,
        _completed: input.completed,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.missionProgress });
      qc.invalidateQueries({ queryKey: QK.moduleProgress });
      toast.success(vars.completed ? "Mission completed" : "Mission reopened");
    },
    onError: (e) => toast.error(academyErrorMessage(e, "Could not update progress")),
  });
}

/** Persists an interactive checklist toggle through the validated RPC. */
export function useToggleChecklistItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { missionId: string; checklistState: ChecklistState }) => {
      const { error } = await supabase.rpc("academy_set_checklist_state", {
        _mission_id: input.missionId,
        // checklist_state is jsonb: markdown item booleans plus namespaced objects.
        _state: input.checklistState as Database["public"]["Tables"]["academy_mission_progress"]["Row"]["checklist_state"],
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.missionProgress }),
    onError: (e) => toast.error(academyErrorMessage(e, "Could not save checklist")),
  });
}

// ── Admin content management ─────────────────────────────────────────────
type Tables = Database["public"]["Tables"];
export type AcademyRecordInput = ({
  id?: string;
  /** Server revision the editor branched from (optimistic concurrency). */
  _expectedUpdatedAt?: string | null;
} & Partial<
  | Tables["academy_phases"]["Insert"]
  | Tables["academy_modules"]["Insert"]
  | Tables["academy_missions"]["Insert"]
  | Tables["academy_resources"]["Insert"]
>);

export const ACADEMY_CONFLICT_MESSAGE =
  "This record changed on the server after you opened it. Your changes were not saved — refresh and reapply them.";

export function isAcademyConflict(error: unknown): boolean {
  return /ACADEMY_CONFLICT/i.test((error as { message?: string } | null)?.message ?? "");
}

/**
 * Inserts go through PostgREST; updates go through an admin-only
 * compare-and-update RPC so a concurrent edit can never be silently overwritten.
 */
export function useSaveAcademyRecord(table: AcademyTable) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (record: AcademyRecordInput) => {
      const { id, _expectedUpdatedAt, ...rest } = record as {
        id?: string;
        _expectedUpdatedAt?: string | null;
      } & Record<string, unknown>;
      if (id) {
        const { error } = await supabase.rpc("academy_update_record", {
          _entity: table,
          _id: id,
          _patch: rest as never,
          _expected_updated_at: _expectedUpdatedAt ?? null,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(rest as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy"] });
      toast.success("Saved");
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ["academy"] });
      toast.error(
        isAcademyConflict(e) ? ACADEMY_CONFLICT_MESSAGE : academyErrorMessage(e, "Could not save")
      );
    },
  });
}

export function useDeleteAcademyRecord(table: AcademyTable) {
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
    onError: (e) => toast.error(academyErrorMessage(e, "Could not delete")),
  });
}

/** Single transactional, admin-only reorder (replaces two racing updates). */
export function useReorderAcademyRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entity: "phases" | "modules" | "missions" | "resources";
      a: string;
      b: string;
    }) => {
      const { error } = await supabase.rpc("academy_swap_sort_order", {
        _entity: input.entity,
        _a: input.a,
        _b: input.b,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academy"] }),
    onError: (e) => toast.error(academyErrorMessage(e, "Could not reorder")),
  });
}

/**
 * Uploads an Academy attachment into the private training-assets bucket and
 * returns the object path. Raw private paths are never exposed as public URLs;
 * readers resolve them through short-lived signed URLs.
 */
export function useUploadAcademyAsset() {
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const invalid = validateAcademyUpload({ name: file.name, size: file.size, type: file.type });
      if (invalid) throw new Error(invalid);
      const path = academyObjectPath(file.name);
      const { error } = await supabase.storage
        .from(ACADEMY_STORAGE_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) throw error;
      return path;
    },
    onError: (e) => toast.error(academyErrorMessage(e, "Upload failed")),
  });
}

/**
 * Deletes a replaced/removed Academy attachment *after* the record save
 * succeeded, and only when it is provably safe:
 *   - the value is a private object path under the `academy/` prefix
 *     (external URLs and non-Academy paths are never touched), and
 *   - no other Academy resource still references the same path.
 * Otherwise the object is left in place and the caller is told why.
 */
export function useDeleteAcademyAsset() {
  return useMutation({
    mutationFn: async (input: { path: string; exceptResourceId?: string }) => {
      const { path, exceptResourceId } = input;
      if (!isDeletableAcademyObjectPath(path)) {
        throw new Error(
          "This attachment is not a private Academy file, so it was left untouched."
        );
      }
      let query = supabase
        .from("academy_resources")
        .select("id", { count: "exact", head: true })
        .eq("file_path", path);
      if (exceptResourceId) query = query.neq("id", exceptResourceId);
      const { count, error: refError } = await query;
      if (refError) {
        throw new Error(
          "Could not verify whether the file is still used elsewhere, so it was kept."
        );
      }
      if ((count ?? 0) > 0) {
        throw new Error("The file is still attached to another Academy resource, so it was kept.");
      }
      const { error } = await supabase.storage.from(ACADEMY_STORAGE_BUCKET).remove([path]);
      if (error) throw error;
    },
    onError: (e) => toast.error(academyErrorMessage(e, "Could not delete the file")),
  });
}
