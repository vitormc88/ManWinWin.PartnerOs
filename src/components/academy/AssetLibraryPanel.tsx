import { useMemo, useState } from "react";
import {
  Grid2x2,
  History,
  Link2,
  List,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { AcademyState } from "./AcademyState";
import { AssetThumbnail } from "./AssetThumbnail";
import { useUploadAcademyAsset } from "@/hooks/useAcademy";
import {
  useAcademyAssetVersions,
  useAcademyAssets,
  useAssetUsageIndex,
  useDeleteAcademyAssetRecord,
  useRestoreAssetVersion,
  useSaveAcademyAsset,
} from "@/hooks/useAcademyAssets";
import {
  ASSET_CATEGORIES,
  ASSET_TYPES,
  USAGE_SURFACE_LABELS,
  allAssetTags,
  assetCategoryLabel,
  assetSnippet,
  assetTypeLabel,
  filterAssets,
  formatFileSize,
  isValidAssetKey,
  parseTagInput,
  suggestAssetKey,
  type AcademyAsset,
} from "@/lib/academy-assets";
import { formatUpdatedAt } from "@/lib/academy";

const ANY = "__any__";
const STATUSES = ["draft", "published", "archived"] as const;

/**
 * Academy Asset Library. Editors upload, version and categorise reusable
 * assets; viewers get the same catalogue read-only.
 */
export function AssetLibraryPanel({ canEdit }: { canEdit: boolean }) {
  const query = useAcademyAssets();
  const { data: assets = [] } = query;
  const { data: usage = {} } = useAssetUsageIndex();

  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ANY);
  const [type, setType] = useState(ANY);
  const [status, setStatus] = useState(ANY);
  const [tag, setTag] = useState(ANY);
  const [editing, setEditing] = useState<Partial<AcademyAsset> | null>(null);
  const [historyFor, setHistoryFor] = useState<AcademyAsset | null>(null);

  const tags = useMemo(() => allAssetTags(assets), [assets]);
  const results = useMemo(
    () =>
      filterAssets(assets, {
        search,
        category: category === ANY ? undefined : category,
        type: type === ANY ? undefined : type,
        status: status === ANY ? undefined : status,
        tag: tag === ANY ? undefined : tag,
      }),
    [assets, search, category, type, status, tag]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Asset Library</h2>
        <div className="flex items-center gap-1.5">
          <Button
            size="icon"
            variant={layout === "grid" ? "secondary" : "ghost"}
            onClick={() => setLayout("grid")}
            aria-label="Grid view"
          >
            <Grid2x2 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant={layout === "list" ? "secondary" : "ghost"}
            onClick={() => setLayout("list")}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => setEditing({ status: "draft", category: "custom", asset_type: "image" })}>
              <Plus className="h-4 w-4 mr-1" />New asset
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets…"
            className="pl-8"
          />
        </div>
        <FilterSelect value={category} onChange={setCategory} placeholder="Category" options={ASSET_CATEGORIES.map((c) => ({ value: c, label: assetCategoryLabel(c) }))} allLabel="All categories" />
        <FilterSelect value={type} onChange={setType} placeholder="Type" options={ASSET_TYPES.map((t) => ({ value: t, label: assetTypeLabel(t) }))} allLabel="All types" />
        <FilterSelect value={status} onChange={setStatus} placeholder="Status" options={STATUSES.map((s) => ({ value: s, label: s }))} allLabel="All statuses" />
        <FilterSelect value={tag} onChange={setTag} placeholder="Tag" options={tags.map((t) => ({ value: t, label: t }))} allLabel="All tags" />
      </div>

      {query.isError ? (
        <AcademyState kind="error" error={query.error} onRetry={query.refetch} />
      ) : query.isLoading ? (
        <AcademyState kind="loading" />
      ) : results.length === 0 ? (
        <AcademyState kind="empty" title="No assets yet." description="Upload a diagram, flowchart or screenshot to reuse it across missions." />
      ) : layout === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              usageCount={(usage[asset.asset_key] ?? []).length}
              canEdit={canEdit}
              onEdit={() => setEditing(asset)}
              onHistory={() => setHistoryFor(asset)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-xl border shadow-sm divide-y">
          {results.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              usageCount={(usage[asset.asset_key] ?? []).length}
              canEdit={canEdit}
              onEdit={() => setEditing(asset)}
              onHistory={() => setHistoryFor(asset)}
            />
          ))}
        </div>
      )}

      {editing && (
        <AssetDialog
          asset={editing}
          usage={usage[editing.asset_key ?? ""] ?? []}
          existingKeys={assets.filter((a) => a.id !== editing.id).map((a) => a.asset_key)}
          onClose={() => setEditing(null)}
        />
      )}
      {historyFor && (
        <AssetHistoryDialog asset={historyFor} canEdit={canEdit} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  allLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  allLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[150px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AssetMeta({ asset, usageCount }: { asset: AcademyAsset; usageCount: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className="text-[10px]">{assetTypeLabel(asset.asset_type)}</Badge>
      <Badge variant="outline" className="text-[10px]">{assetCategoryLabel(asset.category)}</Badge>
      <Badge variant={asset.status === "published" ? "default" : "secondary"} className="text-[10px]">
        {asset.status}
      </Badge>
      <Badge variant="outline" className="text-[10px]">v{asset.current_version}</Badge>
      <Badge variant="outline" className="text-[10px]">{usageCount} use{usageCount === 1 ? "" : "s"}</Badge>
    </div>
  );
}

function AssetActions({
  canEdit,
  asset,
  onEdit,
  onHistory,
}: {
  canEdit: boolean;
  asset: AcademyAsset;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const del = useDeleteAcademyAssetRecord();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Copy markdown reference"
        onClick={() => {
          navigator.clipboard?.writeText(assetSnippet(asset.asset_key));
          toast.success("Markdown reference copied");
        }}
      >
        <Link2 className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Version history" onClick={onHistory}>
        <History className="h-4 w-4" />
      </Button>
      {canEdit && (
        <>
          <Button variant="ghost" size="icon" aria-label="Edit asset" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete asset" onClick={() => setConfirm(true)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
          <AlertDialog open={confirm} onOpenChange={setConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{asset.title}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  Missions still referencing <code>{asset.asset_key}</code> will show a missing-asset
                  notice. Archive it instead if it is still referenced.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => del.mutate(asset.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  usageCount,
  canEdit,
  onEdit,
  onHistory,
}: {
  asset: AcademyAsset;
  usageCount: number;
  canEdit: boolean;
  onEdit: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 space-y-2 shadow-sm">
      <AssetThumbnail asset={asset} className="h-32 w-full" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground line-clamp-1">{asset.title}</p>
        <p className="text-[11px] font-mono text-muted-foreground line-clamp-1">{asset.asset_key}</p>
        <AssetMeta asset={asset} usageCount={usageCount} />
        {(asset.tags ?? []).length > 0 && (
          <p className="text-[11px] text-muted-foreground line-clamp-1">{asset.tags.join(", ")}</p>
        )}
        <p className="text-[11px] text-muted-foreground">Updated {formatUpdatedAt(asset.updated_at)}</p>
      </div>
      <AssetActions canEdit={canEdit} asset={asset} onEdit={onEdit} onHistory={onHistory} />
    </div>
  );
}

function AssetRow({
  asset,
  usageCount,
  canEdit,
  onEdit,
  onHistory,
}: {
  asset: AcademyAsset;
  usageCount: number;
  canEdit: boolean;
  onEdit: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3">
      <AssetThumbnail asset={asset} className="h-12 w-16 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground truncate">{asset.title}</p>
        <p className="text-[11px] font-mono text-muted-foreground truncate">{asset.asset_key}</p>
        <AssetMeta asset={asset} usageCount={usageCount} />
      </div>
      <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:block">
        {formatUpdatedAt(asset.updated_at)}
      </span>
      <AssetActions canEdit={canEdit} asset={asset} onEdit={onEdit} onHistory={onHistory} />
    </div>
  );
}

/** Create/edit form. Replacing the file bumps the version automatically. */
function AssetDialog({
  asset,
  usage,
  existingKeys,
  onClose,
}: {
  asset: Partial<AcademyAsset>;
  usage: Array<{ surface: string; label: string }>;
  existingKeys: string[];
  onClose: () => void;
}) {
  const save = useSaveAcademyAsset();
  const upload = useUploadAcademyAsset();
  const [form, setForm] = useState<Partial<AcademyAsset>>({ tags: [], ...asset });
  const [tagText, setTagText] = useState((asset.tags ?? []).join(", "));
  const [changeNotes, setChangeNotes] = useState("");

  const set = (patch: Partial<AcademyAsset>) => setForm((f) => ({ ...f, ...patch }));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const path = await upload.mutateAsync(file);
    set({ file_path: path, mime_type: file.type || null, file_size: file.size });
    toast.success("File uploaded — save to publish the new version");
  };

  const submit = () => {
    const key = (form.asset_key ?? suggestAssetKey(form.title ?? "")).trim();
    if (!form.title?.trim()) return toast.error("Title is required.");
    if (!isValidAssetKey(key)) return toast.error("Asset ID must be lowercase letters, numbers and dashes.");
    if (existingKeys.includes(key)) return toast.error("That Asset ID is already used.");
    if (!form.file_path && !form.external_url) return toast.error("Upload a file or provide an external URL.");
    save.mutate(
      {
        id: form.id,
        asset_key: key,
        title: form.title.trim(),
        asset_type: form.asset_type ?? "image",
        category: form.category ?? "custom",
        tags: parseTagInput(tagText),
        description: form.description ?? null,
        alt_text: form.alt_text ?? null,
        caption: form.caption ?? null,
        file_path: form.file_path ?? null,
        external_url: form.external_url ?? null,
        mime_type: form.mime_type ?? null,
        file_size: form.file_size ?? null,
        status: (form.status ?? "draft") as AcademyAsset["status"],
        changeNotes: changeNotes || null,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit asset" : "New asset"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Title">
            <Input
              value={form.title ?? ""}
              onChange={(e) => {
                const title = e.target.value;
                set({ title, asset_key: form.id ? form.asset_key : suggestAssetKey(title) });
              }}
            />
          </Field>
          <Field label="Asset ID (used in content)">
            <Input
              value={form.asset_key ?? ""}
              onChange={(e) => set({ asset_key: e.target.value })}
              className="font-mono"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Type">
              <Select value={form.asset_type ?? "image"} onValueChange={(v) => set({ asset_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{assetTypeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Category">
              <Select value={form.category ?? "custom"} onValueChange={(v) => set({ category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{assetCategoryLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status ?? "draft"}
                onValueChange={(v) => set({ status: v as AcademyAsset["status"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Tags (comma separated)">
            <Input value={tagText} onChange={(e) => setTagText(e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} rows={2} />
          </Field>
          <Field label="Alt text (accessibility)">
            <Input value={form.alt_text ?? ""} onChange={(e) => set({ alt_text: e.target.value })} />
          </Field>
          <Field label="Default caption">
            <Input value={form.caption ?? ""} onChange={(e) => set({ caption: e.target.value })} />
          </Field>

          <Field label="File (private Academy storage)">
            <div className="flex items-center gap-2">
              <Input type="file" onChange={(e) => onFile(e.target.files?.[0])} disabled={upload.isPending} />
              {upload.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {form.file_path && (
              <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                {form.file_path} · {formatFileSize(form.file_size)}
              </p>
            )}
          </Field>
          <Field label="External URL (for embeds: Figma, Miro, Loom, video)">
            <Input value={form.external_url ?? ""} onChange={(e) => set({ external_url: e.target.value })} />
          </Field>
          <Field label="Change notes (recorded in version history)">
            <Input value={changeNotes} onChange={(e) => setChangeNotes(e.target.value)} />
          </Field>

          {usage.length > 0 && (
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground">Used in {usage.length} place(s)</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {usage.slice(0, 8).map((u, i) => (
                  <li key={i}>
                    {USAGE_SURFACE_LABELS[u.surface as keyof typeof USAGE_SURFACE_LABELS] ?? u.surface}: {u.label}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                Replacing the file updates every one of them automatically.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending || upload.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function AssetHistoryDialog({
  asset,
  canEdit,
  onClose,
}: {
  asset: AcademyAsset;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { data: versions = [], isLoading } = useAcademyAssetVersions(asset.id);
  const restore = useRestoreAssetVersion();
  const [compare, setCompare] = useState<string[]>([]);

  const selected = versions.filter((v) => compare.includes(v.id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Version history — {asset.title}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <AcademyState kind="loading" />
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No versions recorded yet.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center gap-3 p-3">
                <AssetThumbnail
                  asset={{ ...asset, file_path: v.file_path, external_url: v.external_url, mime_type: v.mime_type }}
                  className="h-12 w-16 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    v{v.version}
                    {v.version === asset.current_version && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">Current</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {formatUpdatedAt(v.created_at)} · {v.change_notes || "No notes"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={compare.includes(v.id) ? "secondary" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() =>
                    setCompare((c) =>
                      c.includes(v.id) ? c.filter((x) => x !== v.id) : [...c, v.id].slice(-2)
                    )
                  }
                >
                  Compare
                </Button>
                {canEdit && v.version !== asset.current_version && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => restore.mutate({ asset, version: v })}
                    disabled={restore.isPending}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Restore
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {selected.length === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {selected.map((v) => (
              <div key={v.id} className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">v{v.version}</p>
                <AssetThumbnail
                  asset={{ ...asset, file_path: v.file_path, external_url: v.external_url, mime_type: v.mime_type }}
                  className="h-40 w-full"
                />
                <p className="text-[11px] text-muted-foreground">{v.change_notes || "No notes"}</p>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
