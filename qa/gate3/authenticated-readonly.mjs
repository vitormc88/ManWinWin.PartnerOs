// PartnerOS Gate 3: live TEST Supabase Auth + PostgREST checks with genuine JWTs.
// Intentionally READ ONLY against business tables. No JWT/password/email is logged.
// Needs three dedicated QA users: Sales, Admin (same partner), HQ Admin.
// Never run on PROD. A successful JWT check requires Supabase Auth /user response.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { TEST_URL, QA_ROLES, validateConfiguration, decodeJwtClaims, assertClaims } from "./contract.mjs";

function envWithPublicTestKey(env) {
  const input = { ...env };
  if (!input.GATE3_TEST_SUPABASE_ANON_KEY) {
    let file = "";
    try { file = readFileSync(".env", "utf8"); } catch { /* absent in local QA */ }
    const match = file.match(/^VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*["']?([^"'\s]+)["']?\s*$/m);
    if (match) input.GATE3_TEST_SUPABASE_ANON_KEY = match[1];
  }
  return input;
}
function check(value, label) {
  assert.ok(value, "FAIL: " + label);
  console.log("PASS " + label);
}
function requireData(result, label) {
  if (result.error) {
    throw new Error("FAIL: " + label + " — Supabase returned a query/auth error");
  }
  return result.data;
}
function newClient(key) {
  return createClient(TEST_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "partneros-gate3-readonly-e2e" } },
  });
}
async function signIn(config, alias) {
  const keys = QA_ROLES[alias];
  const client = newClient(config.GATE3_TEST_SUPABASE_ANON_KEY);
  const response = await client.auth.signInWithPassword({
    email: config[keys.email],
    password: config[keys.password],
  });
  const session = requireData(response, alias + " Supabase password login")?.session;
  check(Boolean(session?.access_token && session?.user?.id), alias + " TEST signed session created");
  const claims = decodeJwtClaims(session.access_token);
  assertClaims(claims, session.user.id);
  const verified = requireData(
    await client.auth.getUser(session.access_token), alias + " remote JWT verification"
  )?.user;
  check(verified?.id === session.user.id, alias + " JWT verified by Supabase Auth");
  const profile = requireData(
    await client.from("profiles").select("id,partner_id,is_hq,is_active").eq("id",verified.id).single(),
    alias + " authenticated profile"
  );
  const roles = requireData(
    await client.from("user_roles").select("role").eq("user_id",verified.id),
    alias + " authenticated role"
  );
  check(profile?.id === verified.id && profile.is_active === true, alias + " account active");
  check((roles ?? []).some(r => r.role === keys.role), alias + " proper database role");
  check(alias === "hq" ? profile.is_hq === true : (profile.is_hq === false && Boolean(profile.partner_id)),
    alias + " correct HQ/partner scope");
  return { client, profile, role: alias };
}
async function moduleAccess(person, key, level) {
  const result = requireData(await person.client.rpc("has_module_access", {
    _module_key: key, _required_level: level
  }), person.role + " module access");
  check(typeof result === "boolean", person.role + " server-evaluated permission " + key + "/" + level);
  return result;
}
async function getCanonicalClients(person, partnerId) {
  return requireData(
    await person.client.from("clients").select("id,partner_uuid,partner_id")
      .eq("partner_uuid", partnerId).is("partner_id", null).limit(50),
    person.role + " canonical client SELECT"
  );
}
async function getOwnLicenses(person, ids) {
  if (!ids.length) return [];
  return requireData(
    await person.client.from("licenses").select("id,client_id").in("client_id", ids).limit(50),
    person.role + " canonical license SELECT"
  );
}
async function getOwnContracts(person, ids) {
  if (!ids.length) return [];
  return requireData(
    await person.client.from("contracts").select("id,client_id").in("client_id", ids).limit(50),
    person.role + " canonical contract SELECT"
  );
}
async function getRenewals(person, partnerId) {
  return requireData(
    await person.client.from("renewals").select("id,partner_uuid,partner_id")
      .eq("partner_uuid",partnerId).is("partner_id",null).limit(50),
    person.role + " canonical renewal SELECT"
  );
}

async function main() {
  const cfg = envWithPublicTestKey(process.env);
  validateConfiguration(cfg); // refuses wrong environment and partial QA identities
  console.log("Gate3 TEST-only / real Supabase Auth / READ-ONLY business records");
  const signedIn = [];
  try {
    const sales = await signIn(cfg, "sales"); signedIn.push(sales);
    const admin = await signIn(cfg, "admin"); signedIn.push(admin);
    const hq = await signIn(cfg, "hq"); signedIn.push(hq);
    check(sales.profile.partner_id === admin.profile.partner_id,
      "dedicated QA Sales and Admin share fixture partner");
    check(new Set(signedIn.map(x => x.profile.id)).size === 3,
      "three distinct, verified JWT identities");

    check(await moduleAccess(sales, "clients", "edit") === false,
      "Sales cannot edit clients");
    check(await moduleAccess(sales, "renewals", "edit") === false,
      "Sales cannot edit renewals");
    check(await moduleAccess(admin, "clients", "edit") === true,
      "Partner Admin can edit clients in its own scope");
    check(await moduleAccess(admin, "renewals", "edit") === false,
      "Partner Admin has no direct renewal edit permission");
    check(await moduleAccess(hq, "clients", "edit") === true,
      "HQ Admin has clients edit privilege");

    const ownPartner = admin.profile.partner_id;
    const adminOwn = await getCanonicalClients(admin, ownPartner);
    const salesOwn = await getCanonicalClients(sales, ownPartner);
    check(adminOwn.length > 0 && salesOwn.length > 0,
      "Sales and Admin see canonical-only clients of their partner");

    const ownIds = adminOwn.map(x => x.id);
    check((await getOwnLicenses(admin, ownIds)).length > 0,
      "Partner Admin sees canonical-owned licenses");
    check((await getOwnContracts(admin, ownIds)).length > 0,
      "Partner Admin sees canonical-owned contracts");
    check((await getRenewals(admin, ownPartner)).length > 0,
      "Partner Admin sees canonical-only renewals");

    // Independent other-partner fixture must first be visible to HQ Admin.
    const hqCanon = requireData(
      await hq.client.from("clients").select("id,partner_uuid")
        .not("partner_uuid","is",null).is("partner_id",null).limit(200),
      "HQ canonical client visibility"
    );
    const other = hqCanon.find(x => x.partner_uuid !== ownPartner);
    check(Boolean(other), "HQ Admin sees a distinct partner's canonical fixture");
    const foreignPartner = other.partner_uuid;
    check((await getCanonicalClients(admin, foreignPartner)).length === 0,
      "Partner Admin cannot read foreign canonical client");
    check((await getCanonicalClients(sales, foreignPartner)).length === 0,
      "Partner Sales cannot read foreign canonical client");
    check((await getOwnLicenses(admin, [other.id])).length === 0,
      "Partner Admin cannot read foreign canonical license");
    check((await getOwnContracts(admin, [other.id])).length === 0,
      "Partner Admin cannot read foreign canonical contract");
    check((await getRenewals(admin, foreignPartner)).length === 0,
      "Partner Admin cannot read foreign canonical renewal");
    check((await getRenewals(sales, foreignPartner)).length === 0,
      "Partner Sales cannot read foreign canonical renewal");

    // No test writes at all: updates/close-renewal require a separate rollback-safe design.
    console.log("PASS Auth/JWT and read-only RLS role matrix. No business writes.");
  } finally {
    // Invalidate only short-lived QA sessions created by this run.
    await Promise.allSettled(signedIn.map(x => x.client.auth.signOut()));
  }
}
main().catch(() => {
  // Suppress SDK error messages to keep account/token data out of CI logs.
  console.error("Gate3 authenticated TEST check BLOCKED/FAILED. Inspect QA identity/fixture setup privately.");
  process.exitCode = 1;
});
