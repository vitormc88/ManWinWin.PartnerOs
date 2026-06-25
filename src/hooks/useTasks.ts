import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type TaskSource =
  | "manual"
  | "lead"
  | "pipeline"
  | "partner"
  | "renewal"
  | "customer"
  | "certification";

export type TaskType =
  | "call"
  | "email"
  | "meeting"
  | "proposal"
  | "renewal"
  | "review"
  | "customer"
  | "escalation"
  | "manual";

export type TaskPriority = "Critical" | "High" | "Medium" | "Low";
export type TaskStatus = "open" | "in_progress" | "done" | "snoozed";

export type UnifiedTask = {
  id: string;
  source: TaskSource;
  source_id: string;
  task_type: TaskType;
  title: string;
  description: string | null;
  company_name: string | null;
  related_entity_id: string | null;
  related_route: string | null;
  due_date: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  status: TaskStatus;
  revenue_impact: number;
  is_auto: boolean;
  created_at: string;
  completed_at: string | null;
  priority: TaskPriority;
  priority_score: number;
};

export type TaskView =
  | "my"
  | "today"
  | "week"
  | "overdue"
  | "completed"
  | "team";

export type TaskFilters = {
  view: TaskView;
  source?: TaskSource | "all";
  priority?: TaskPriority | "all";
  search?: string;
  ownerId?: string | "all";
};

export function useTasks(filters: TaskFilters) {
  const { user, profile, roles } = useAuth();
  const isManager = roles.includes("hq_admin") || profile?.is_hq === true;

  return useQuery({
    queryKey: ["unified_tasks", filters, user?.id],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase.from("unified_tasks" as any).select("*").limit(500);

      // view
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
      const endOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7).toISOString();

      if (filters.view === "my") {
        q = q.eq("owner_user_id", user?.id ?? "").neq("status", "done");
      } else if (filters.view === "today") {
        q = q.gte("due_date", startOfToday).lt("due_date", endOfToday).neq("status", "done");
        if (!isManager) q = q.eq("owner_user_id", user?.id ?? "");
      } else if (filters.view === "week") {
        q = q.gte("due_date", startOfToday).lt("due_date", endOfWeek).neq("status", "done");
        if (!isManager) q = q.eq("owner_user_id", user?.id ?? "");
      } else if (filters.view === "overdue") {
        q = q.lt("due_date", startOfToday).neq("status", "done");
        if (!isManager) q = q.eq("owner_user_id", user?.id ?? "");
      } else if (filters.view === "completed") {
        q = q.eq("status", "done");
        if (!isManager) q = q.eq("owner_user_id", user?.id ?? "");
      } else if (filters.view === "team") {
        if (!isManager) q = q.eq("owner_user_id", user?.id ?? "");
        q = q.neq("status", "done");
      }

      if (filters.source && filters.source !== "all") q = q.eq("source", filters.source);
      if (filters.priority && filters.priority !== "all") q = q.eq("priority", filters.priority);
      if (filters.ownerId && filters.ownerId !== "all") q = q.eq("owner_user_id", filters.ownerId);
      if (filters.search) q = q.ilike("title", `%${filters.search}%`);

      const { data, error } = await q.order("priority_score", { ascending: false }).order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as unknown as UnifiedTask[];
    },
    enabled: !!user,
  });
}

export function useTodaysFocus() {
  const { user, profile, roles } = useAuth();
  const isManager = roles.includes("hq_admin") || profile?.is_hq === true;
  return useQuery({
    queryKey: ["unified_tasks_focus", user?.id],
    staleTime: 60_000,
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("unified_tasks" as any).select("priority,due_date,revenue_impact,status,task_type,owner_user_id").neq("status", "done").limit(2000);
      if (!isManager) q = q.eq("owner_user_id", user?.id ?? "");
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as any[];
      const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate() + 1);

      const dueToday = rows.filter(r => r.due_date && new Date(r.due_date) >= startOfToday && new Date(r.due_date) < endOfToday);
      const critical = rows.filter(r => r.priority === "Critical").length;
      const revenue = rows.reduce((s, r) => s + (Number(r.revenue_impact) || 0), 0);
      const estMin = rows.reduce((s, r) => s + estimateMinutes(r.task_type), 0);
      return {
        total: rows.length,
        critical,
        dueToday: dueToday.length,
        revenue,
        estMinutes: estMin,
      };
    },
  });
}

function estimateMinutes(t: string) {
  switch (t) {
    case "call": return 15;
    case "email": return 8;
    case "meeting": return 45;
    case "proposal": return 60;
    case "renewal": return 20;
    case "review": return 20;
    case "escalation": return 25;
    default: return 15;
  }
}

export function useWorkload(userId?: string) {
  const { user } = useAuth();
  const targetId = userId || user?.id;
  return useQuery({
    queryKey: ["unified_tasks_workload", targetId],
    enabled: !!targetId,
    staleTime: 60_000,
    queryFn: async () => {
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: completed } = await supabase
        .from("unified_tasks" as any)
        .select("completed_at,created_at,due_date,status")
        .eq("owner_user_id", targetId!)
        .eq("status", "done")
        .gte("completed_at", weekAgo.toISOString())
        .limit(500);
      const { data: open } = await supabase
        .from("unified_tasks" as any)
        .select("due_date,status")
        .eq("owner_user_id", targetId!)
        .neq("status", "done")
        .limit(500);

      const completedRows = (completed || []) as any[];
      const openRows = (open || []) as any[];
      const now = new Date();
      const overdue = openRows.filter(r => r.due_date && new Date(r.due_date) < now).length;

      const avgMs =
        completedRows.length === 0
          ? 0
          : completedRows.reduce((s, r) => {
              if (!r.completed_at || !r.created_at) return s;
              return s + (new Date(r.completed_at).getTime() - new Date(r.created_at).getTime());
            }, 0) / completedRows.length;

      return {
        completedThisWeek: completedRows.length,
        avgCompletionHours: avgMs / (1000 * 60 * 60),
        openCount: openRows.length,
        overdueCount: overdue,
      };
    },
  });
}

export function useTeamWorkload() {
  const { profile, roles } = useAuth();
  const isManager = roles.includes("hq_admin") || profile?.is_hq === true;
  return useQuery({
    queryKey: ["unified_tasks_team"],
    enabled: isManager,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unified_tasks" as any)
        .select("owner_user_id,owner_name,due_date,status,priority")
        .limit(5000);
      if (error) throw error;
      const rows = (data || []) as any[];
      const now = new Date();
      const map = new Map<string, { id: string; name: string; open: number; overdue: number; completed: number; critical: number }>();
      for (const r of rows) {
        if (!r.owner_user_id) continue;
        const entry = map.get(r.owner_user_id) || {
          id: r.owner_user_id, name: r.owner_name || "Unassigned",
          open: 0, overdue: 0, completed: 0, critical: 0,
        };
        if (r.status === "done") entry.completed++;
        else {
          entry.open++;
          if (r.due_date && new Date(r.due_date) < now) entry.overdue++;
          if (r.priority === "Critical") entry.critical++;
        }
        map.set(r.owner_user_id, entry);
      }
      return Array.from(map.values()).sort((a, b) => b.open - a.open);
    },
  });
}

/* ----- Mutations dispatched to underlying tables ----- */

type ActionTarget = { source: TaskSource; source_id: string; raw_id: string };

function parseRawId(taskId: string) {
  // task ids are "<prefix>:<uuid>" or "partner_action:<noteId>:<actionId>"
  return taskId.split(":").slice(1).join(":");
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: UnifiedTask) => {
      const now = new Date().toISOString();
      if (task.source === "manual") {
        await supabase.from("manual_tasks").update({ status: "Done", completed_at: now }).eq("id", parseRawId(task.id));
      } else if (task.id.startsWith("lead:")) {
        await supabase.from("lead_tasks").update({ status: "Done", completed_at: now }).eq("id", parseRawId(task.id));
      } else if (task.id.startsWith("pipeline:")) {
        await supabase.from("deal_tasks").update({ status: "Done", is_completed: true, completed_at: now }).eq("id", parseRawId(task.id));
      } else if (task.id.startsWith("partner_action:")) {
        const [noteId, actionId] = task.id.replace("partner_action:", "").split(":");
        const { data } = await supabase.from("partner_notes").select("action_items").eq("id", noteId).single();
        const items = (data?.action_items as any[] | undefined) || [];
        const next = items.map((a) => (a.id === actionId ? { ...a, status: "Done" } : a));
        await supabase.from("partner_notes").update({ action_items: next as any }).eq("id", noteId);
      } else {
        throw new Error("This task is auto-generated from another module. Open the related record to act on it.");
      }
    },
    onMutate: async (task: UnifiedTask) => {
      await qc.cancelQueries({ queryKey: ["unified_tasks"] });
      const snapshots = qc.getQueriesData<UnifiedTask[]>({ queryKey: ["unified_tasks"] });
      qc.setQueriesData<UnifiedTask[]>({ queryKey: ["unified_tasks"] }, (old) =>
        (old || []).filter((t) => t.id !== task.id),
      );
      return { snapshots };
    },
    onError: (_e, _task, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["unified_tasks"] });
      qc.invalidateQueries({ queryKey: ["unified_tasks_focus"] });
      qc.invalidateQueries({ queryKey: ["unified_tasks_workload"] });
      qc.invalidateQueries({ queryKey: ["unified_tasks_team"] });
    },
  });
}

export function useUncompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: UnifiedTask) => {
      if (task.source === "manual") {
        await supabase.from("manual_tasks").update({ status: "Pending", completed_at: null }).eq("id", parseRawId(task.id));
      } else if (task.id.startsWith("lead:")) {
        await supabase.from("lead_tasks").update({ status: "Pending", completed_at: null }).eq("id", parseRawId(task.id));
      } else if (task.id.startsWith("pipeline:")) {
        await supabase.from("deal_tasks").update({ status: "Pending", is_completed: false, completed_at: null }).eq("id", parseRawId(task.id));
      } else if (task.id.startsWith("partner_action:")) {
        const [noteId, actionId] = task.id.replace("partner_action:", "").split(":");
        const { data } = await supabase.from("partner_notes").select("action_items").eq("id", noteId).single();
        const items = (data?.action_items as any[] | undefined) || [];
        const next = items.map((a) => (a.id === actionId ? { ...a, status: "Open" } : a));
        await supabase.from("partner_notes").update({ action_items: next as any }).eq("id", noteId);
      } else {
        throw new Error("Cannot undo auto-generated task.");
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["unified_tasks"] });
      qc.invalidateQueries({ queryKey: ["unified_tasks_focus"] });
    },
  });
}

export function useRescheduleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ task, due_date }: { task: UnifiedTask; due_date: string }) => {
      if (task.source === "manual") {
        await supabase.from("manual_tasks").update({ due_date }).eq("id", parseRawId(task.id));
      } else if (task.id.startsWith("lead:")) {
        await supabase.from("lead_tasks").update({ due_date }).eq("id", parseRawId(task.id));
      } else if (task.id.startsWith("pipeline:")) {
        await supabase.from("deal_tasks").update({ due_date }).eq("id", parseRawId(task.id));
      } else if (task.id.startsWith("partner_action:")) {
        const [noteId, actionId] = task.id.replace("partner_action:", "").split(":");
        const { data } = await supabase.from("partner_notes").select("action_items").eq("id", noteId).single();
        const items = (data?.action_items as any[] | undefined) || [];
        const next = items.map((a) => (a.id === actionId ? { ...a, due_date } : a));
        await supabase.from("partner_notes").update({ action_items: next as any }).eq("id", noteId);
      } else {
        throw new Error("Auto tasks cannot be rescheduled here.");
      }
    },
    onMutate: async ({ task, due_date }) => {
      await qc.cancelQueries({ queryKey: ["unified_tasks"] });
      const snapshots = qc.getQueriesData<UnifiedTask[]>({ queryKey: ["unified_tasks"] });
      qc.setQueriesData<UnifiedTask[]>({ queryKey: ["unified_tasks"] }, (old) =>
        (old || []).map((t) => (t.id === task.id ? { ...t, due_date } : t)),
      );
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["unified_tasks"] }),
  });
}

export function useAssignTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ task, owner_user_id }: { task: UnifiedTask; owner_user_id: string }) => {
      if (task.source === "manual") {
        await supabase.from("manual_tasks").update({ owner_user_id }).eq("id", parseRawId(task.id));
      } else if (task.id.startsWith("lead:")) {
        await supabase.from("lead_tasks").update({ assigned_user_id: owner_user_id }).eq("id", parseRawId(task.id));
      } else if (task.id.startsWith("pipeline:")) {
        await supabase.from("deal_tasks").update({ assigned_user_id: owner_user_id }).eq("id", parseRawId(task.id));
      } else {
        throw new Error("This task type can't be reassigned from here.");
      }
    },
    onMutate: async ({ task, owner_user_id }) => {
      await qc.cancelQueries({ queryKey: ["unified_tasks"] });
      const snapshots = qc.getQueriesData<UnifiedTask[]>({ queryKey: ["unified_tasks"] });
      qc.setQueriesData<UnifiedTask[]>({ queryKey: ["unified_tasks"] }, (old) =>
        (old || []).map((t) => (t.id === task.id ? { ...t, owner_user_id } : t)),
      );
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["unified_tasks"] }),
  });
}

export function useCreateManualTask() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      due_date?: string | null;
      priority?: string;
      owner_user_id?: string | null;
      task_type?: string;
      related_company?: string | null;
      related_source?: string | null;
      related_entity_id?: string | null;
      related_route?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("manual_tasks")
        .insert({
          ...input,
          owner_user_id: input.owner_user_id ?? user?.id ?? null,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unified_tasks"] }),
  });
}

export function useDeleteManualTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("manual_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unified_tasks"] }),
  });
}
