import { useEffect, useState } from "react";
import { Bell, Check, AlertTriangle, Info, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useNotificationInbox, useNotificationUnreadCount, useMarkNotificationsRead, useNotificationEmailHealth } from "@/hooks/useNotificationInbox";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const typeIcons: Record<string, typeof Info> = { warning: AlertTriangle, danger: XCircle, info: Info, success: CheckCircle2, task: CheckCircle2 };
const emailLabels: Record<string, string> = { dispatching: "Email pending", queued: "Email queued", sent: "Email sent", delivered: "Email delivered", failed: "Email failed", bounced: "Email bounced", suppressed: "Email blocked", disabled: "Email inactive" };
const PAGE_SIZE = 25;

export default function Notifications() {
  const access = useModuleAccess();
  const { isHQ } = useAuth();
  const allowed = access.isResolved && access.canView("notifications");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(0);
  const inbox = useNotificationInbox(allowed, { page, unreadOnly: filter === "unread", pageSize: PAGE_SIZE });
  const unread = useNotificationUnreadCount(allowed);
  const health = useNotificationEmailHealth(allowed && isHQ);
  const markRead = useMarkNotificationsRead();
  const notifications = inbox.data?.items ?? [];
  const total = inbox.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (inbox.data && page >= pages) setPage(pages - 1); }, [inbox.data, page, pages]);
  const refresh = () => { void inbox.refetch(); void unread.refetch(); if (isHQ) void health.refetch(); };

  if (!access.isResolved || inbox.isLoading) return <div role="status" className="p-12 text-center text-muted-foreground">Loading notifications…</div>;
  if (!allowed) return <div className="p-12 text-center">You do not have access to notifications.</div>;
  return <div className="max-w-3xl mx-auto space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-1">{unread.isError ? "Unread count unavailable" : unread.data === undefined ? "Checking unread notifications…" : `${unread.data} unread notification${unread.data === 1 ? "" : "s"}`}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={refresh} aria-label="Refresh notifications"><RefreshCw className="h-4 w-4" /></Button>
        {!!unread.data && <Button variant="outline" size="sm" disabled={markRead.isPending} onClick={() => markRead.mutate(null)}><Check className="h-4 w-4 mr-1" />{markRead.isPending ? "Saving…" : "Mark all read"}</Button>}
      </div>
    </div>
    {isHQ && <div className="rounded-xl border bg-card p-4 text-sm">
      <p className="font-medium mb-1">Operational email delivery</p>
      {health.isError ? <p role="alert" className="text-destructive">Email delivery status unavailable. <button onClick={() => void health.refetch()} className="underline">Try again</button></p> : !health.data ? <p className="text-muted-foreground">Checking delivery status…</p> : <>
        <p className="text-muted-foreground">{health.data.enabled ? "Active for lead and task assignments and new announcements." : "Operational email sending is inactive."}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs"><span>{health.data.queued} pending</span><span>{health.data.sent} sent</span><span className={health.data.failed ? "text-destructive" : ""}>{health.data.failed} failed</span><span>{health.data.suppressed} blocked</span></div>
        <p className="text-[11px] text-muted-foreground mt-2">All users · Sent means accepted by the email provider; delivery to the inbox is not confirmed.</p>
      </>}
    </div>}
    <div className="flex gap-2">{(["all", "unread"] as const).map(f => <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => { setFilter(f); setPage(0); }}>{f === "all" ? "All" : `Unread${unread.data !== undefined ? ` (${unread.data})` : ""}`}</Button>)}</div>
    {inbox.isError || unread.isError ? <div role="alert" className="rounded-xl border border-destructive/40 p-6 text-center"><p>Could not load notifications. Your unread items have not been cleared.</p><Button variant="outline" onClick={refresh} className="mt-3">Try again</Button></div> : <>
      <div className="space-y-2">{notifications.length === 0 ? <div className="bg-card rounded-xl border p-12 text-center"><Bell className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" /><p className="text-sm text-muted-foreground">{filter === "unread" ? "You're all caught up." : "No notifications to show."}</p></div> : notifications.map(n => {
        const Icon = typeIcons[n.type] || Info;
        return <div key={n.id} className={`bg-card rounded-xl border p-4 flex gap-3 ${!n.is_read ? "border-l-2 border-l-primary" : ""}`}>
          <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0"><Icon className="h-4 w-4 text-muted-foreground" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2"><p className={`text-sm ${!n.is_read ? "font-semibold" : "font-medium text-foreground/80"}`}>{n.title}</p><time className="text-[11px] text-muted-foreground" dateTime={n.created_at}>{new Date(n.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time></div>
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line break-words">{n.message}</p>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {n.action_url && <Link to={n.action_url} onClick={() => { if (!n.is_read) markRead.mutate(n.id); }} className="text-xs font-medium text-primary hover:underline">View details →</Link>}
              {!n.is_read && <button disabled={markRead.isPending} onClick={() => markRead.mutate(n.id)} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">Mark read</button>}
              {isHQ && n.email_status && emailLabels[n.email_status] && <span className={`text-[10px] ${["failed", "bounced"].includes(n.email_status) ? "text-destructive" : "text-muted-foreground"}`}>{emailLabels[n.email_status]}</span>}
            </div>
          </div>
        </div>;
      })}</div>
      {total > 0 && <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page === 0 || inbox.isFetching} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page + 1} of {pages}</span><Button size="sm" variant="outline" disabled={page + 1 >= pages || inbox.isFetching} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
    </>}
  </div>;
}
