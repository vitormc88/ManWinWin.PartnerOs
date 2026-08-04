import { describe, it, expect } from "vitest";
import {
  classifyHost,
  extractProjectRefFromKey,
  extractProjectRefFromUrl,
  resolveSupabaseEnv,
  SupabaseEnvironmentError,
  PROD_PROJECT_REF,
  TEST_PROJECT_REF,
} from "@/lib/supabase-env";

const PROD_URL = `https://${PROD_PROJECT_REF}.supabase.co`;
const TEST_URL = `https://${TEST_PROJECT_REF}.supabase.co`;

function jwtFor(ref: string) {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "supabase", ref, role: "anon" })}.signature`;
}

const PROD_KEY = jwtFor(PROD_PROJECT_REF);
const TEST_KEY = jwtFor(TEST_PROJECT_REF);

describe("classifyHost", () => {
  it("treats the live host as production", () => {
    expect(classifyHost("partneros.manwinwin.com")).toBe("production");
    expect(classifyHost("PARTNEROS.MANWINWIN.COM")).toBe("production");
  });

  it("treats lovable preview hosts and localhost as test", () => {
    for (const h of [
      "localhost",
      "id-preview--abc.lovable.app",
      "partneros-manwinwin.lovable.app",
      "abc.lovableproject.com",
      undefined,
    ]) {
      expect(classifyHost(h)).toBe("test");
    }
  });
});

describe("ref extraction", () => {
  it("parses project ref from url", () => {
    expect(extractProjectRefFromUrl(TEST_URL)).toBe(TEST_PROJECT_REF);
    expect(extractProjectRefFromUrl("http://example.com")).toBeNull();
    expect(extractProjectRefFromUrl("not a url")).toBeNull();
    expect(extractProjectRefFromUrl("")).toBeNull();
  });

  it("parses project ref from legacy jwt only", () => {
    expect(extractProjectRefFromKey(PROD_KEY)).toBe(PROD_PROJECT_REF);
    expect(extractProjectRefFromKey("sb_publishable_abc123")).toBeNull();
    expect(extractProjectRefFromKey("a.b.c")).toBeNull();
  });
});

describe("resolveSupabaseEnv", () => {
  it("accepts matching production config", () => {
    const r = resolveSupabaseEnv({
      url: PROD_URL,
      publishableKey: PROD_KEY,
      hostname: "partneros.manwinwin.com",
    });
    expect(r.environment).toBe("production");
    expect(r.projectRef).toBe(PROD_PROJECT_REF);
  });

  it("accepts matching preview config", () => {
    const r = resolveSupabaseEnv({ url: TEST_URL, publishableKey: TEST_KEY, hostname: "localhost" });
    expect(r.environment).toBe("test");
    expect(r.projectRef).toBe(TEST_PROJECT_REF);
  });

  it("rejects test url on the production host", () => {
    expect(() =>
      resolveSupabaseEnv({ url: TEST_URL, publishableKey: TEST_KEY, hostname: "partneros.manwinwin.com" }),
    ).toThrow(SupabaseEnvironmentError);
  });

  it("rejects prod url on preview hosts", () => {
    expect(() =>
      resolveSupabaseEnv({ url: PROD_URL, publishableKey: PROD_KEY, hostname: "id-preview--x.lovable.app" }),
    ).toThrow(/must use project ref avxxzmoayxzrykwqzoqn/);
  });

  it("rejects a jwt key whose ref does not match the url", () => {
    expect(() =>
      resolveSupabaseEnv({ url: TEST_URL, publishableKey: PROD_KEY, hostname: "localhost" }),
    ).toThrow(/does not match/);
  });

  it("accepts non-jwt publishable keys (no ref claim to compare)", () => {
    expect(
      resolveSupabaseEnv({ url: TEST_URL, publishableKey: "sb_publishable_abc", hostname: "localhost" }).projectRef,
    ).toBe(TEST_PROJECT_REF);
  });

  it("rejects missing or malformed variables", () => {
    expect(() => resolveSupabaseEnv({ url: "", publishableKey: TEST_KEY, hostname: "localhost" })).toThrow(
      /VITE_SUPABASE_URL is missing/,
    );
    expect(() => resolveSupabaseEnv({ url: TEST_URL, publishableKey: "", hostname: "localhost" })).toThrow(
      /VITE_SUPABASE_PUBLISHABLE_KEY is missing/,
    );
    expect(() => resolveSupabaseEnv({ url: "https://nope.example.com", publishableKey: TEST_KEY, hostname: "localhost" })).toThrow(
      /not a valid Supabase project URL/,
    );
  });

  it("never includes key material in error messages", () => {
    const cases: Array<() => unknown> = [
      () => resolveSupabaseEnv({ url: TEST_URL, publishableKey: PROD_KEY, hostname: "partneros.manwinwin.com" }),
      () => resolveSupabaseEnv({ url: PROD_URL, publishableKey: TEST_KEY, hostname: "localhost" }),
      () => resolveSupabaseEnv({ url: TEST_URL, publishableKey: PROD_KEY, hostname: "localhost" }),
    ];
    for (const run of cases) {
      try {
        run();
        throw new Error("expected throw");
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).not.toContain(PROD_KEY);
        expect(msg).not.toContain(TEST_KEY);
      }
    }
  });
});
