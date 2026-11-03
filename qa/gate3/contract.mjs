// PartnerOS Gate 3 — source-only, TEST-only invariants for real Supabase Auth QA.
export const TEST_REF = "avxxzmoayxzrykwqzoqn";
export const TEST_URL = "https://" + TEST_REF + ".supabase.co";
export const PROD_REF = "qownzparzsaeoyccgwuj";

export const QA_ROLES = Object.freeze({
  sales: { role: "partner_sales", email: "GATE3_QA_SALES_EMAIL", password: "GATE3_QA_SALES_PASSWORD" },
  admin: { role: "partner_admin", email: "GATE3_QA_ADMIN_EMAIL", password: "GATE3_QA_ADMIN_PASSWORD" },
  hq: { role: "hq_admin", email: "GATE3_QA_HQ_EMAIL", password: "GATE3_QA_HQ_PASSWORD" },
});

export function validateTarget(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("BLOCKED: invalid TEST URL"); }
  if (parsed.origin !== TEST_URL || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("BLOCKED: Supabase target is not the approved TEST project");
  }
  return parsed.origin;
}

export function validateConfiguration(env) {
  if (env.GATE3_QA_TEST_ONLY_ACK !== "TEST_ONLY") {
    throw new Error("BLOCKED: explicit TEST_ONLY dispatch confirmation required");
  }
  validateTarget(env.GATE3_TEST_SUPABASE_URL ?? TEST_URL);
  if (!env.GATE3_TEST_SUPABASE_ANON_KEY || env.GATE3_TEST_SUPABASE_ANON_KEY.length < 20) {
    throw new Error("BLOCKED: missing TEST publishable/anon key");
  }
  for (const [alias, names] of Object.entries(QA_ROLES)) {
    if (!env[names.email] || !env[names.password]) {
      throw new Error("BLOCKED: missing dedicated " + alias + " QA credentials");
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env[names.email])) {
      throw new Error("BLOCKED: invalid " + alias + " QA email");
    }
    if (env[names.password].length < 8) {
      throw new Error("BLOCKED: " + alias + " QA password too short");
    }
  }
  if (new Set(Object.values(QA_ROLES).map(x => env[x.email].trim().toLowerCase())).size !== 3) {
    throw new Error("BLOCKED: all three QA identities must be distinct");
  }
  return true;
}

export function decodeJwtClaims(token) {
  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw new Error("BLOCKED: Supabase Auth did not issue a JWT");
  }
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("BLOCKED: JWT payload is not parseable");
  }
}

export function assertClaims(claims, id, now = Math.floor(Date.now() / 1000)) {
  if (claims.iss !== TEST_URL + "/auth/v1"
      || claims.sub !== id
      || claims.role !== "authenticated"
      || (claims.aud !== "authenticated" && !(Array.isArray(claims.aud) && claims.aud.includes("authenticated")))
      || typeof claims.exp !== "number" || claims.exp <= now + 30) {
    throw new Error("BLOCKED: TEST JWT claims do not match expected signed-in user");
  }
  return true;
}
