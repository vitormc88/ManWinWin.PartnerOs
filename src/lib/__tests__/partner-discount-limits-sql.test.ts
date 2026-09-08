import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SQL_PATH = "supabase/migrations_review/20260908140000_partner_discount_limits.sql";
const sql = readFileSync(SQL_PATH, "utf8");

function repoDefinesFunction(signature: RegExp): boolean {
  const dir = "supabase/migrations";
  return readdirSync(dir).some((f) =>
    f.endsWith(".sql") && signature.test(readFileSync(join(dir, f), "utf8")),
  );
}

describe("partner discount limits migration — helper contracts", () => {
  it("uses the repository helper signatures with auth.uid()", () => {
    expect(sql).toContain("public.is_hq_user(auth.uid())");
    expect(sql).toContain("public.get_user_partner_id(auth.uid())");
    // No zero-argument calls of the uuid-taking helpers.
    expect(sql).not.toMatch(/is_hq_user\(\s*\)/);
    expect(sql).not.toMatch(/get_user_partner_id\(\s*\)/);
  });

  it("references trigger/ACL helpers that actually exist in the repository", () => {
    expect(repoDefinesFunction(/FUNCTION public\.set_updated_at\s*\(\s*\)/)).toBe(true);
    expect(repoDefinesFunction(/FUNCTION public\.is_hq_user\s*\(\s*_user_id uuid\s*\)/)).toBe(true);
    expect(repoDefinesFunction(/FUNCTION public\.get_user_partner_id\s*\(\s*_user_id uuid\s*\)/)).toBe(true);
    expect(sql).toContain("EXECUTE FUNCTION public.set_updated_at()");
    // update_updated_at_column() has no definition in this repository.
    expect(sql).not.toContain("update_updated_at_column");
  });

  it("requires confirmed HQ Admin (role AND HQ profile) for writes", () => {
    const writeBlock = sql.slice(sql.indexOf("discount limits writable by hq admin"));
    expect(writeBlock).toContain(
      "public.has_role(auth.uid(), 'hq_admin') AND public.is_hq_user(auth.uid())",
    );
    expect(writeBlock.match(/is_hq_user\(auth\.uid\(\)\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("revokes default privileges before granting the minimum, preserving service_role", () => {
    const revokeIdx = sql.indexOf("REVOKE ALL ON public.partner_discount_limits FROM PUBLIC");
    const grantIdx = sql.indexOf("GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_discount_limits");
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(sql).toContain("REVOKE ALL ON public.partner_discount_limits FROM anon");
    expect(sql).toContain("REVOKE ALL ON public.partner_discount_limits FROM authenticated");
    expect(grantIdx).toBeGreaterThan(revokeIdx);
    expect(sql).toContain("GRANT ALL ON public.partner_discount_limits TO service_role");
    expect(sql).not.toMatch(/GRANT[^\n]*TO anon/);
  });

  it("is transactional and preflights the existing discount guard", () => {
    expect(sql.indexOf("\nBEGIN;")).toBeGreaterThan(-1);
    expect(sql.indexOf("\nBEGIN;")).toBeLessThan(sql.indexOf("CREATE TABLE"));
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    for (const needle of [
      "private.proposal_discount_limits()",
      "private.enforce_proposal_item_discounts()",
      "private.enforce_proposal_business_discounts()",
      "trg_enforce_proposal_item_discounts",
      "trg_enforce_proposal_business_discounts",
    ]) {
      expect(sql).toContain(needle);
    }
    expect(sql).toMatch(/RAISE EXCEPTION 'Preflight failed/);
  });

  it("assigns no override values to any real partner", () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.partner_discount_limits/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.partner_discount_limits/i);
  });
});
