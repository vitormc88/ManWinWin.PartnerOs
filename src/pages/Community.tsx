import { useMemo, useState } from "react";
import { MessageSquare, Plus, Search, Pin, Trash2, CheckCircle2, Lock, Unlock, Send, Shield } from "lucide-react";
import {
  useCommunityPosts,
  useCommunityComments,
  useSavePost,
  useDeletePost,
  useUpdatePostMeta,
  useAddComment,
  useDeleteComment,
  COMMUNITY_CATEGORIES,
  type CommunityPostWithMeta,
  type CommunityPostInput,
} from "@/hooks/useCommunity";
import { useMyPermissions } from "@/hooks/useUsers";
import { useAuth } from "@/contexts/AuthContext";
import { rank } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const categoryColors: Record<string, string> = {
  Sales: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  Product: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  Implementation: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900",
  Integrations: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900",
  Marketing: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-900",
  Feedback: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  General: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800",
};

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  answered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  closed: "bg-muted text-muted-foreground",
};

const emptyForm: CommunityPostInput = {
  title: "",
  body: "",
  category: "General",
};

function formatDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function Community() {
  const { isHQ, user } = useAuth();
  const { data: perms } = useMyPermissions();
  const canEdit = rank(perms?.find(p => p.module_key === "community")?.access_level) >= 2;

  const { data: posts = [], isLoading } = useCommunityPosts();
  const save = useSavePost();
  const del = useDeletePost();
  const updateMeta = useUpdatePostMeta();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<CommunityPostWithMeta | null>(null);
  const [viewing, setViewing] = useState<CommunityPostWithMeta | null>(null);
  const [form, setForm] = useState<CommunityPostInput>(emptyForm);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter(p => {
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (q) {
        const hay = `${p.title} ${p.body ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [posts, search, categoryFilter, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpenForm(true);
  };

  const openEdit = (p: CommunityPostWithMeta) => {
    setEditing(p);
    setForm({ title: p.title, body: p.body ?? "", category: p.category });
    setOpenForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    try {
      await save.mutateAsync({ id: editing?.id, input: form });
      toast({ title: editing ? "Post updated" : "Post created" });
      setOpenForm(false);
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (p: CommunityPostWithMeta) => {
    if (!confirm(`Delete post "${p.title}"?`)) return;
    try {
      await del.mutateAsync(p.id);
      toast({ title: "Post deleted" });
      if (viewing?.id === p.id) setViewing(null);
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  const handleMeta = async (p: CommunityPostWithMeta, patch: Parameters<typeof updateMeta.mutateAsync>[0]["patch"]) => {
    try {
      await updateMeta.mutateAsync({ id: p.id, patch });
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Community</h1>
          <p className="text-sm text-muted-foreground mt-1">Partner discussions, questions and feedback</p>
        </div>
        {canEdit && (
          <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />New Post</Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 animate-reveal-up stagger-1">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search posts..." className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {COMMUNITY_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="answered">Answered</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px]"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border p-12 text-center animate-reveal-up stagger-2">
          <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No posts to show</p>
          {canEdit && <p className="text-xs text-muted-foreground mt-1">Be the first to start a discussion.</p>}
        </div>
      ) : (
        <div className="space-y-3 animate-reveal-up stagger-2">
          {filtered.map(p => (
            <div
              key={p.id}
              className="bg-card rounded-xl border shadow-sm p-4 sm:p-5 hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => setViewing(p)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    {p.pinned && <Badge variant="outline" className="gap-1 text-[10px]"><Pin className="h-3 w-3" />Pinned</Badge>}
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${categoryColors[p.category] ?? categoryColors.General}`}>{p.category}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusColors[p.status]}`}>{p.status}</span>
                  </div>
                  <h3 className="text-base font-semibold text-foreground hover:text-primary transition-colors">{p.title}</h3>
                  {p.body && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.body}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground mt-2">
                    <span>{p.author_name ?? "Unknown"}</span>
                    {p.partner_name && <span>· {p.partner_name}</span>}
                    <span>· {formatDate(p.created_at)}</span>
                    <span className="inline-flex items-center gap-1">· <MessageSquare className="h-3 w-3" />{p.comment_count}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View dialog */}
      <PostDetailDialog
        post={viewing}
        onClose={() => setViewing(null)}
        canEdit={canEdit}
        isHQ={isHQ}
        currentUserId={user?.id ?? null}
        onEdit={(p) => { setViewing(null); openEdit(p); }}
        onDelete={handleDelete}
        onMeta={handleMeta}
      />

      {/* Form dialog */}
      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Post" : "New Post"}</DialogTitle>
            <DialogDescription>Share a question, idea, or feedback with the partner community.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMMUNITY_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Body</Label>
              <Textarea value={form.body ?? ""} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={6} placeholder="Describe your question or idea..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={save.isPending}>{editing ? "Save changes" : "Publish post"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PostDetailDialog({
  post,
  onClose,
  canEdit,
  isHQ,
  currentUserId,
  onEdit,
  onDelete,
  onMeta,
}: {
  post: CommunityPostWithMeta | null;
  onClose: () => void;
  canEdit: boolean;
  isHQ: boolean;
  currentUserId: string | null;
  onEdit: (p: CommunityPostWithMeta) => void;
  onDelete: (p: CommunityPostWithMeta) => void;
  onMeta: (p: CommunityPostWithMeta, patch: Partial<Pick<CommunityPostWithMeta, "pinned" | "status">>) => void;
}) {
  const { data: comments = [], isLoading } = useCommunityComments(post?.id ?? null);
  const addComment = useAddComment();
  const delComment = useDeleteComment();
  const [body, setBody] = useState("");

  const isOwner = post?.created_by && post.created_by === currentUserId;
  const closed = post?.status === "closed";
  const canComment = canEdit && (!closed || isHQ);

  const handlePost = async () => {
    if (!post || !body.trim()) return;
    try {
      await addComment.mutateAsync({ postId: post.id, body: body.trim(), isHQ });
      setBody("");
    } catch (e: any) {
      toast({ title: "Failed to comment", description: e.message, variant: "destructive" });
    }
  };

  const handleDelComment = async (id: string) => {
    if (!post) return;
    if (!confirm("Delete this comment?")) return;
    try {
      await delComment.mutateAsync({ id, postId: post.id });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={!!post} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {post && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {post.pinned && <Badge variant="outline" className="gap-1 text-[10px]"><Pin className="h-3 w-3" />Pinned</Badge>}
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${categoryColors[post.category] ?? categoryColors.General}`}>{post.category}</span>
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusColors[post.status]}`}>{post.status}</span>
              </div>
              <DialogTitle>{post.title}</DialogTitle>
              <DialogDescription>
                {post.author_name ?? "Unknown"}
                {post.partner_name && ` · ${post.partner_name}`}
                {` · ${formatDate(post.created_at)}`}
              </DialogDescription>
            </DialogHeader>

            {post.body && (
              <p className="text-sm text-foreground whitespace-pre-wrap">{post.body}</p>
            )}

            {/* Moderation controls */}
            {(isHQ || isOwner) && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {isHQ && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => onMeta(post, { pinned: !post.pinned })} className="gap-1">
                      <Pin className="h-3.5 w-3.5" />{post.pinned ? "Unpin" : "Pin"}
                    </Button>
                    {post.status !== "answered" && (
                      <Button size="sm" variant="outline" onClick={() => onMeta(post, { status: "answered" })} className="gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />Mark answered
                      </Button>
                    )}
                    {post.status !== "closed" ? (
                      <Button size="sm" variant="outline" onClick={() => onMeta(post, { status: "closed" })} className="gap-1">
                        <Lock className="h-3.5 w-3.5" />Close
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => onMeta(post, { status: "open" })} className="gap-1">
                        <Unlock className="h-3.5 w-3.5" />Reopen
                      </Button>
                    )}
                  </>
                )}
                {(isOwner || isHQ) && (
                  <Button size="sm" variant="outline" onClick={() => onEdit(post)}>Edit</Button>
                )}
                {(isOwner || isHQ) && (
                  <Button size="sm" variant="outline" onClick={() => onDelete(post)} className="gap-1 text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />Delete
                  </Button>
                )}
              </div>
            )}

            {/* Comments */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Comments ({comments.length})</h4>
              </div>
              {isLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No comments yet.</p>
              ) : (
                <div className="space-y-3">
                  {comments.map(c => {
                    const isCommentOwner = c.created_by === currentUserId;
                    return (
                      <div key={c.id} className="rounded-lg border bg-muted/30 p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-foreground">{(c as any).author_name ?? "Unknown"}</span>
                            {c.is_official_hq_reply && (
                              <Badge variant="outline" className="gap-1 text-[10px] border-primary/40 text-primary">
                                <Shield className="h-3 w-3" />Official HQ reply
                              </Badge>
                            )}
                            <span className="text-muted-foreground">· {formatDate(c.created_at)}</span>
                          </div>
                          {(isHQ || isCommentOwner) && (
                            <Button size="sm" variant="ghost" onClick={() => handleDelComment(c.id)} className="h-6 px-2">
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {canComment ? (
                <div className="space-y-2 pt-2">
                  <Textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    placeholder={isHQ ? "Reply as ManWinWin HQ…" : "Write a comment…"}
                    rows={3}
                  />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handlePost} disabled={!body.trim() || addComment.isPending} className="gap-1">
                      <Send className="h-3.5 w-3.5" />Post comment
                    </Button>
                  </div>
                </div>
              ) : closed ? (
                <p className="text-xs text-muted-foreground italic pt-2">This post is closed for new comments.</p>
              ) : null}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
