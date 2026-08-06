/**
 * Partner Academy — Asset Library domain helpers.
 *
 * Content never references physical files. Missions, resources and any future
 * Academy surface embed a reusable asset by key:
 *
 *   :::asset
 *   id: qualification-decision-matrix
 *   caption: Qualification Decision Matrix
 *   width: large
 *   align: center
 *   :::
 *
 * The renderer resolves the key against `academy_assets`. Because every render
 * option lives in the fence body (and unknown options are preserved in
 * `params`), future asset kinds — video, PDF, interactive embeds — need no
 * markdown syntax change.
 */

export type AcademyAssetStatus = "draft" | "published" | "archived";

/** Currently renderable kinds plus the kinds the architecture is ready for. */
export const ASSET_TYPES = [
  "image",
  "diagram",
  "flowchart",
  "decision-tree",
  "table",
  "infographic",
  "screenshot",
  "icon",
  // Future-ready — stored and managed today, richer viewers can be added later.
  "video",
  "gif",
  "pdf",
  "embed",
  "figma",
  "miro",
  "loom",
  "svg-animation",
] as const;

export type AcademyAssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<AcademyAssetType, string> = {
  image: "Image",
  diagram: "Diagram",
  flowchart: "Flowchart",
  "decision-tree": "Decision Tree",
  table: "Table",
  infographic: "Infographic",
  screenshot: "Screenshot",
  icon: "Icon",
  video: "Video",
  gif: "GIF",
  pdf: "PDF",
  embed: "Interactive Embed",
  figma: "Figma",
  miro: "Miro",
  loom: "Loom",
  "svg-animation": "SVG Animation",
};

export const ASSET_CATEGORIES = [
  "frameworks",
  "flowcharts",
  "decision-trees",
  "diagrams",
  "tables",
  "infographics",
  "screenshots",
  "ui",
  "icons",
  "examples",
  "custom",
] as const;

export type AcademyAssetCategory = (typeof ASSET_CATEGORIES)[number];

export function assetTypeLabel(value: string | null | undefined): string {
  const v = (value ?? "").toLowerCase();
  return (ASSET_TYPE_LABELS as Record<string, string>)[v] ?? (value || "Asset");
}

export function assetCategoryLabel(value: string | null | undefined): string {
  const v = (value ?? "").toLowerCase();
  if (!v) return "Custom";
  return v
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export interface AcademyAsset {
  id: string;
  asset_key: string;
  title: string;
  asset_type: string;
  category: string;
  tags: string[];
  description: string | null;
  alt_text: string | null;
  caption: string | null;
  file_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  settings: Record<string, unknown> | null;
  current_version: number;
  status: AcademyAssetStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AcademyAssetVersion {
  id: string;
  asset_id: string;
  version: number;
  file_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  change_notes: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Markdown syntax ───────────────────────────────────────────────────────
export const ASSET_WIDTHS = ["small", "medium", "large", "full"] as const;
export type AssetWidth = (typeof ASSET_WIDTHS)[number];

export const ASSET_ALIGNMENTS = ["left", "center", "right"] as const;
export type AssetAlign = (typeof ASSET_ALIGNMENTS)[number];

export interface AssetReference {
  /** `asset_key` of the referenced asset. */
  id: string;
  caption?: string;
  width: AssetWidth;
  align: AssetAlign;
  /** Any further `key: value` options, kept for forward compatibility. */
  params: Record<string, string>;
}

/** Parses the body of a `:::asset ... :::` fence. Returns null without an id. */
export function parseAssetFence(body: string): AssetReference | null {
  const params: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const m = /^\s*([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    params[m[1].trim().toLowerCase()] = m[2].trim();
  }
  const id = (params.id ?? params.asset ?? params.key ?? "").trim();
  if (!id) return null;
  const width = (ASSET_WIDTHS as readonly string[]).includes(params.width)
    ? (params.width as AssetWidth)
    : "large";
  const align = (ASSET_ALIGNMENTS as readonly string[]).includes(params.align)
    ? (params.align as AssetAlign)
    : "center";
  const ref: AssetReference = { id, width, align, params };
  if (params.caption) ref.caption = params.caption;
  return ref;
}

/** Snippet inserted by the editor's asset picker. */
export function assetSnippet(assetKey: string, caption?: string | null): string {
  const lines = [":::asset", `id: ${assetKey}`];
  if (caption) lines.push(`caption: ${caption}`);
  lines.push(":::");
  return lines.join("\n");
}

/** Every asset key referenced by a markdown document (de-duplicated). */
export function referencedAssetKeys(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  const keys = new Set<string>();
  const fence = /:::asset\s*\n([\s\S]*?):::/g;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(markdown)) !== null) {
    const ref = parseAssetFence(m[1]);
    if (ref) keys.add(ref.id);
  }
  return [...keys];
}

export const ASSET_WIDTH_CLASS: Record<AssetWidth, string> = {
  small: "max-w-xs",
  medium: "max-w-md",
  large: "max-w-2xl",
  full: "max-w-full w-full",
};

export const ASSET_ALIGN_CLASS: Record<AssetAlign, string> = {
  left: "mr-auto",
  center: "mx-auto",
  right: "ml-auto",
};

/** Slugified, collision-resistant key suggestion from a human title. */
export function suggestAssetKey(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "asset"
  );
}

export function isValidAssetKey(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,59}$/.test(value);
}

/** Image-like assets render inline; everything else falls back to a link card. */
export function isInlineImageAsset(asset: Pick<AcademyAsset, "asset_type" | "mime_type">): boolean {
  const type = (asset.asset_type ?? "").toLowerCase();
  if (["video", "pdf", "embed", "figma", "miro", "loom"].includes(type)) return false;
  const mime = (asset.mime_type ?? "").toLowerCase();
  if (mime) return mime.startsWith("image/");
  return true;
}

export function formatFileSize(bytes: number | null | undefined): string {
  const b = bytes ?? 0;
  if (b <= 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Usage tracking ────────────────────────────────────────────────────────
export type AssetUsageSurface =
  | "module"
  | "mission"
  | "resource"
  | "lesson"
  | "certification"
  | "question-explanation";

export interface AssetUsage {
  surface: AssetUsageSurface;
  recordId: string;
  label: string;
}

export interface UsageSource {
  surface: AssetUsageSurface;
  recordId: string;
  label: string;
  markdown: string | null | undefined;
}

/** Maps every asset key to the content records that embed it. */
export function buildAssetUsageIndex(sources: UsageSource[]): Record<string, AssetUsage[]> {
  const index: Record<string, AssetUsage[]> = {};
  for (const source of sources) {
    for (const key of referencedAssetKeys(source.markdown)) {
      (index[key] ??= []).push({
        surface: source.surface,
        recordId: source.recordId,
        label: source.label,
      });
    }
  }
  return index;
}

export const USAGE_SURFACE_LABELS: Record<AssetUsageSurface, string> = {
  module: "Module",
  mission: "Mission",
  resource: "Resource",
  lesson: "Lesson",
  certification: "Certification",
  "question-explanation": "Question Explanation",
};

// ── Filtering ─────────────────────────────────────────────────────────────
export interface AssetFilters {
  search?: string;
  category?: string;
  tag?: string;
  type?: string;
  status?: string;
}

export function filterAssets(assets: AcademyAsset[], filters: AssetFilters): AcademyAsset[] {
  const q = (filters.search ?? "").trim().toLowerCase();
  return assets.filter((a) => {
    if (filters.category && a.category !== filters.category) return false;
    if (filters.type && a.asset_type !== filters.type) return false;
    if (filters.status && a.status !== filters.status) return false;
    if (filters.tag && !(a.tags ?? []).includes(filters.tag)) return false;
    if (!q) return true;
    const haystack = [a.title, a.asset_key, a.description ?? "", a.caption ?? "", ...(a.tags ?? [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** Distinct tags across the library, alphabetically sorted. */
export function allAssetTags(assets: AcademyAsset[]): string[] {
  return [...new Set(assets.flatMap((a) => a.tags ?? []))].sort((a, b) => a.localeCompare(b));
}

export function parseTagInput(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

// ── Recently used (local, per browser) ────────────────────────────────────
const RECENT_KEY = "academy:recent-assets";
const RECENT_LIMIT = 12;

export function loadRecentAssetKeys(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function rememberRecentAssetKey(key: string): void {
  try {
    const next = [key, ...loadRecentAssetKeys().filter((k) => k !== key)].slice(0, RECENT_LIMIT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}
