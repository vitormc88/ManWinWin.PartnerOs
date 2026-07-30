import { describe, it, expect } from "vitest";
import { resolveTimelineDates, buildTimeline, HISTORICAL_DATE_UNKNOWN_LABEL } from "@/lib/timeline-dates";

describe("timeline date semantics", () => {
  it("uses the real business date when available", () => {
    const d = resolveTimelineDates({
      id: "a",
      occurred_at: "2021-05-04T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(d.occurredAt).toBe("2021-05-04T00:00:00Z");
    expect(d.hasRealDate).toBe(true);
  });

  it("exposes the record timestamp only as secondary metadata", () => {
    const d = resolveTimelineDates({
      id: "a",
      occurred_at: "2021-05-04T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(d.recordedAt).toBe("2026-01-01T00:00:00Z");
    expect(d.technicalLabel).toMatch(/^Recorded on /);
  });

  it("imported events surface an Imported on label", () => {
    const d = resolveTimelineDates({
      id: "a",
      occurred_at: "2015-02-02T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      metadata: { imported_at: "2026-01-01T00:00:00Z" },
    });
    expect(d.importedAt).toBe("2026-01-01T00:00:00Z");
    expect(d.technicalLabel).toMatch(/^Imported on /);
    expect(d.occurredAt).toBe("2015-02-02T00:00:00Z");
  });

  it("an event without a real historical date does not inherit created_at", () => {
    const d = resolveTimelineDates({
      id: "a",
      occurred_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      metadata: { occurred_at_known: false },
    });
    expect(d.occurredAt).toBeNull();
    expect(d.hasRealDate).toBe(false);
    expect(HISTORICAL_DATE_UNKNOWN_LABEL).toBe("Historical date unknown");
  });

  it("an imported row whose occurred_at mirrors the import timestamp is unknown", () => {
    const d = resolveTimelineDates({
      id: "a",
      occurred_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      metadata: { imported_at: "2026-01-01T00:00:00Z" },
    });
    expect(d.hasRealDate).toBe(false);
  });

  it("an explicit effective_date overrides the technical occurred_at", () => {
    const d = resolveTimelineDates({
      id: "a",
      occurred_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      metadata: { imported_at: "2026-01-01T00:00:00Z", effective_date: "2013-09-09" },
    });
    expect(d.occurredAt).toBe("2013-09-09");
    expect(d.hasRealDate).toBe(true);
  });

  it("orders by business date descending, unknown dates last and deterministically", () => {
    const ordered = buildTimeline([
      { id: "unknown-b", occurred_at: "2026-01-01", created_at: "2026-01-01", metadata: { occurred_at_known: false } },
      { id: "old", occurred_at: "2015-01-01", created_at: "2026-01-01" },
      { id: "recent", occurred_at: "2024-06-01", created_at: "2026-01-01" },
      { id: "unknown-a", occurred_at: "2026-01-01", created_at: "2026-01-01", metadata: { occurred_at_known: false } },
    ]);
    expect(ordered.map((o) => o.event.id)).toEqual(["recent", "old", "unknown-a", "unknown-b"]);
  });

  it("does not mutate the source events", () => {
    const event = Object.freeze({ id: "a", occurred_at: "2020-01-01", created_at: "2026-01-01" });
    const ordered = buildTimeline([event]);
    expect(ordered[0].event).toBe(event);
  });

  it("reads the first-class effective_date / imported_at / occurred_at_known columns", () => {
    const d = resolveTimelineDates({
      id: "a",
      event_type: "license_created",
      occurred_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      effective_date: "2014-03-03",
      imported_at: "2026-01-01T00:00:00Z",
    });
    expect(d.occurredAt).toBe("2014-03-03");
    expect(d.importedAt).toBe("2026-01-01T00:00:00Z");
    expect(d.technicalLabel).toMatch(/^Imported on /);
  });

  it("occurred_at_known=false as a column marks the business date unknown", () => {
    const d = resolveTimelineDates({
      id: "a",
      occurred_at: "2020-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      occurred_at_known: false,
    });
    expect(d.hasRealDate).toBe(false);
  });

  it("keeps metadata compatibility for rows created before the migration", () => {
    const d = resolveTimelineDates({
      id: "a",
      occurred_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      metadata: { effective_date: "2012-12-12" },
    });
    expect(d.occurredAt).toBe("2012-12-12");
  });

  // Read-only regression snapshot of the shape confirmed for the Watsons import
  // event: no metadata.imported_at / effective_date / occurred_at_known, and
  // occurred_at === created_at. No query is performed at runtime.
  it("client_imported is a technical act, never a historical business date", () => {
    const d = resolveTimelineDates({
      id: "watsons-import",
      event_type: "client_imported",
      occurred_at: "2026-07-24T10:15:00Z",
      created_at: "2026-07-24T10:15:00Z",
      metadata: { batch_id: "import-2026-07-24" },
    });
    expect(d.isTechnicalEvent).toBe(true);
    expect(d.occurredAt).toBeNull();
    expect(d.hasRealDate).toBe(false);
    expect(d.importedAt).toBe("2026-07-24T10:15:00Z");
    expect(d.recordedAt).toBe("2026-07-24T10:15:00Z");
    expect(d.technicalLabel).toMatch(/^Imported on /);
  });

  it("a client_imported event with an explicit historical effective_date keeps it", () => {
    const d = resolveTimelineDates({
      id: "b",
      event_type: "client_imported",
      occurred_at: "2026-07-24T10:15:00Z",
      created_at: "2026-07-24T10:15:00Z",
      effective_date: "2022-07-19",
    });
    expect(d.occurredAt).toBe("2022-07-19");
    expect(d.hasRealDate).toBe(true);
  });
});
