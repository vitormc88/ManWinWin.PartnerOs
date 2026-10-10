import { useState, useRef, useEffect } from "react";
import { Bell, Info, AlertTriangle, XCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useNotificationInbox, useNotificationUnreadCount, useMarkNotificationsRead } from "@/hooks/useNotificationInbox";
import { useModuleAccess } from "@/hooks/useModuleAccess";

const typeIcons: Record<string, typeof Info> = {
  warning: AlertTriangle, danger: XCircle, info: Info, success: CheckCircle2, task: CheckCircle2,
};

export function NotificationBell() {
  const access = useModuleAccess();
  const allowed = access.isResolved && access.canView("notifications");
  const inbox = useNotificationInbox(allowed, { pageSize: 15 });
  const unread = useNotificationUnreadCount(allowed);
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unreadCount = unread.data ?? 0;
  const recent = inbox.data?.items ?? [];
  const failed = inbox.isError || unread.isError;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  if (!allowed) return null;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-label={failed ? "Notifications unavailable" : `Notifications${unread.data !== undefined ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open} aria-controls="notification-popover" className="relative p-2 rounded-lg hover:bg-secondary transition-colors">
        <Bell className="h-4 w-4 text-muted-foreground" />
        {failed ? <span className="absolute top-0 right-0 text-xs text-destructive" aria-hidden="true">!</span> : unreadCount > 0 && (
          <span className="absolute top-0 right-0 min-w-4 h-4 px-0.5 flex items-center justify-center bg-primary text-primary-foreground text-[10px] font-bold rounded-full">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div id="notification-popover" className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-card border rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && <button disabled={markRead.isPending} onClick={() => markRead.mutate(null)} className="text-xs text-primary hover:underline disabled:opacity-50">{markRead.isPending ? "Saving…" : "Mark all read"}</button>}
              <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {failed ? <div role="alert" className="p-5 text-center text-sm">
              <p>Could not load notifications.</p>
              <button onClick={() => { void inbox.refetch(); void unread.refetch(); }} className="mt-2 text-primary inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" />Try again</button>
            </div> : inbox.isLoading ? <div role="status" className="p-6 text-center text-sm text-muted-foreground">Loading notifications…</div> : recent.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No notifications</div>
            ) : recent.map(n => {
              const Icon = typeIcons[n.type] || Info;
              return <div key={n.id} className={`flex gap-3 px-4 py-3 border-b last:border-b-0 ${!n.is_read ? "bg-primary/5" : ""}`}>
                <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-snug ${!n.is_read ? "font-semibold" : "text-foreground/80"}`}>{n.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {n.action_url && <Link to={n.action_url} onClick={() => { if (!n.is_read) markRead.mutate(n.id); setOpen(false); }} className="text-[11px] font-medium text-primary hover:underline">View →</Link>}
                    {!n.is_read && <button disabled={markRead.isPending} onClick={() => markRead.mutate(n.id)} className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50">Mark read</button>}
                    <span className="text-[10px] text-muted-foreground ml-auto">{new Date(n.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  </div>
                </div>
              </div>;
            })}
          </div>
          <div className="px-4 py-2 border-t text-[10px] text-muted-foreground">Updates automatically every 30 seconds</div>
        </div>
      )}
    </div>
  );
}
