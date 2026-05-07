import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logSystemActivity } from "@/lib/activity-log";

export const TASK_STATUSES = ["To Do", "In Progress", "Done"] as const;
export const TASK_PRIORITIES = ["Low", "Medium", "High"] as const;
export { TASK_CATEGORIES } from "@/lib/followup-defaults";

export type DealTask = {
  id: string;
  deal_id: string;
  title: string;
  description: string | null;
  assigned_user_id: string | null;
  assigned_to: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  category: string | null;
  is_completed: boolean | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  assigned_user?: { full_name: string | null; email: string | null } | null;
};

export function useDealTasksEnhanced(dealId: string | undefined) {
  return useQuery({
    queryKey: ["deal-tasks-enhanced", dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deal_tasks")
        .select("*")
        .eq("deal_id", dealId!)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const userIds = [...new Set((data || []).map(t => (t as any).assigned_user_id).filter(Boolean))] as string[];
      let userMap = new Map<string, { full_name: string | null; email: string | null }>();
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        users?.forEach(u => userMap.set(u.id, { full_name: u.full_name, email: u.email }));
      }

      return (data || []).map(t => ({
        ...t,
        status: (t as any).status || (t.is_completed ? "Done" : "To Do"),
        priority: (t as any).priority || "Medium",
        assigned_user_id: (t as any).assigned_user_id || null,
        assigned_user: (t as any).assigned_user_id ? userMap.get((t as any).assigned_user_id) || null : null,
      })) as DealTask[];
    },
  });
}

export function useCreateDealTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: {
      deal_id: string;
      title: string;
      description?: string;
      assigned_user_id?: string | null;
      due_date?: string | null;
      status?: string;
      priority?: string;
      category?: string | null;
      created_by?: string;
      assigned_user_name?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("deal_tasks")
        .insert({
          deal_id: task.deal_id,
          title: task.title,
          description: task.description || null,
          assigned_user_id: task.assigned_user_id || null,
          due_date: task.due_date || null,
          status: task.status || "To Do",
          priority: task.priority || "Medium",
          category: task.category || null,
          created_by: task.created_by || null,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      // Auto-log system activity (best-effort)
      const who = task.assigned_user_name || "Unassigned";
      logSystemActivity(
        task.deal_id,
        "Task created",
        `Task "${task.title}" was created and assigned to ${who}.`
      );
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["deal-tasks-enhanced", data.deal_id] });
      qc.invalidateQueries({ queryKey: ["deal_tasks", data.deal_id] });
      qc.invalidateQueries({ queryKey: ["deal_activities", data.deal_id] });
      qc.invalidateQueries({ queryKey: ["deal-health-signals", data.deal_id] });
      qc.invalidateQueries({ queryKey: ["deals-health"] });
    },
  });
}

export function useUpdateDealTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, deal_id, _completedByName, _taskTitle, ...updates }: {
      id: string;
      deal_id: string;
      status?: string;
      priority?: string;
      title?: string;
      description?: string;
      category?: string | null;
      assigned_user_id?: string | null;
      due_date?: string | null;
      completed_at?: string | null;
      is_completed?: boolean;
      _completedByName?: string | null;
      _taskTitle?: string | null;
    }) => {
      // Fetch previous state to detect a genuine not-done -> done transition.
      // This guards against duplicate "Task completed" entries from re-saves,
      // edit dialog saves on already-completed tasks, double-clicks, etc.
      let prevStatus: string | null = null;
      let prevCompleted: boolean | null = null;
      if (updates.status !== undefined) {
        const { data: prev } = await supabase
          .from("deal_tasks")
          .select("status, is_completed")
          .eq("id", id)
          .maybeSingle();
        prevStatus = (prev as any)?.status ?? null;
        prevCompleted = (prev as any)?.is_completed ?? null;
      }
      const wasAlreadyDone =
        prevStatus === "Done" || prevCompleted === true;
      const isTransitionToDone = updates.status === "Done" && !wasAlreadyDone;

      const { data, error } = await supabase
        .from("deal_tasks")
        .update({
          ...updates,
          is_completed: updates.status === "Done" ? true : updates.status ? false : updates.is_completed,
        } as any)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      if (isTransitionToDone) {
        const title = _taskTitle || (data as any)?.title || "Task";
        const who = _completedByName || "a user";
        logSystemActivity(
          deal_id,
          "Task completed",
          `Task "${title}" was completed by ${who}.`
        );
      }
      return { ...data, deal_id };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["deal-tasks-enhanced", data.deal_id] });
      qc.invalidateQueries({ queryKey: ["deal_tasks", data.deal_id] });
      qc.invalidateQueries({ queryKey: ["deal_activities", data.deal_id] });
      qc.invalidateQueries({ queryKey: ["deal-health-signals", data.deal_id] });
      qc.invalidateQueries({ queryKey: ["deals-health"] });
    },
  });
}

export function useDeleteDealTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dealId }: { id: string; dealId: string }) => {
      const { error } = await supabase.from("deal_tasks").delete().eq("id", id);
      if (error) throw error;
      return dealId;
    },
    onSuccess: (dealId) => {
      qc.invalidateQueries({ queryKey: ["deal-tasks-enhanced", dealId] });
      qc.invalidateQueries({ queryKey: ["deal_tasks", dealId] });
      qc.invalidateQueries({ queryKey: ["deal-health-signals", dealId] });
      qc.invalidateQueries({ queryKey: ["deals-health"] });
    },
  });
}
