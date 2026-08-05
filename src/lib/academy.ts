/**
 * Partner Academy — pure domain helpers.
 *
 * Content lives in the database (academy_phases / academy_modules /
 * academy_missions / academy_resources). Nothing here hardcodes course text.
 */

export type PublicationStatus = "draft" | "published" | "archived";

/**
 * Server-side module progress vocabulary.
 *
 * `completed` means every countable learning item is done. `certified` is
 * reserved for a future server-validated certification flow and is never
 * self-awarded by the browser.
 */
export type ModuleProgressStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "ready_for_certification"
  | "certification_failed"
  | "certified";


export type MissionItemKind =
  | "intro"
  | "mission"
  | "exercise"
  | "summary"
  | "checklist"
  | "certification";

export interface AcademyPhase {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  status: PublicationStatus;
}

export interface AcademyModule {
  id: string;
  phase_id: string | null;
  title: string;
  slug: string;
  short_description: string | null;
  full_description: string | null;
  estimated_duration_minutes: number;
  sort_order: number;
  status: PublicationStatus;
  version: number;
  certification_enabled: boolean;
  difficulty: string;
  updated_at?: string | null;
}

export interface AcademyMission {
  id: string;
  module_id: string;
  mission_number: number;
  title: string;
  slug: string;
  short_description: string | null;
  estimated_duration_minutes: number;
  content_markdown: string | null;
  item_kind: MissionItemKind;
  is_locked: boolean;
  sort_order: number;
  is_required: boolean;
  status: PublicationStatus;
  version: number;
}

export interface AcademyResource {
  id: string;
  module_id: string | null;
  mission_id: string | null;
  title: string;
  resource_type: string;
  content: string | null;
  file_path: string | null;
  is_downloadable: boolean;
  sort_order: number;
  status: PublicationStatus;
  description?: string | null;
  external_url?: string | null;
  version?: string | null;
  updated_at?: string | null;
}

export interface MissionProgressRow {
  mission_id: string;
  module_id: string;
  is_completed: boolean;
  checklist_state?: ChecklistState | null;
}

/** Simple UI status shown to partners. */
export type SimpleStatus = "Not Started" | "In Progress" | "Completed";

export function simpleStatus(status: ModuleProgressStatus | undefined): SimpleStatus {
  switch (status) {
    case "completed":
    case "certified":
      return "Completed";
    case "in_progress":
    case "ready_for_certification":
    case "certification_failed":
      return "In Progress";
    default:
      return "Not Started";
  }
}

/**
 * Items that count towards module progress.
 *
 * `is_locked` means "sequentially gated", NOT "excluded": a locked mission is
 * still countable, otherwise a module would reach 100% before the learner can
 * even open the gated item. Certification items are excluded because
 * certification is never self-awarded by the browser.
 */
export function countableMissions(missions: AcademyMission[]): AcademyMission[] {
  return missions.filter(
    (m) => m.status === "published" && m.is_required && m.item_kind !== "certification"
  );
}

export function moduleProgressPct(
  missions: AcademyMission[],
  completedMissionIds: Set<string>
): number {
  const countable = countableMissions(missions);
  if (countable.length === 0) return 0;
  const done = countable.filter((m) => completedMissionIds.has(m.id)).length;
  return Math.round((done / countable.length) * 100);
}

/**
 * Local, optimistic mirror of the server-derived status. 100% completion is
 * `completed` — never `certified`.
 */
export function deriveModuleStatus(pct: number): ModuleProgressStatus {
  if (pct >= 100) return "completed";
  if (pct > 0) return "in_progress";
  return "not_started";
}

export function actionLabel(pct: number): "Start" | "Continue" | "Review" {
  if (pct >= 100) return "Review";
  if (pct > 0) return "Continue";
  return "Start";
}

/**
 * First published, incomplete mission that is currently unlocked — including a
 * formerly locked mission once its prerequisite is complete.
 */
export function nextMission(
  missions: AcademyMission[],
  completedMissionIds: Set<string>
): AcademyMission | undefined {
  const ordered = [...missions]
    .filter((m) => m.status === "published")
    .sort((a, b) => a.sort_order - b.sort_order);
  return (
    ordered.find(
      (m) => !completedMissionIds.has(m.id) && isMissionUnlocked(ordered, m, completedMissionIds)
    ) ?? ordered[0]
  );
}


export function formatDuration(minutes: number | null | undefined): string {
  const m = minutes ?? 0;
  if (m <= 0) return "—";
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}min`;
}

// ── Content callouts ──────────────────────────────────────────────────────
export const CALLOUT_KINDS = [
  "partner-insight",
  "best-practice",
  "warning-sign",
  "real-example",
  "partneros-action",
  "key-takeaways",
] as const;

export type CalloutKind = (typeof CALLOUT_KINDS)[number];

export const CALLOUT_LABELS: Record<CalloutKind, string> = {
  "partner-insight": "Partner Insight",
  "best-practice": "Best Practice",
  "warning-sign": "Warning Sign",
  "real-example": "Real Example",
  "partneros-action": "PartnerOS Action",
  "key-takeaways": "Key Takeaways",
};


export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "callout"; kind: CalloutKind; text: string };

/**
 * Splits markdown into plain-text blocks and `:::kind ... :::` callout blocks.
 * Unknown callout kinds are preserved as plain text (never dropped).
 */
export function parseContentBlocks(markdown: string | null | undefined): ContentBlock[] {
  if (!markdown) return [];
  const blocks: ContentBlock[] = [];
  const regex = /:::([a-z-]+)\s*\n([\s\S]*?):::/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (text: string) => {
    if (text.trim().length > 0) blocks.push({ type: "text", text: text.trim() });
  };

  while ((match = regex.exec(markdown)) !== null) {
    pushText(markdown.slice(lastIndex, match.index));
    const kind = match[1] as CalloutKind;
    const body = match[2].trim();
    if ((CALLOUT_KINDS as readonly string[]).includes(kind)) {
      blocks.push({ type: "callout", kind, text: body });
    } else {
      pushText(match[0]);
    }
    lastIndex = regex.lastIndex;
  }
  pushText(markdown.slice(lastIndex));
  return blocks;
}

// ── Rich content blocks (reusable across every Academy module) ────────────
export type RichBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbered"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "divider" }
  | { type: "callout"; kind: CalloutKind; blocks: RichBlock[] }
  | { type: "checklist"; key: string; items: string[] };

const FENCE = /:::([a-z-]+)\s*\n([\s\S]*?):::/g;

/** Parses a fence-free markdown chunk into rich blocks. */
export function parseMarkdownBlocks(source: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  const lines = source.split("\n");
  let i = 0;

  const isTableRow = (l: string) => l.trim().startsWith("|") && l.trim().endsWith("|");
  const cells = (l: string) =>
    l.trim().slice(1, -1).split("|").map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) { i++; continue; }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { blocks.push({ type: "divider" }); i++; continue; }

    const heading = /^(#{1,3})\s+(.*)$/.exec(t);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() });
      i++;
      continue;
    }

    if (isTableRow(t) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      const headers = cells(t);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(cells(lines[i]));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (/^>\s?/.test(t)) {
      const parts: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        parts.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", text: parts.join("\n").trim() });
      continue;
    }

    if (/^[-*]\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "bullets", items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ type: "numbered", items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (!cur || /^(#{1,3})\s+/.test(cur) || /^[-*]\s+/.test(cur) || /^\d+[.)]\s+/.test(cur) ||
          /^>\s?/.test(cur) || isTableRow(cur) || /^(-{3,}|\*{3,}|_{3,})$/.test(cur)) break;
      paragraph.push(cur);
      i++;
    }
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

/**
 * Full mission renderer input: markdown plus reusable `:::kind ... :::` blocks
 * (the five callouts, `key-takeaways` and `checklist`). Unknown fences are
 * preserved as plain text so no authored content is ever lost.
 */
export function parseRichBlocks(markdown: string | null | undefined): RichBlock[] {
  if (!markdown) return [];
  const out: RichBlock[] = [];
  let lastIndex = 0;
  let checklistCount = 0;
  let match: RegExpExecArray | null;
  FENCE.lastIndex = 0;

  const pushMd = (text: string) => {
    if (text.trim()) out.push(...parseMarkdownBlocks(text));
  };

  while ((match = FENCE.exec(markdown)) !== null) {
    pushMd(markdown.slice(lastIndex, match.index));
    const kind = match[1];
    const body = match[2].trim();
    if ((CALLOUT_KINDS as readonly string[]).includes(kind)) {
      out.push({ type: "callout", kind: kind as CalloutKind, blocks: parseMarkdownBlocks(body) });
    } else if (kind === "checklist") {
      const items = body
        .split("\n")
        .map((l) => l.trim().replace(/^[-*]\s+/, "").replace(/^\[[ xX]\]\s*/, ""))
        .filter(Boolean);
      out.push({ type: "checklist", key: `checklist-${checklistCount++}`, items });
    } else {
      pushMd(match[0]);
    }
    lastIndex = FENCE.lastIndex;
  }
  pushMd(markdown.slice(lastIndex));
  return out;
}

/** Every checklist item in a mission, as stable `key#index` ids. */
export function checklistItemIds(markdown: string | null | undefined): string[] {
  return parseRichBlocks(markdown)
    .filter((b): b is Extract<RichBlock, { type: "checklist" }> => b.type === "checklist")
    .flatMap((b) => b.items.map((_, idx) => `${b.key}#${idx}`));
}

export type ChecklistState = Record<string, boolean>;

export function checklistCompletion(
  markdown: string | null | undefined,
  state: ChecklistState | null | undefined
): { total: number; done: number; allDone: boolean } {
  const ids = checklistItemIds(markdown);
  const done = ids.filter((id) => state?.[id]).length;
  return { total: ids.length, done, allDone: ids.length === 0 || done === ids.length };
}

// ── Difficulty & resources ───────────────────────────────────────────────
export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export function difficultyLabel(value: string | null | undefined): string {
  const v = (value ?? "beginner").toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export const RESOURCE_TYPES = [
  "pdf",
  "checklist",
  "word",
  "powerpoint",
  "template",
  "video",
  "link",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  pdf: "PDF",
  checklist: "Checklist",
  word: "Word",
  powerpoint: "PowerPoint",
  template: "Template",
  video: "Video",
  link: "External Link",
};

export function resourceTypeLabel(value: string | null | undefined): string {
  const v = (value ?? "").toLowerCase();
  return (RESOURCE_TYPE_LABELS as Record<string, string>)[v] ?? (value || "Resource");
}

export function formatUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * A mission flagged as locked unlocks automatically once the previous mission
 * in the module is completed. Unflagged missions are always accessible.
 */
export function isMissionUnlocked(
  missions: AcademyMission[],
  mission: AcademyMission,
  completedMissionIds: Set<string>
): boolean {
  if (!mission.is_locked) return true;
  const ordered = [...missions]
    .filter((m) => m.status === "published")
    .sort((a, b) => a.sort_order - b.sort_order);
  const idx = ordered.findIndex((m) => m.id === mission.id);
  if (idx <= 0) return true;
  return completedMissionIds.has(ordered[idx - 1].id);
}

// ── Authoring helpers (admin content editor) ─────────────────────────────
/**
 * Splits raw markdown into editable segments: each `:::fence:::` block stays
 * whole, plain markdown is split on blank lines. Round-trips losslessly
 * (modulo blank-line normalisation) so segments can be reordered safely.
 */
export function splitContentSegments(markdown: string | null | undefined): string[] {
  if (!markdown || !markdown.trim()) return [];
  const segments: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  FENCE.lastIndex = 0;

  const pushPlain = (chunk: string) => {
    chunk
      .split(/\n\s*\n/)
      .map((c) => c.trim())
      .filter(Boolean)
      .forEach((c) => segments.push(c));
  };

  while ((match = FENCE.exec(markdown)) !== null) {
    pushPlain(markdown.slice(lastIndex, match.index));
    segments.push(match[0].trim());
    lastIndex = FENCE.lastIndex;
  }
  pushPlain(markdown.slice(lastIndex));
  return segments;
}

export function joinContentSegments(segments: string[]): string {
  return segments.filter((s) => s.trim()).join("\n\n");
}

export function moveSegment(segments: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (index < 0 || index >= segments.length || target < 0 || target >= segments.length) {
    return segments;
  }
  const next = [...segments];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Insertable block snippets available in the admin editor. */
export const BLOCK_SNIPPETS: Array<{ id: string; label: string; snippet: string }> = [
  { id: "heading", label: "Heading", snippet: "## Heading" },
  { id: "paragraph", label: "Paragraph", snippet: "Write your paragraph here." },
  { id: "bullets", label: "Bullet List", snippet: "- First item\n- Second item" },
  { id: "numbered", label: "Numbered List", snippet: "1. First step\n2. Second step" },
  { id: "quote", label: "Quote", snippet: "> Quoted text" },
  { id: "table", label: "Table", snippet: "| Column A | Column B |\n| --- | --- |\n| Value | Value |" },
  { id: "divider", label: "Divider", snippet: "---" },
  { id: "partner-insight", label: "Partner Insight", snippet: ":::partner-insight\nInsight text\n:::" },
  { id: "best-practice", label: "Best Practice", snippet: ":::best-practice\nBest practice text\n:::" },
  { id: "warning-sign", label: "Warning Sign", snippet: ":::warning-sign\nWarning text\n:::" },
  { id: "real-example", label: "Real Example", snippet: ":::real-example\nExample text\n:::" },
  { id: "partneros-action", label: "PartnerOS Action", snippet: ":::partneros-action\nAction to take in PartnerOS\n:::" },
  { id: "key-takeaways", label: "Key Takeaways", snippet: ":::key-takeaways\n- Takeaway one\n- Takeaway two\n:::" },
  { id: "checklist", label: "Checklist", snippet: ":::checklist\n- First check\n- Second check\n:::" },
];

// ── Inline markdown (bold / italic / code / links) ────────────────────────
export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "bold-italic"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

const INLINE =
  /(\*\*\*(.+?)\*\*\*|___(.+?)___|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;

/** Parses inline emphasis, code and links. Unmatched syntax stays literal. */
export function parseInline(source: string | null | undefined): InlineNode[] {
  const text = source ?? "";
  if (!text) return [];
  const nodes: InlineNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;

  const push = (t: string) => {
    if (t) nodes.push({ type: "text", text: t });
  };

  while ((m = INLINE.exec(text)) !== null) {
    push(text.slice(last, m.index));
    if (m[2] !== undefined || m[3] !== undefined) {
      nodes.push({ type: "bold-italic", text: (m[2] ?? m[3]) as string });
    } else if (m[4] !== undefined || m[5] !== undefined) {
      nodes.push({ type: "bold", text: (m[4] ?? m[5]) as string });
    } else if (m[6] !== undefined || m[7] !== undefined) {
      nodes.push({ type: "italic", text: (m[6] ?? m[7]) as string });
    } else if (m[8] !== undefined) {
      nodes.push({ type: "code", text: m[8] });
    } else if (m[9] !== undefined && m[10] !== undefined) {
      nodes.push({ type: "link", text: m[9], href: m[10] });
    }
    last = INLINE.lastIndex;
  }
  push(text.slice(last));
  return nodes;
}

/** Strips inline markdown, useful for TOC entries and reading-time counts. */
export function plainText(source: string | null | undefined): string {
  return parseInline(source)
    .map((n) => n.text)
    .join("");
}

// ── Table of contents & reading time ─────────────────────────────────────
export function slugifyHeading(text: string): string {
  return (
    plainText(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "section"
  );
}

export interface TocEntry {
  id: string;
  level: 1 | 2 | 3;
  text: string;
}

/** Stable, de-duplicated heading ids for the mission body and its TOC. */
export function headingToc(markdown: string | null | undefined): TocEntry[] {
  const seen = new Map<string, number>();
  return parseRichBlocks(markdown)
    .filter((b): b is Extract<RichBlock, { type: "heading" }> => b.type === "heading")
    .map((b) => {
      const base = slugifyHeading(b.text);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return {
        id: count === 0 ? base : `${base}-${count + 1}`,
        level: b.level,
        text: plainText(b.text),
      };
    });
}

const WORDS_PER_MINUTE = 200;

export function countWords(markdown: string | null | undefined): number {
  const flat = (markdown ?? "")
    .replace(/:::[a-z-]+/g, " ")
    .replace(/:::/g, " ")
    .replace(/[#>*_`|-]/g, " ");
  return flat.split(/\s+/).filter(Boolean).length;
}

/** Reading time in minutes (minimum 1 when there is any content). */
export function readingTimeMinutes(markdown: string | null | undefined): number {
  const words = countWords(markdown);
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function formatReadingTime(markdown: string | null | undefined): string {
  const minutes = readingTimeMinutes(markdown);
  return minutes === 0 ? "—" : `${minutes} min read`;
}

// ── Reading position memory ──────────────────────────────────────────────
export function readingPositionKey(missionId: string): string {
  return `academy:reading-position:${missionId}`;
}

export function saveReadingPosition(missionId: string, scrollY: number): void {
  try {
    if (scrollY > 40) localStorage.setItem(readingPositionKey(missionId), String(Math.round(scrollY)));
    else localStorage.removeItem(readingPositionKey(missionId));
  } catch {
    /* storage unavailable */
  }
}

export function loadReadingPosition(missionId: string): number {
  try {
    const raw = localStorage.getItem(readingPositionKey(missionId));
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function clearReadingPosition(missionId: string): void {
  try {
    localStorage.removeItem(readingPositionKey(missionId));
  } catch {
    /* storage unavailable */
  }
}

// ── Editor draft autosave ────────────────────────────────────────────────
/** Local drafts are namespaced per authenticated user, table and record. */
export function draftKey(
  table: string,
  recordId: string | undefined,
  userId?: string | null
): string {
  return `academy:draft:${userId ?? "anon"}:${table}:${recordId ?? "new"}`;
}

export interface AcademyDraftEnvelope<T = Record<string, unknown>> {
  /** `updated_at` of the server record the draft was branched from. */
  baseUpdatedAt: string | null;
  savedAt: string;
  form: T;
}

/**
 * A local draft is stale when the server record changed after the draft was
 * branched — saving it blindly would silently overwrite someone else's edit.
 */
export function isDraftStale(
  baseUpdatedAt: string | null | undefined,
  serverUpdatedAt: string | null | undefined
): boolean {
  if (!serverUpdatedAt) return false;
  if (!baseUpdatedAt) return true;
  const base = new Date(baseUpdatedAt).getTime();
  const server = new Date(serverUpdatedAt).getTime();
  if (Number.isNaN(base) || Number.isNaN(server)) return false;
  return server > base;
}

// ── Safe URLs & attachments ──────────────────────────────────────────────
/** Only absolute http/https URLs are accepted for external resources. */
export function isSafeExternalUrl(value: string | null | undefined): boolean {
  const raw = (value ?? "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const ACADEMY_STORAGE_BUCKET = "training-assets";
export const ACADEMY_STORAGE_PREFIX = "academy";
/** Matches the existing private training-assets bucket limit (100 MB). */
export const ACADEMY_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const ACADEMY_ALLOWED_UPLOAD_EXTENSIONS = [
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv", "md", "txt", "zip",
  "png", "jpg", "jpeg", "webp", "mp4",
] as const;

export function fileExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx < 0 ? "" : name.slice(idx + 1).toLowerCase();
}

/** Returns an error message, or null when the file may be uploaded. */
export function validateAcademyUpload(file: { name: string; size: number }): string | null {
  const ext = fileExtension(file.name);
  if (!ext) return "File must have an extension.";
  if (!(ACADEMY_ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
    return `Unsupported file type ".${ext}". Allowed: ${ACADEMY_ALLOWED_UPLOAD_EXTENSIONS.join(", ")}.`;
  }
  if (file.size <= 0) return "File is empty.";
  if (file.size > ACADEMY_MAX_UPLOAD_BYTES) {
    return `File is larger than ${Math.round(ACADEMY_MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`;
  }
  return null;
}

/** Private object path inside the training-assets bucket (never a public URL). */
export function academyObjectPath(fileName: string): string {
  const ext = fileExtension(fileName);
  const base = fileName
    .slice(0, ext ? fileName.length - ext.length - 1 : undefined)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "file";
  const stamp = Date.now().toString(36);
  return `${ACADEMY_STORAGE_PREFIX}/${base}-${stamp}${ext ? `.${ext}` : ""}`;
}

// ── Publication validation ───────────────────────────────────────────────
export type AcademyTable =
  | "academy_phases"
  | "academy_modules"
  | "academy_missions"
  | "academy_resources";

export interface PublicationContext {
  /** Existing slugs for the same scope, excluding the record being edited. */
  siblingSlugs?: string[];
  /** Publication status of the selected parent, when there is one. */
  parentStatus?: PublicationStatus | null;
  /** Item kind of the mission a resource is attached to, when relevant. */
  missionModuleId?: string | null;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string | null | undefined): boolean {
  return SLUG_RE.test((slug ?? "").trim());
}

/**
 * Blocking issues that must be resolved before a record can be published.
 * Returns an empty list when the record is publishable.
 */
export function validatePublication(
  table: AcademyTable,
  record: Record<string, unknown>,
  ctx: PublicationContext = {}
): string[] {
  const issues: string[] = [];
  const str = (key: string) => String(record[key] ?? "").trim();

  if (!str("title")) issues.push("Title is required.");

  if (table === "academy_modules" || table === "academy_missions") {
    const slug = str("slug");
    if (!slug) issues.push("Slug is required.");
    else if (!isValidSlug(slug)) issues.push("Slug must be lowercase words separated by hyphens.");
    else if ((ctx.siblingSlugs ?? []).includes(slug)) issues.push("Slug is already used.");
  }

  if (table === "academy_missions") {
    if (!str("module_id")) issues.push("A parent module is required.");
    const kind = (record.item_kind as string) ?? "mission";
    const needsContent = kind !== "certification";
    if (needsContent && !str("content_markdown")) {
      issues.push("Mission content cannot be empty when publishing.");
    }
  }

  if (table === "academy_resources") {
    if (!str("module_id") && !str("mission_id")) {
      issues.push("A resource must belong to a module or a mission.");
    }
    const type = str("resource_type");
    if (!(RESOURCE_TYPES as readonly string[]).includes(type)) {
      issues.push("A valid resource type is required.");
    }
    const external = str("external_url");
    if (external && !isSafeExternalUrl(external)) {
      issues.push("External URL must be a valid http(s) address.");
    }
    const hasSource = !!external || !!str("file_path") || !!str("content");
    if (!hasSource) issues.push("Add a file, an external URL or inline content.");
    if ((type === "link" || type === "video") && !external) {
      issues.push("Links and videos require an external URL.");
    }
  }

  if (ctx.parentStatus && ctx.parentStatus !== "published") {
    issues.push(`The parent is "${ctx.parentStatus}" — publish it first or this content stays hidden.`);
  }

  return issues;
}

/** Published content must be archived/unpublished before it can be deleted. */
export function canHardDelete(status: string | null | undefined): boolean {
  return status !== "published";
}

