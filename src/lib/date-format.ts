// Locale-aware formatting for date-only (yyyy-MM-dd) values.
// Parsing is done on the calendar parts so there is never a timezone day shift.

export function parseDateOnly(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Renders "08 Aug 2026" style dates, consistent with client detail. */
export function formatDateOnly(
  value: string | Date | null | undefined,
  fallback = "—"
): string {
  const d = parseDateOnly(value);
  if (!d) return fallback;
  const parts = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const month = get("month").replace(/\.$/, "");
  return `${get("day")} ${month} ${get("year")}`;
}

/** True when the date-only value falls on the local calendar day `today`. */
export function isSameLocalDay(value: string | Date | null | undefined, today = new Date()): boolean {
  const d = parseDateOnly(value);
  if (!d) return false;
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}
