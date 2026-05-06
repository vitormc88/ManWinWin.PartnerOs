import { useState, useRef, useEffect } from "react";
import { Bell, Check, Info, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useNotifications } from "@/hooks/useDeals";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useMyPermissions } from "@/hooks/useUsers";
import { canView } from "@/lib/permissions";

const typeIcons: Record<string, typeof Info> = {
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  success: CheckCircle2,
  task: CheckCircle2,
};

export function NotificationBell() {
  const { data: perms } = useMyPermissions();
  const allowed = canView(perms as any, "notifications");
  const { data: notifications = [] } = useNotifications(allowed);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const recent = notifications.slice(0, 15);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markAllRead = async () => {
    const ids = notifications.filter(n => !n.is_read).map(n => n.id);
    if (ids.length === 0) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  if (!allowed) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
      >
        <Bell className="h-4 w-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 flex items-center justify-center bg-primary text-primary-foreground text-[10px] font-bold rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-card border rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                  Mark all read
                </button>
              )}
              <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
                View all
              </Link>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {recent.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No notifications</div>
            ) : (
              recent.map(n => {
                const Icon = typeIcons[n.type] || Info;
                return (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors border-b last:border-b-0 ${!n.is_read ? "bg-primary/5" : ""}`}
                  >
                    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug ${!n.is_read ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                        {n.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {n.action_url && (
                          <Link
                            to={n.action_url}
                            onClick={() => { markRead(n.id); setOpen(false); }}
                            className="text-[11px] font-medium text-primary hover:underline"
                          >
                            View →
                          </Link>
                        )}
                        {!n.is_read && !n.action_url && (
                          <button onClick={() => markRead(n.id)} className="text-[11px] text-muted-foreground hover:text-foreground">
                            Mark read
                          </button>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {new Date(n.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
