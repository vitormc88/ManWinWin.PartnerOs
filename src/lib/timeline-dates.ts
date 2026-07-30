/**
 * PHASE 3 — Timeline date semantics.
 *
 * Three distinct classes of date:
 *   a) occurred_at / effective_date — when the event happened in the business;
 *   b) recorded_at / created_at     — when PartnerOS recorded it;
 *   c) imported_at                  — when it entered via import/sync.
 *
 * `lifecycle_events.occurred_at` is NOT NULL in production, so historical rows
 * created by an import may carry the technical timestamp in that column. We only
 * treat `occurred_at` as a real business date when it is not explicitly marked
 * as unknown/imported in the event metadata and does not coincide with the
 * technical record timestamp of an imported row.
 */

export interface RawTimelineEvent {
  id: string;
  occurred_at?: string | null;
  created_at?: string | null;
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
  const importedAt = metaString(meta, "imported_at");
  const effective = metaString(meta, "effective_date") ?? metaString(meta, "occurred_on");
  const rawOccurred = validDate(event.occurred_at);

  const explicitlyUnknown =
    meta?.occurred_at_known === false ||
    meta?.occurred_at_source === "import" ||
    meta?.occurred_at_source === "record_created";

  // An imported row whose occurred_at simply mirrors the technical timestamp
  // carries no real historical date.
  const mirrorsTechnical =
    !!rawOccurred &&
    ((!!importedAt && Date.parse(rawOccurred) === Date.parse(importedAt)) ||
      (!!recordedAt && !!importedAt && Date.parse(rawOccurred) === Date.parse(recordedAt)));

  const occurredAt = effective ?? (explicitlyUnknown || mirrorsTechnical ? null : rawOccurred);
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
