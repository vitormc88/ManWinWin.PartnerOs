import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  resolve(
    __dirname,
    "../../../supabase/migrations/20260825110158_3b371dc0-cea3-49ce-a627-24a04accd647.sql"
  ),
  "utf8"
);

describe("Module 7 certification repair hardening migration", () => {
  it("mirrors and verifies the academy_cert_settings execute contract", () => {
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(MIGRATION).toContain(
        `has_function_privilege('${role}', 'public.academy_cert_settings(uuid)', 'EXECUTE')`
      );
      expect(MIGRATION).toContain(
        `has_function_privilege('${role}', 'public.academy_cert_effective_settings(jsonb)', 'EXECUTE')`
      );
    }
    expect(MIGRATION).toContain(
      "academy_cert_effective_settings EXECUTE contract does not match academy_cert_settings"
    );
  });

  it("accepts only the original defect or the exact repaired state", () => {
    expect(MIGRATION).toContain("_a.passed IS TRUE");
    expect(MIGRATION).toContain("_a.scenario_score IS NULL");
    expect(MIGRATION).toContain("_a.next_attempt_at IS NULL");
    expect(MIGRATION).toContain(
      "_a.passed IS FALSE AND _a.scenario_score IS NOT DISTINCT FROM 0"
    );
    expect(MIGRATION).toContain(
      "is neither the exact original defect nor the exact repaired state"
    );
  });

  it("keeps strict evidence guards on both paths", () => {
    expect(MIGRATION).toContain("_a.raw_score IS DISTINCT FROM 10");
    expect(MIGRATION).toContain("_a.weighted_score IS DISTINCT FROM 100");
    expect(MIGRATION).toContain("_qtotal <> 10 OR _qbad <> 0");
    expect(MIGRATION).toContain("count(*) FILTER (WHERE q.category = 'scenario_analysis')");
    expect(MIGRATION).toContain("IF _qscenario <> 0 THEN");
    expect(MIGRATION).toContain("_ans <> 10 OR _wrong <> 0");
    expect(MIGRATION).toContain("category scores are not both 100");
  });

  it("does not rewrite or duplicate artifacts on the repaired path", () => {
    expect(MIGRATION).toMatch(
      /IF _already_repaired THEN[\s\S]*?_cert_total <> 1 OR _cert_valid <> 1/
    );
    expect(MIGRATION).toMatch(
      /IF _already_repaired THEN[\s\S]*?ELSE[\s\S]*?UPDATE public\.academy_attempts/
    );
    expect(MIGRATION).toMatch(
      /ELSE[\s\S]*?_cert_total <> 0[\s\S]*?INSERT INTO public\.academy_certifications/
    );
    expect(MIGRATION).toContain("does not have exactly one valid certificate");
  });
});