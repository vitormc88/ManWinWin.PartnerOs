/**
 * Partner Academy — pure domain helpers.
 *
 * Content lives in the database (academy_phases / academy_modules /
 * academy_missions / academy_resources). Nothing here hardcodes course text.
 */

export type PublicationStatus = "draft" | "published" | "archived";

export type ModuleProgressStatus =
  | "not_started"
  | "in_progress"
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
}

export interface MissionProgressRow {
  mission_id: string;
  module_id: string;
  is_completed: boolean;
}

/** Simple UI status shown to partners in iteration 1. */
export type SimpleStatus = "Not Started" | "In Progress" | "Completed";

export function simpleStatus(status: ModuleProgressStatus | undefined): SimpleStatus {
  switch (status) {
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

/** Items that count towards progress: published, not locked. */
export function countableMissions(missions: AcademyMission[]): AcademyMission[] {
  return missions.filter((m) => m.status === "published" && !m.is_locked);
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

export function deriveModuleStatus(pct: number): ModuleProgressStatus {
  if (pct >= 100) return "certified";
  if (pct > 0) return "in_progress";
  return "not_started";
}

export function actionLabel(pct: number): "Start" | "Continue" | "Review" {
  if (pct >= 100) return "Review";
  if (pct > 0) return "Continue";
  return "Start";
}

/** First countable, not-yet-completed mission of a module (else the first one). */
export function nextMission(
  missions: AcademyMission[],
  completedMissionIds: Set<string>
): AcademyMission | undefined {
  const ordered = [...missions].sort((a, b) => a.sort_order - b.sort_order);
  return (
    ordered.find((m) => !m.is_locked && !completedMissionIds.has(m.id)) ?? ordered[0]
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

/** Missions are unlocked sequentially: previous countable mission completed. */
export function isMissionUnlocked(
  missions: AcademyMission[],
  mission: AcademyMission,
  completedMissionIds: Set<string>
): boolean {
  if (mission.is_locked) return false;
  const ordered = countableMissions(missions).sort((a, b) => a.sort_order - b.sort_order);
  const idx = ordered.findIndex((m) => m.id === mission.id);
  if (idx <= 0) return true;
  return completedMissionIds.has(ordered[idx - 1].id);
}
