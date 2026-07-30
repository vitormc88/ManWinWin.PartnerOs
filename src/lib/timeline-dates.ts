/**
 * PHASE 3 / 3B — Timeline date semantics.
 *
 * Three distinct classes of date:
 *   a) occurred_at / effective_date — when the event happened in the business;
 *   b) recorded_at / created_at     — when PartnerOS recorded it;
 *   c) imported_at                  — when it entered via import/sync.
 *
 * The resolver reads the proposed first-class columns (`effective_date`,
 * `imported_at`, `occurred_at_known`) when present, and falls back to the
 * legacy `metadata` keys for rows created before that migration is applied.
 * All new columns are optional, so the UI keeps working with the current
 * `select("*")` shape before any schema change.
 *
 * `lifecycle_events.occurred_at` is NOT NULL in production, so historical rows
 * created by an import may carry the technical timestamp in that column.
 */

/** Event types that describe a technical act, never a historical business date. */
export const TECHNICAL_EVENT_TYPES = new Set(["client_imported", "data_imported", "record_imported"]);

export interface RawTimelineEvent {
  id: string;
  event_type?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  /** Proposed first-class column — real business date. */
  effective_date?: string | null;
  /** Proposed first-class column — when the row entered via import/sync. */
  imported_at?: string | null;
  /** Proposed first-class column — false when occurred_at is not a business date. */
  occurred_at_known?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

export interface TimelineDates {
  /** Real business date, null when unknown. */
  occurredAt: string | null;
  /** When PartnerOS recorded the event. */
  recordedAt: string | null;
  /** When the event entered via import/sync, when known. */
  importedAt: string | null;
  hasRealDate: boolean;
  /** True when the event itself is a technical import act. */
  isTechnicalEvent: boolean;
  /** Deterministic sort key: real date desc, unknown-date events last. */
  sortKey: number;
  /** Secondary metadata line, e.g. "Recorded on …". */
  technicalLabel: string | null;
}

export const HISTORICAL_DATE_UNKNOWN_LABEL = "Historical date unknown";

function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  return validDate(meta?.[key]);
}

function fmt(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function resolveTimelineDates(event: RawTimelineEvent): TimelineDates {
  const meta = event.metadata ?? null;
  const recordedAt = validDate(event.created_at);
  const rawOccurred = validDate(event.occurred_at);

  // a) explicit business date: first-class column, then legacy metadata.
  const effective =
    validDate(event.effective_date) ?? metaString(meta, "effective_date") ?? metaString(meta, "occurred_on");

  // c) import timestamp: first-class column, then legacy metadata.
  let importedAt = validDate(event.imported_at) ?? metaString(meta, "imported_at");

  const isTechnicalEvent = TECHNICAL_EVENT_TYPES.has(String(event.event_type ?? ""));

  const explicitlyUnknown =
    event.occurred_at_known === false ||
    meta?.occurred_at_known === false ||
    meta?.occurred_at_source === "import" ||
    meta?.occurred_at_source === "record_created";

  // An imported row whose occurred_at simply mirrors the technical timestamp
  // carries no real historical date.
  const mirrorsTechnical =
    !!rawOccurred &&
    ((!!importedAt && Date.parse(rawOccurred) === Date.parse(importedAt)) ||
      (!!recordedAt && !!importedAt && Date.parse(rawOccurred) === Date.parse(recordedAt)));

  // A technical import event carries no historical business date unless an
  // explicit effective_date was recorded. Its own timestamp IS the import date.
  if (isTechnicalEvent && !effective) {
    importedAt = importedAt ?? rawOccurred ?? recordedAt;
  }

  const occurredAt =
    effective ?? (isTechnicalEvent || explicitlyUnknown || mirrorsTechnical ? null : rawOccurred);
  const hasRealDate = !!occurredAt;

  let technicalLabel: string | null = null;
  if (importedAt) technicalLabel = `Imported on ${fmt(importedAt)}`;
  else if (recordedAt && (!hasRealDate || Date.parse(recordedAt) !== Date.parse(occurredAt!)))
    technicalLabel = `Recorded on ${fmt(recordedAt)}`;

  return {
    occurredAt,
    recordedAt,
    importedAt,
    hasRealDate,
    isTechnicalEvent,
    // Unknown business date sorts last (never injected into history).
    sortKey: hasRealDate ? Date.parse(occurredAt!) : Number.NEGATIVE_INFINITY,
    technicalLabel,
  };
}

export interface DatedTimelineEvent<T extends RawTimelineEvent> {
  event: T;
  dates: TimelineDates;
}

/**
 * Sort newest business date first; events without a real date go last, ordered
 * deterministically by recorded date then id.
 */
export function buildTimeline<T extends RawTimelineEvent>(events: T[]): DatedTimelineEvent<T>[] {
  return events
    .map((event) => ({ event, dates: resolveTimelineDates(event) }))
    .sort((a, b) => {
      if (a.dates.sortKey !== b.dates.sortKey) return b.dates.sortKey - a.dates.sortKey;
      const ar = a.dates.recordedAt ? Date.parse(a.dates.recordedAt) : 0;
      const br = b.dates.recordedAt ? Date.parse(b.dates.recordedAt) : 0;
      if (ar !== br) return br - ar;
      return a.event.id.localeCompare(b.event.id);
    });
}
