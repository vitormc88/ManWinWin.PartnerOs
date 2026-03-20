import { useState } from "react";
import { Bell, Check, AlertTriangle, Info, CheckCircle2, XCircle } from "lucide-react";
import { mockNotifications, NotificationRecord } from "@/data/renewals-mock-data";
import { Link } from "react-router-dom";

const typeIcons: Record<string, typeof AlertTriangle> = {
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  success: CheckCircle2,
};

const typeColors: Record<string, string> = {
  warning: "text-amber-500 bg-amber-50",
  danger: "text-destructive bg-red-50",
  info: "text-blue-500 bg-blue-50",
  success: "text-emerald-500 bg-emerald-50",
};

export default function Notifications() {
  const [notifications, setNotifications] = useState(mockNotifications);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const display = filter === "unread" ? notifications.filter(n => !n.isRead) : notifications;
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">{unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="h-9 px-4 rounded-lg border bg-card text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors active:scale-[0.97]">
            <Check className="h-4 w-4 inline mr-1.5" />Mark all read
          </button>
        )}
      </div>

      <div className="flex gap-2 animate-reveal-up stagger-1">
        {(["all", "unread"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-card border text-muted-foreground hover:bg-secondary"}`}>
            {f === "all" ? "All" : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      <div className="space-y-2 animate-reveal-up stagger-2">
        {display.length === 0 ? (
          <div className="bg-card rounded-xl border p-12 text-center">
            <Bell className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No notifications to show</p>
          </div>
        ) : (
          display.map(n => {
            const Icon = typeIcons[n.type] || Info;
            return (
              <div
                key={n.id}
                className={`bg-card rounded-xl border shadow-sm p-4 flex gap-3 transition-colors ${!n.isRead ? "border-l-2 border-l-primary" : ""}`}
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${typeColors[n.type]}`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${!n.isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}>{n.title}</p>
                    <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                      {new Date(n.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {n.actionUrl && (
                      <Link to={n.actionUrl} className="text-xs font-medium text-primary hover:underline">View details →</Link>
                    )}
                    {!n.isRead && (
                      <button onClick={() => markRead(n.id)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Mark read</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
