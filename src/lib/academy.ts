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
