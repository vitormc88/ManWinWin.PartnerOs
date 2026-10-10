import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Megaphone, Plus, Search, Pin, Pencil, Trash2, Archive, Send, Eye } from "lucide-react";
import { useAnnouncements, useSaveAnnouncement, useDeleteAnnouncement, ANNOUNCEMENT_CATEGORIES, type Announcement, type AnnouncementInput } from "@/hooks/useAnnouncements";
import { usePartners, usePartnershipLevels } from "@/hooks/usePartners";
import { useMyPermissions } from "@/hooks/useUsers";
import { useAuth } from "@/contexts/AuthContext";
import { rank } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { CountryCodeCombobox } from "@/components/partners/CountryCodeCombobox";
import { toast } from "@/hooks/use-toast";

const categoryColors: Record<string, string> = {
  Product: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  Commercial: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  Event: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900",
  Resource: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  Operational: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800",
  Training: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-900",
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  archived: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
};

const emptyForm: AnnouncementInput = {
  title: "",
  summary: "",
  body: "",
  category: "Product",
  status: "draft",
  pinned: false,
  target_audience: "all",
  partner_id: null,
  target_country: null,
  target_partnership_level: null,
};

export default function Announcements() {
  const { isAdmin, isHQ } = useAuth();
  const { data: perms } = useMyPermissions();
  const canEdit = isAdmin || rank(perms?.find(p => p.module_key === "announcements")?.access_level) >= 2;
  const canDelete = isAdmin;

  const { data: items = [], isLoading } = useAnnouncements({ publishedOnly: !isHQ });
  const { data: partners = [] } = usePartners();
  const { data: levels = [] } = usePartnershipLevels();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [viewing, setViewing] = useState<Announcement | null>(null);
  const [params, setParams] = useSearchParams();
  const requestedId = params.get("id");
  useEffect(() => {
    if (!requestedId || isLoading) return;
    const announcement = items.find(a => a.id === requestedId);
    if (announcement) setViewing(announcement);
  }, [requestedId, items, isLoading]);
  const [form, setForm] = useState<AnnouncementInput>(emptyForm);

  const save = useSaveAnnouncement();
  const del = useDeleteAnnouncement();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(a => {
      if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
      if (isHQ && statusFilter !== "all" && a.status !== statusFilter) return false;
      if (q) {
        const hay = `${a.title} ${a.summary ?? ""} ${a.body ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, categoryFilter, statusFilter, isHQ]);

  const partnerNameById = useMemo(() => {
    const m: Record<string, string> = {};
    partners.forEach(p => { m[p.id] = p.company_name; });
    return m;
  }, [partners]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpenForm(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({
      title: a.title,
      summary: a.summary ?? "",
      body: a.body ?? "",
      category: a.category ?? "Product",
      status: a.status,
      pinned: a.pinned,
      target_audience: a.target_audience,
      partner_id: a.partner_id,
      target_country: a.target_country,
      target_partnership_level: a.target_partnership_level,
    });
    setOpenForm(true);
  };

  const handleSave = async (override?: Partial<AnnouncementInput>) => {
    const input = { ...form, ...override };
    if (!input.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (input.target_audience === "partner" && !input.partner_id) {
      toast({ title: "Select a target partner", variant: "destructive" });
      return;
    }
    if (input.target_audience === "country" && !input.target_country) {
      toast({ title: "Select a target country", variant: "destructive" });
      return;
    }
    if (input.target_audience === "partnership_level" && !input.target_partnership_level) {
      toast({ title: "Select a partnership level", variant: "destructive" });
      return;
    }
    try {
      await save.mutateAsync({ id: editing?.id, input });
      toast({ title: editing ? "Announcement updated" : "Announcement created" });
      setOpenForm(false);
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    }
  };

  const quickAction = async (a: Announcement, status: "published" | "archived") => {
    try {
      await save.mutateAsync({
        id: a.id,
        input: {
          title: a.title,
          summary: a.summary,
          body: a.body,
          category: a.category,
          status,
          pinned: a.pinned,
          target_audience: a.target_audience,
          partner_id: a.partner_id,
          target_country: a.target_country,
          target_partnership_level: a.target_partnership_level,
        },
      });
      toast({ title: status === "published" ? "Published" : "Archived" });
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (a: Announcement) => {
    if (!confirm(`Delete draft "${a.title}"?`)) return;
    try {
      await del.mutateAsync(a.id);
      toast({ title: "Draft deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Announcements</h1>
          <p className="text-sm text-muted-foreground mt-1">Official updates from ManWinWin HQ</p>
        </div>
        {canEdit && (
          <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />New Announcement</Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 animate-reveal-up stagger-1">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search announcements..." className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {ANNOUNCEMENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {isHQ && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px]"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border p-12 text-center animate-reveal-up stagger-2">
          <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No announcements to show</p>
        </div>
      ) : (
        <div className="space-y-3 animate-reveal-up stagger-2">
          {filtered.map(a => (
            <div key={a.id} className="bg-card rounded-xl border shadow-sm p-4 sm:p-5 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    {a.pinned && <Badge variant="outline" className="gap-1 text-[10px]"><Pin className="h-3 w-3" />Pinned</Badge>}
                    {a.category && (
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${categoryColors[a.category] ?? "bg-muted text-muted-foreground border-border"}`}>{a.category}</span>
                    )}
                    {isHQ && (
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusColors[a.status]}`}>{a.status}</span>
                    )}
                    {isHQ && a.target_audience !== "all" && (
                      <Badge variant="outline" className="text-[10px]">
                        {a.target_audience === "partner" && (a.partner_id ? partnerNameById[a.partner_id] ?? "Partner" : "Partner")}
                        {a.target_audience === "country" && `Country: ${a.target_country}`}
                        {a.target_audience === "partnership_level" && `Level: ${a.target_partnership_level}`}
                      </Badge>
                    )}
                  </div>
                  <button className="text-left" onClick={() => setViewing(a)}>
                    <h3 className="text-base font-semibold text-foreground hover:text-primary transition-colors">{a.title}</h3>
                  </button>
                  {a.summary && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>}
                  <p className="text-[11px] text-muted-foreground mt-2 tabular-nums">
                    {a.published_at
                      ? new Date(a.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : a.created_at
                      ? `Draft · ${new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setViewing(a)} className="gap-1"><Eye className="h-4 w-4" /></Button>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(a)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                      {a.status !== "published" && (
                        <Button size="sm" variant="ghost" onClick={() => quickAction(a, "published")} title="Publish"><Send className="h-4 w-4" /></Button>
                      )}
                      {a.status === "published" && (
                        <Button size="sm" variant="ghost" onClick={() => quickAction(a, "archived")} title="Archive"><Archive className="h-4 w-4" /></Button>
                      )}
                      {canDelete && a.status === "draft" && (
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(a)} title="Delete draft"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View dialog */}
      <Dialog open={!!viewing} onOpenChange={o => { if (!o) { setViewing(null); if (requestedId) { const next = new URLSearchParams(params); next.delete("id"); setParams(next, { replace: true }); } } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {viewing.pinned && <Badge variant="outline" className="gap-1 text-[10px]"><Pin className="h-3 w-3" />Pinned</Badge>}
                  {viewing.category && (
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${categoryColors[viewing.category] ?? "bg-muted text-muted-foreground border-border"}`}>{viewing.category}</span>
                  )}
                </div>
                <DialogTitle>{viewing.title}</DialogTitle>
                <DialogDescription>
                  {viewing.published_at
                    ? new Date(viewing.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                    : "Draft"}
                </DialogDescription>
              </DialogHeader>
              {viewing.summary && <p className="text-sm font-medium text-foreground">{viewing.summary}</p>}
              {viewing.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{viewing.body}</p>}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Form dialog */}
      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Announcement" : "New Announcement"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label>Summary</Label>
              <Input value={form.summary ?? ""} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} placeholder="Short one-line summary" />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea value={form.body ?? ""} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={6} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category ?? ""} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANNOUNCEMENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v: any) => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <Label className="text-sm">Pin to top</Label>
                <p className="text-xs text-muted-foreground">Pinned announcements appear first.</p>
              </div>
              <Switch checked={form.pinned} onCheckedChange={v => setForm(f => ({ ...f, pinned: v }))} />
            </div>

            <div>
              <Label>Target audience</Label>
              <Select value={form.target_audience} onValueChange={(v: any) => setForm(f => ({ ...f, target_audience: v, partner_id: null, target_country: null, target_partnership_level: null }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All partners</SelectItem>
                  <SelectItem value="partner">Specific partner</SelectItem>
                  <SelectItem value="country">Country</SelectItem>
                  <SelectItem value="partnership_level">Partnership level</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.target_audience === "partner" && (
              <div>
                <Label>Partner</Label>
                <Select value={form.partner_id ?? ""} onValueChange={v => setForm(f => ({ ...f, partner_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select partner..." /></SelectTrigger>
                  <SelectContent>
                    {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.target_audience === "country" && (
              <div>
                <Label>Country</Label>
                <CountryCodeCombobox value={form.target_country ?? ""} onChange={v => setForm(f => ({ ...f, target_country: v }))} />
              </div>
            )}

            {form.target_audience === "partnership_level" && (
              <div>
                <Label>Partnership level</Label>
                <Select value={form.target_partnership_level ?? ""} onValueChange={v => setForm(f => ({ ...f, target_partnership_level: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select level..." /></SelectTrigger>
                  <SelectContent>
                    {levels.map(l => <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenForm(false)}>Cancel</Button>
            {form.status !== "published" && (
              <Button variant="secondary" onClick={() => handleSave({ status: "draft" })} disabled={save.isPending}>Save draft</Button>
            )}
            <Button onClick={() => handleSave({ status: "published" })} disabled={save.isPending}>
              {form.status === "published" ? "Save & keep published" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
