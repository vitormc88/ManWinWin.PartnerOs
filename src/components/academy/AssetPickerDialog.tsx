import { useMemo, useState } from "react";
import { Check, Clock, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AssetThumbnail } from "./AssetThumbnail";
import { useAcademyAssets } from "@/hooks/useAcademyAssets";
import {
  ASSET_CATEGORIES,
  allAssetTags,
  assetCategoryLabel,
  assetSnippet,
  assetTypeLabel,
  filterAssets,
  loadRecentAssetKeys,
  rememberRecentAssetKey,
  type AcademyAsset,
} from "@/lib/academy-assets";

const ANY = "__any__";

/**
 * "+ Insert Asset" picker. Selecting an asset returns the `:::asset` snippet so
 * editors never type markdown by hand.
 */
export function AssetPickerDialog({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (snippet: string) => void;
}) {
  const { data: assets, isLoading } = useAcademyAssets();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ANY);
  const [tag, setTag] = useState(ANY);
  const [view, setView] = useState<"all" | "recent" | "new">("all");
  const [selected, setSelected] = useState<AcademyAsset | null>(null);

  const usable = useMemo(
    () => (assets ?? []).filter((a) => a.status !== "archived"),
    [assets]
  );
  const tags = useMemo(() => allAssetTags(usable), [usable]);
  const recentKeys = useMemo(() => (open ? loadRecentAssetKeys() : []), [open]);

  const results = useMemo(() => {
    const base = filterAssets(usable, {
      search,
      category: category === ANY ? undefined : category,
      tag: tag === ANY ? undefined : tag,
    });
    if (view === "recent") {
      return recentKeys
        .map((k) => base.find((a) => a.asset_key === k))
        .filter((a): a is AcademyAsset => !!a);
    }
    if (view === "new") {
      return [...base].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 24);
    }
    return base;
  }, [usable, search, category, tag, view, recentKeys]);

  const insert = () => {
    if (!selected) return;
    rememberRecentAssetKey(selected.asset_key);
    onInsert(assetSnippet(selected.asset_key));
    onOpenChange(false);
    setSelected(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Insert Asset</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, key, tag…"
              className="pl-8"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All categories</SelectItem>
              {ASSET_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{assetCategoryLabel(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-1.5">
          {([
            ["all", "All"],
            ["recent", "Recently Used"],
            ["new", "Recently Uploaded"],
          ] as const).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={view === value ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setView(value)}
            >
              {value === "recent" && <Clock className="h-3.5 w-3.5 mr-1.5" />}
              {label}
            </Button>
          ))}
        </div>

        <div className="max-h-[46vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-4">Loading assets…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No assets match these filters.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {results.map((asset) => {
                const active = selected?.id === asset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setSelected(asset)}
                    onDoubleClick={() => { setSelected(asset); insert(); }}
                    className={`text-left rounded-lg border p-2 space-y-2 transition-colors hover:bg-accent ${
                      active ? "border-primary ring-1 ring-primary" : ""
                    }`}
                  >
                    <AssetThumbnail asset={asset} />
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-foreground line-clamp-1">{asset.title}</p>
                      <p className="text-[10px] text-muted-foreground font-mono line-clamp-1">
                        {asset.asset_key}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          {assetTypeLabel(asset.asset_type)}
                        </Badge>
                        {asset.status === "draft" && (
                          <Badge variant="secondary" className="text-[10px]">Draft</Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={insert} disabled={!selected}>
            <Check className="h-4 w-4 mr-1.5" />Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
