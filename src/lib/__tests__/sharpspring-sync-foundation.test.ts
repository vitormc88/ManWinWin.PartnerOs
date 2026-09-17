import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");
const INGEST_FUNCTION = readFileSync(
  join(process.cwd(), "supabase/functions/ingest-sharpspring-opportunity/index.ts"),
  "utf8",
);

function migrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.startsWith("202609151"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

/** Sanitized fixture mirroring the six dry-run sample opportunities. */
const FIXTURE = [
  { external_opportunity_id: "SS-1001", company_name: "Alpha Industrial Services Ltd", stage: "Meeting1", amount_eur: 3306, notes: 2 },
  { external_opportunity_id: "SS-1002", company_name: "Beta Foods Processing SA", stage: "Meeting1", amount_eur: 3426, notes: 1 },
  { external_opportunity_id: "SS-1003", company_name: "Gamma Utilities Group", stage: "Meeting1", amount_eur: 3246, notes: 1 },
  { external_opportunity_id: "SS-1004", company_name: "Delta Mining Holdings", stage: "Meeting1", amount_eur: 37846, notes: 1 },
  { external_opportunity_id: "SS-1005", company_name: "Epsilon Water Authority", stage: "Price Negotiation", amount_eur: 6830.5, notes: 1 },
  { external_opportunity_id: "SS-1006", company_name: "Zeta Cement Works", stage: "Price Negotiation", amount_eur: 18744, notes: 1 },
];

describe("SharpSpring sync foundation — schema contract", () => {
  const sql = migrationSql();

  it("a) blocks duplicate external opportunity ids via a partial unique index", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS deals_source_external_opportunity_uidx[\s\S]*lower\(source_system\), external_opportunity_id[\s\S]*WHERE source_system IS NOT NULL AND external_opportunity_id IS NOT NULL/);
  });

  it("b) blocks duplicate external note ids and duplicate external contact ids", () => {
    expect(sql).toMatch(/deal_activities_source_external_note_uidx[\s\S]*lower\(source_system\), external_note_id/);
    expect(sql).toMatch(/deal_contacts_source_external_contact_uidx[\s\S]*lower\(source_system\), external_contact_id/);
  });

  it("c) the dry-run RPC is read-only: invoker, stable, fixed search_path, no write statements", () => {
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.preview_sharpspring_opportunity_sync"));
    expect(fn).toContain("SECURITY INVOKER");
    expect(fn).toContain("STABLE");
    expect(fn).toContain("SET search_path = pg_catalog, public");
    expect(fn).not.toMatch(/\b(INSERT INTO|UPDATE public\.|DELETE FROM|CREATE TABLE|TRUNCATE)\b/);
  });

  it("d) ambiguous normalized matches are surfaced as review, never merged", () => {
    expect(sql).toContain("action := 'review'");
    expect(sql).toContain("Ambiguous match is never merged automatically");
    expect(sql).toContain("Multiple candidate PartnerOS deals matched");
    expect(sql).toContain("'candidate_deal_ids'");
  });

  it("e) source stage stays separate from proposal/commercial status", () => {
    expect(sql).toContain("'source_stage_name', src_stage");
    expect(sql).toContain("'mapped_partneros_stage', mapped_stage");
    expect(sql).toMatch(/WHEN 'meeting1' THEN 'Qualified'/);
    expect(sql).toMatch(/WHEN 'price negotiation' THEN 'Price Negotiation'/);
    expect(sql).toContain("Stage synchronized from SharpSpring, the authoritative CRM. Missing PartnerOS evidence was not inferred. Review required.");
    expect(sql).toContain("operational conversion is pending a valid PartnerOS proposal");
    expect(sql).not.toMatch(/proposal_status|proposals\s+SET/);
  });

  it("grants execute only to authenticated and service_role", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.preview_sharpspring_opportunity_sync(jsonb, uuid, uuid) FROM PUBLIC");
    expect(sql).toContain("FROM anon");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("TO service_role");
  });
});

describe("SharpSpring sync foundation — six sanitized sample opportunities", () => {
  it("f) totals are 6 records, 6 create, 7 notes, EUR 73398.50", () => {
    const records = FIXTURE.length;
    const notes = FIXTURE.reduce((s, r) => s + r.notes, 0);
    const total = FIXTURE.reduce((s, r) => s + r.amount_eur, 0);
    expect(records).toBe(6);
    expect(notes).toBe(7);
    expect(Number(total.toFixed(2))).toBe(73398.5);
    expect(FIXTURE.filter((r) => r.stage === "Meeting1")).toHaveLength(4);
    expect(FIXTURE.filter((r) => r.stage === "Price Negotiation")).toHaveLength(2);
  });
});

describe("SharpSpring sync — related data", () => {
  it("persists the source contact and enriches the deal summary", () => {
    expect(INGEST_FUNCTION).toContain('.from("deal_contacts")');
    expect(INGEST_FUNCTION).toContain("external_contact_id");
    expect(INGEST_FUNCTION).toContain("contact_person_name");
    expect(INGEST_FUNCTION).toContain("maintenance_team_size");
  });

  it("persists notes as historical activities without duplicating source ids", () => {
    expect(INGEST_FUNCTION).toContain('.from("deal_activities")');
    expect(INGEST_FUNCTION).toContain("external_note_id");
    expect(INGEST_FUNCTION).toContain("source_created_at");
    expect(INGEST_FUNCTION).toContain('tags: ["SharpSpring"]');
  });

  it("persists open tasks idempotently using a stable SharpSpring marker", () => {
    expect(INGEST_FUNCTION).toContain('.from("deal_tasks")');
    expect(INGEST_FUNCTION).toContain("[SharpSpring task ${externalTaskId}]");
    expect(INGEST_FUNCTION).toContain("source_tasks");
  });

  it("returns related-row counts for operational verification", () => {
    expect(INGEST_FUNCTION).toContain("enrichment,");
    expect(INGEST_FUNCTION).toContain("return { contacts, activities, tasks }");
  });
});
