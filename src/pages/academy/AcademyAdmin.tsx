import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Pencil, ChevronUp, ChevronDown, AlertTriangle, Upload, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuestionBankPanel } from "@/components/academy/QuestionBankPanel";
import { AssetLibraryPanel } from "@/components/academy/AssetLibraryPanel";
import { AssetPickerDialog } from "@/components/academy/AssetPickerDialog";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAcademyMissions,
  useAcademyModules,
  useAcademyPhases,
  useAllAcademyResources,
  useDeleteAcademyAsset,
  useDeleteAcademyRecord,
  useReorderAcademyRecord,
  useSaveAcademyRecord,
  useUploadAcademyAsset,
} from "@/hooks/useAcademy";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { useAuth } from "@/contexts/AuthContext";
import { MissionContent } from "@/components/academy/MissionContent";
import { AcademyBreadcrumbs } from "@/components/academy/AcademyBreadcrumbs";
import { AcademyState } from "@/components/academy/AcademyState";
import {
  BLOCK_SNIPPETS,
  DIFFICULTIES,
  RESOURCE_TYPES,
  canHardDelete,
  draftKey,
  isDeletableAcademyObjectPath,
  isDraftStale,
  joinContentSegments,
  moveSegment,
  splitContentSegments,
  validatePublication,
  type AcademyDraftEnvelope,
  type AcademyTable,
} from "@/lib/academy";

type Table = AcademyTable;


type Field = {
  key: string;
  label: string;
  type: "text" | "textarea" | "markdown" | "number" | "status" | "boolean" | "select" | "file" | "json";
  options?: string[];
};

const STATUSES = ["draft", "published", "archived"];

const FIELDS: Record<Table, Field[]> = {
  academy_phases: [
    { key: "title", label: "Title", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "sort_order", label: "Order", type: "number" },
    { key: "status", label: "Status", type: "status" },
  ],
  academy_modules: [
    { key: "title", label: "Title", type: "text" },
    { key: "slug", label: "Slug", type: "text" },
    { key: "phase_id", label: "Phase", type: "select" },
    { key: "short_description", label: "Short description", type: "textarea" },
    { key: "full_description", label: "Full description", type: "textarea" },
    { key: "estimated_duration_minutes", label: "Duration (min)", type: "number" },
    { key: "difficulty", label: "Difficulty", type: "select", options: [...DIFFICULTIES] },
    { key: "certification_enabled", label: "Certificate required", type: "boolean" },
    { key: "sort_order", label: "Order", type: "number" },
    { key: "version", label: "Version", type: "number" },
    { key: "status", label: "Status", type: "status" },
  ],
  academy_missions: [
    { key: "title", label: "Title", type: "text" },
    { key: "slug", label: "Slug", type: "text" },
    { key: "module_id", label: "Module", type: "select" },
    { key: "mission_number", label: "Mission number", type: "number" },
    { key: "short_description", label: "Short description", type: "textarea" },
    { key: "estimated_duration_minutes", label: "Duration (min)", type: "number" },
    { key: "content_markdown", label: "Content (Markdown)", type: "markdown" },
    {
      key: "content_json",
      label: "Experience JSON (optional — Mission Player v2)",
      type: "json",
    },
    { key: "sort_order", label: "Order", type: "number" },
    { key: "is_required", label: "Required", type: "boolean" },
    { key: "is_locked", label: "Locked", type: "boolean" },
    { key: "version", label: "Version", type: "number" },
    { key: "status", label: "Status", type: "status" },
  ],
  academy_resources: [
    { key: "title", label: "Title", type: "text" },
    { key: "module_id", label: "Module", type: "select" },
    { key: "mission_id", label: "Mission (optional)", type: "select" },
    { key: "resource_type", label: "Type", type: "select", options: [...RESOURCE_TYPES] },
    { key: "description", label: "Description", type: "textarea" },
    { key: "content", label: "Content", type: "textarea" },
    { key: "file_path", label: "File attachment (private)", type: "file" },
    { key: "external_url", label: "External URL", type: "text" },
    { key: "version", label: "Version", type: "text" },
    { key: "is_downloadable", label: "Downloadable", type: "boolean" },
    { key: "sort_order", label: "Order", type: "number" },
    { key: "status", label: "Status", type: "status" },
  ],
};

export default function AcademyAdmin() {
  const { canAdmin, isLoading } = useModuleAccess();
  const phasesQuery = useAcademyPhases();
  const modulesQuery = useAcademyModules();
  const missionsQuery = useAcademyMissions();
  const resourcesQuery = useAllAcademyResources();
  const { data: phases = [] } = phasesQuery;
  const { data: modules = [] } = modulesQuery;
  const { data: missions = [] } = missionsQuery;
  const { data: resources = [] } = resourcesQuery;

  const [editing, setEditing] = useState<{ table: Table; record: Record<string, any> } | null>(null);
  const [questionModuleId, setQuestionModuleId] = useState<string>("");

  if (isLoading) return <AcademyState kind="loading" />;
  if (!canAdmin("onboarding")) {
    return (
      <AcademyState
        kind="empty"
        title="No access"
        description="You do not have permission to manage Academy content."
      />
    );
  }


  const selectOptions = (table: Table, key: string): Array<{ value: string; label: string }> => {
    if (key === "phase_id") return phases.map((p) => ({ value: p.id, label: p.title }));
    if (key === "module_id") return modules.map((m) => ({ value: m.id, label: m.title }));
    if (key === "mission_id") return missions.map((m) => ({ value: m.id, label: m.title }));
    const field = FIELDS[table].find((f) => f.key === key);
    return (field?.options ?? []).map((o) => ({ value: o, label: o }));
  };

  const section = (
    table: Table,
    title: string,
    rows: any[],
    query: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => void },
    subtitle?: (r: any) => string
  ) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Button size="sm" onClick={() => setEditing({ table, record: { status: "draft", sort_order: rows.length + 1 } })}>
          <Plus className="h-4 w-4 mr-1" />New
        </Button>
      </div>
      {query.isError ? (
        <AcademyState kind="error" error={query.error} onRetry={query.refetch} />
      ) : query.isLoading ? (
        <AcademyState kind="loading" />
      ) : rows.length === 0 ? (
        <AcademyState kind="empty" title={`No ${title.toLowerCase()} yet.`} />
      ) : (
        <div className="bg-card rounded-xl border shadow-sm divide-y">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle(r)}</p>}
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">{r.status}</Badge>
              <ReorderButtons table={table} rows={rows} row={r} />
              <Button variant="ghost" size="icon" onClick={() => setEditing({ table, record: r })}>
                <Pencil className="h-4 w-4" />
              </Button>
              <DeleteButton table={table} row={r} />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /** Slugs already taken in the same scope, so publication can reject clashes. */
  const siblingSlugs = (table: Table, record: Record<string, any>): string[] => {
    if (table === "academy_modules") {
      return modules.filter((m) => m.id !== record.id).map((m) => m.slug).filter(Boolean) as string[];
    }
    if (table === "academy_missions") {
      return missions
        .filter((m) => m.id !== record.id && m.module_id === record.module_id)
        .map((m) => m.slug)
        .filter(Boolean) as string[];
    }
    return [];
  };

  const parentStatus = (table: Table, record: Record<string, any>) => {
    if (table === "academy_modules") return phases.find((p) => p.id === record.phase_id)?.status ?? null;
    if (table === "academy_missions") return modules.find((m) => m.id === record.module_id)?.status ?? null;
    if (table === "academy_resources") return modules.find((m) => m.id === record.module_id)?.status ?? null;
    return null;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <AcademyBreadcrumbs items={[{ label: "Partner Academy", to: "/academy" }, { label: "Content" }]} />
      <Link to="/academy" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Academy
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Academy content</h1>
        <Link
          to="/academy/analytics"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
        >
          Learning analytics
        </Link>
      </div>

      <Tabs defaultValue="phases" className="space-y-4">
        <TabsList>
          <TabsTrigger value="phases">Phases</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="missions">Missions</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
        </TabsList>
        <TabsContent value="phases">{section("academy_phases", "Phases", phases, phasesQuery)}</TabsContent>
        <TabsContent value="modules">
          {section("academy_modules", "Modules", modules, modulesQuery, (m) => phases.find((p) => p.id === m.phase_id)?.title ?? "No phase")}
        </TabsContent>
        <TabsContent value="missions">
          {section("academy_missions", "Missions", missions, missionsQuery, (m) => modules.find((x) => x.id === m.module_id)?.title ?? "")}
        </TabsContent>
        <TabsContent value="resources">
          {section("academy_resources", "Resources", resources as any[], resourcesQuery, (r: any) => r.resource_type)}
        </TabsContent>
        <TabsContent value="questions" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Module</span>
            <Select value={questionModuleId} onValueChange={setQuestionModuleId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Select a module" />
              </SelectTrigger>
              <SelectContent>
                {modules.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <QuestionBankPanel moduleId={questionModuleId || undefined} />
        </TabsContent>
        <TabsContent value="assets">
          <AssetLibraryPanel canEdit={canAdmin("onboarding")} />
        </TabsContent>
      </Tabs>

      {editing && (
        <RecordDialog
          table={editing.table}
          record={editing.record}
          selectOptions={selectOptions}
          siblingSlugs={siblingSlugs(editing.table, editing.record)}
          parentStatusOf={(form) => parentStatus(editing.table, form) as any}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * Hard deletion is only offered for draft content, and it always requires an
 * explicit confirmation. Published items must be unpublished first; archived
 * items are retained as history.
 */
function DeleteButton({ table, row }: { table: Table; row: { id: string; status?: string | null; title?: string } }) {
  const del = useDeleteAcademyRecord(table);
  const [open, setOpen] = useState(false);
  const allowed = canHardDelete(row.status);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        disabled={del.isPending}
        title={allowed ? "Delete" : "Only draft items can be deleted"}
        onClick={() =>
          allowed
            ? setOpen(true)
            : toast.error("Only draft items can be deleted. Unpublish this item first; archived content is kept for history.")
        }
      >
        <Trash2 className={`h-4 w-4 ${allowed ? "text-destructive" : "text-muted-foreground"}`} />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{row.title ?? "this item"}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the record and any content attached to it. Learner progress
              referencing it will also be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => del.mutate(row.id)}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


function RecordDialog({
  table,
  record,
  selectOptions,
  siblingSlugs,
  parentStatusOf,
  onClose,
}: {
  table: Table;
  record: Record<string, any>;
  selectOptions: (table: Table, key: string) => Array<{ value: string; label: string }>;
  siblingSlugs: string[];
  parentStatusOf: (form: Record<string, any>) => "draft" | "published" | "archived" | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<Record<string, any>>(record);
  const save = useSaveAcademyRecord(table);
  const deleteAsset = useDeleteAcademyAsset();
  const fields = useMemo(() => FIELDS[table], [table]);
  const storageKey = draftKey(table, record.id, user?.id);
  const [restored, setRestored] = useState(false);
  const [staleDraft, setStaleDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // The server revision this editing session branched from.
  const baseUpdatedAt = useRef<string | null>(record.updated_at ?? null);

  // Restore a local autosaved draft (crash / accidental close protection) —
  // but never let a draft branched from an older revision silently overwrite a
  // newer server record.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AcademyDraftEnvelope | Record<string, any>;
      const envelope: AcademyDraftEnvelope =
        parsed && typeof parsed === "object" && "form" in parsed
          ? (parsed as AcademyDraftEnvelope)
          : { baseUpdatedAt: null, savedAt: new Date().toISOString(), form: parsed as Record<string, any> };

      if (isDraftStale(envelope.baseUpdatedAt, record.updated_at ?? null)) {
        setStaleDraft(true);
        return;
      }
      setForm((f) => ({ ...f, ...envelope.form }));
      setRestored(true);
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Autosave the working copy locally every second of inactivity.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const envelope: AcademyDraftEnvelope = {
          baseUpdatedAt: baseUpdatedAt.current,
          savedAt: new Date().toISOString(),
          form,
        };
        localStorage.setItem(storageKey, JSON.stringify(envelope));
        setSavedAt(new Date());
      } catch {
        /* storage unavailable */
      }
    }, 1000);
    return () => window.clearTimeout(t);
  }, [form, storageKey]);

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const hasStatus = fields.some((f) => f.type === "status");
  const isPublished = form.status === "published";

  const publishIssues = validatePublication(table, form, {
    siblingSlugs,
    parentStatus: parentStatusOf(form),
  });

  const clearLocalDraft = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* storage unavailable */
    }
  };

  const onSave = (statusOverride?: string) => {
    if (statusOverride === "published" && publishIssues.length > 0) {
      toast.error("Resolve the publication issues first.");
      return;
    }
    const payload: Record<string, any> = form.id
      ? { id: form.id, _expectedUpdatedAt: baseUpdatedAt.current }
      : {};
    let jsonInvalid = false;
    fields.forEach((f) => {
      const raw = form[f.key];
      if (raw === undefined) return;
      if (f.type === "number") {
        const n = Number(raw);
        payload[f.key] = Number.isFinite(n) ? Math.max(0, n) : 0;
      } else if (f.type === "json") {
        const parsed = parseJsonField(raw);
        if (!parsed.ok) {
          jsonInvalid = true;
          return;
        }
        payload[f.key] = parsed.value;
      } else {
        payload[f.key] = raw;
      }
    });
    if (jsonInvalid) {
      toast.error("Fix the Experience JSON before saving.");
      return;
    }

    if (statusOverride) payload.status = statusOverride;

    // The previous attachment is only removed once the record save succeeded,
    // and only when it is a private academy/ object no longer referenced.
    const previousPath: string = record.file_path ?? "";
    const nextPath: string = form.file_path ?? "";
    const replacedPath =
      table === "academy_resources" && previousPath && previousPath !== nextPath
        ? previousPath
        : null;

    save.mutate(payload, {
      onSuccess: () => {
        if (replacedPath) {
          if (!isDeletableAcademyObjectPath(replacedPath)) {
            toast.message("The previous attachment was left in storage", {
              description:
                "It is not a private Academy file (external URL or non-Academy path), so it was not deleted.",
            });
          } else {
            deleteAsset.mutate({ path: replacedPath, exceptResourceId: form.id });
          }
        }
        clearLocalDraft();
        onClose();
      },
    });
  };



  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl lg:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit" : "New"} {table.replace("academy_", "").replace(/s$/, "")}</DialogTitle>
        </DialogHeader>
        {staleDraft && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-foreground flex gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <span>
              A local draft was found, but this record changed on the server since that draft was
              made. The draft was discarded to avoid overwriting newer content.{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => {
                  clearLocalDraft();
                  setStaleDraft(false);
                }}
              >
                Dismiss
              </button>
            </span>
          </div>
        )}
        {restored && (
          <p className="text-xs text-muted-foreground">
            Restored an unsaved local draft.{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                clearLocalDraft();
                setForm(record);
                setRestored(false);
              }}
            >
              Discard it
            </button>
          </p>
        )}

        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              {f.type === "markdown" ? (
                <MarkdownEditor value={form[f.key] ?? ""} onChange={(v) => set(f.key, v)} />
              ) : f.type === "json" ? (
                <JsonExperienceField value={form[f.key]} onChange={(v) => set(f.key, v)} />
              ) : f.type === "file" ? (
                <AttachmentField value={form[f.key] ?? ""} onChange={(v) => set(f.key, v)} />
              ) : f.type === "textarea" ? (
                <Textarea
                  id={f.key}
                  rows={3}
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : f.type === "boolean" ? (
                <div><Switch checked={!!form[f.key]} onCheckedChange={(v) => set(f.key, v)} /></div>
              ) : f.type === "status" || f.type === "select" ? (
                <Select value={form[f.key] ?? ""} onValueChange={(v) => set(f.key, v)}>
                  <SelectTrigger id={f.key}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {(f.type === "status"
                      ? STATUSES.map((s) => ({ value: s, label: s }))
                      : selectOptions(table, f.key)
                    ).map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={f.key}
                  type={f.type === "number" ? "number" : "text"}
                  min={f.type === "number" ? 0 : undefined}
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        {hasStatus && publishIssues.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
            <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Resolve before publishing
            </p>
            <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
              {publishIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2 sm:items-center">
          <span className="text-xs text-muted-foreground mr-auto">
            {savedAt ? `Draft autosaved locally at ${savedAt.toLocaleTimeString()}` : "Autosaving locally…"}
          </span>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {hasStatus && (
            <Button variant="outline" onClick={() => onSave("draft")} disabled={save.isPending}>
              {isPublished ? "Unpublish (save as draft)" : "Save draft"}
            </Button>
          )}
          {hasStatus ? (
            <Button
              onClick={() => onSave("published")}
              disabled={save.isPending || publishIssues.length > 0}
            >
              {isPublished ? "Save & keep published" : "Publish"}
            </Button>
          ) : (
            <Button onClick={() => onSave()} disabled={save.isPending}>Save</Button>
          )}
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}


/**
 * Uploads to the private `training-assets` bucket and stores only the object
 * path — readers resolve it later through a short-lived signed URL.
 */
function AttachmentField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const upload = useUploadAcademyAsset();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input value={value} readOnly placeholder="No file attached" className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
        {value && (
          <Button type="button" variant="ghost" onClick={() => onChange("")}>
            Remove
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          upload.mutate(file, {
            onSuccess: (path) => {
              onChange(path);
              toast.success("File uploaded");
            },
          });
        }}
      />
      <p className="text-[11px] text-muted-foreground">
        Stored privately; learners open it through a temporary signed link. Replaced files are
        removed only after the record is saved, and only when no other resource still uses them.
      </p>
    </div>
  );
}

function ReorderButtons({ table, rows, row }: { table: Table; rows: any[]; row: any }) {
  const reorder = useReorderAcademyRecord();
  const entity = table.replace("academy_", "") as "phases" | "modules" | "missions" | "resources";
  const ordered = [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const index = ordered.findIndex((r) => r.id === row.id);
  const save = reorder;

  // One transactional server swap replaces two racing client updates.
  const move = (dir: -1 | 1) => {
    const other = ordered[index + dir];
    if (!other) return;
    reorder.mutate({ entity, a: row.id, b: other.id });
  };


  return (
    <div className="flex flex-col shrink-0">
      <Button variant="ghost" size="icon" className="h-5 w-6" disabled={index <= 0 || save.isPending} onClick={() => move(-1)}>
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-6"
        disabled={index < 0 || index >= ordered.length - 1 || save.isPending}
        onClick={() => move(1)}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const segments = splitContentSegments(value);

  const insert = (snippet: string) => onChange(joinContentSegments([...segments, snippet]));
  const [pickerOpen, setPickerOpen] = useState(false);
  const move = (index: number, dir: -1 | 1) =>
    onChange(joinContentSegments(moveSegment(segments, index, dir)));
  const remove = (index: number) =>
    onChange(joinContentSegments(segments.filter((_, i) => i !== index)));

  const toolbar = (
    <div className="flex flex-wrap gap-1.5">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setPickerOpen(true)}
      >
        <Plus className="h-3 w-3 mr-1" />Insert Asset
      </Button>
      {BLOCK_SNIPPETS.filter((b) => b.id !== "asset").map((b) => (
        <Button key={b.id} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insert(b.snippet)}>
          <Plus className="h-3 w-3 mr-1" />{b.label}
        </Button>
      ))}
    </div>
  );

  const editor = (rows: number) => (
    <Textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Paste Markdown here. Callouts: :::partner-insight … :::"
      className="font-mono text-xs h-full min-h-[320px] resize-y"
    />
  );

  const preview = (
    <div className="rounded-lg border bg-card p-4 overflow-y-auto max-h-[60vh]">
      <MissionContent markdown={value} readOnlyChecklist />
    </div>
  );

  return (
    <>
    <AssetPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onInsert={insert} />
    <Tabs defaultValue="split" className="space-y-3">
      <TabsList>
        <TabsTrigger value="edit">Edit</TabsTrigger>
        <TabsTrigger value="split">Split</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="blocks">Blocks</TabsTrigger>
      </TabsList>

      <TabsContent value="edit" className="space-y-3">
        {toolbar}
        {editor(20)}
      </TabsContent>

      <TabsContent value="split" className="space-y-3">
        {toolbar}
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="min-w-0">{editor(20)}</div>
          <div className="min-w-0">{preview}</div>
        </div>
      </TabsContent>

      <TabsContent value="preview">{preview}</TabsContent>

      <TabsContent value="blocks" className="space-y-2">
        {segments.length === 0 && <p className="text-sm text-muted-foreground">No content blocks yet.</p>}
        {segments.map((seg, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border p-2">
            <pre className="min-w-0 flex-1 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{seg}</pre>
            <div className="flex flex-col shrink-0">
              <Button type="button" variant="ghost" size="icon" className="h-5 w-6" disabled={i === 0} onClick={() => move(i, -1)}>
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-6"
                disabled={i === segments.length - 1}
                onClick={() => move(i, 1)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => remove(i)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </TabsContent>
    </Tabs>
    </>
  );
}


// ── Optional structured experience (Mission Player v2) ───────────────────

/** Normalises a `json` field value (object from the DB, or edited text). */
function parseJsonField(raw: unknown): { ok: true; value: unknown } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: true, value: raw };
  if (raw.trim() === "") return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function toJsonText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

/**
 * Optional JSON editor for `academy_missions.content_json`. Empty means the
 * mission keeps the legacy Markdown player; a payload is only accepted when it
 * validates against the Mission Player v2 schema.
 */
function JsonExperienceField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: string) => void;
}) {
  const text = toJsonText(value);
  const parsed = parseJsonField(text);

  let status: { tone: "ok" | "warn" | "error"; message: string; errors?: string[] };
  if (!parsed.ok) {
    status = { tone: "error", message: "Invalid JSON — this record cannot be saved yet." };
  } else if (parsed.value === null) {
    status = { tone: "ok", message: "Empty — this mission uses the standard Markdown player." };
  } else if (!isMissionPlayerV2(parsed.value)) {
    status = {
      tone: "warn",
      message: `Stored as-is. The guided player only activates when "kind" is "${MISSION_PLAYER_V2_KIND}".`,
    };
  } else {
    const result = validateMissionExperience(parsed.value);
    status = result.ok
      ? { tone: "ok", message: `Valid experience — ${result.experience.steps.length} steps.` }
      : { tone: "error", message: "Experience JSON is invalid:", errors: result.errors };
  }

  return (
    <div className="space-y-2">
      <Textarea
        id="content_json"
        rows={12}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder='Leave empty for the standard Markdown mission. Paste an "academy-learning-experience-v2" payload to enable the guided player.'
        className="font-mono text-xs resize-y"
      />
      <div
        className={
          status.tone === "error"
            ? "text-xs text-destructive"
            : status.tone === "warn"
              ? "text-xs text-amber-600 dark:text-amber-400"
              : "text-xs text-muted-foreground"
        }
      >
        <p>{status.message}</p>
        {status.errors && (
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            {status.errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
