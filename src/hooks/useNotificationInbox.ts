import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useNotificationInbox(enabled = true, options: { page?: number; unreadOnly?: boolean; pageSize?: number } = {}) {
  const { user, isAuthReady } = useAuth();
  const { page = 0, unreadOnly = false, pageSize = 25 } = options;
  return useQuery({
    queryKey: ["notifications", user?.id, "inbox", page, unreadOnly, pageSize],
    enabled: enabled && isAuthReady && !!user,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let query = supabase.from("notifications").select("*", { count: "exact" });
      if (unreadOnly) query = query.eq("is_read", false);
      const { data, count, error } = await query
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      return { items: data ?? [], total: count ?? 0 };
    },
  });
}

export function useNotificationUnreadCount(enabled = true) {
  const { user, isAuthReady } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id, "unread-count"],
    enabled: enabled && isAuthReady && !!user,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase.from("notifications")
        .select("id", { count: "exact", head: true }).eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | null) => {
      const { data, error } = await supabase.rpc("mark_notifications_read" as any, { _notification_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    onError: () => toast.error("Could not mark notifications as read. Please try again."),
  });
}

export interface NotificationEmailHealth {
  enabled: boolean;
  queued: number;
  sent: number;
  failed: number;
  suppressed: number;
}

export function useNotificationEmailHealth(enabled: boolean) {
  const { user, isAuthReady } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id, "email-health"],
    enabled: enabled && isAuthReady && !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("notification_email_health" as any);
      if (error) throw error;
      return data as unknown as NotificationEmailHealth;
    },
  });
}
