import test from "node:test";
import assert from "node:assert/strict";
import { TEST_REF, TEST_URL, PROD_REF, QA_ROLES,
         validateTarget, validateConfiguration, decodeJwtClaims, assertClaims } from "./contract.mjs";

const valid = {
  GATE3_QA_TEST_ONLY_ACK:"TEST_ONLY",
  GATE3_TEST_SUPABASE_URL:TEST_URL,
  GATE3_TEST_SUPABASE_ANON_KEY:"sb_publishable_purpose_built_test_key_123456",
  GATE3_QA_SALES_EMAIL:"sales-gate3@example.test",
  GATE3_QA_SALES_PASSWORD:"placeholder-only-1",
  GATE3_QA_ADMIN_EMAIL:"admin-gate3@example.test",
  GATE3_QA_ADMIN_PASSWORD:"placeholder-only-2",
  GATE3_QA_HQ_EMAIL:"hq-gate3@example.test",
  GATE3_QA_HQ_PASSWORD:"placeholder-only-3",
};
test("TEST host contract is fail-closed on PROD and lookalikes", () => {
  assert.equal(validateTarget(TEST_URL),TEST_URL);
  assert.ok(TEST_URL.includes(TEST_REF));
  assert.throws(() => validateTarget("https://"+PROD_REF+".supabase.co"));
  assert.throws(() => validateTarget("https://"+TEST_REF+".supabase.co.evil.example"));
  assert.throws(() => validateTarget("http://"+TEST_REF+".supabase.co"));
  assert.throws(() => validateTarget("https://"+TEST_REF+".supabase.co/path"));
  assert.throws(() => validateTarget("not-a-url"));
});
test("QA must use three distinct identities and explicit TEST_ONLY",()=>{
  assert.equal(validateConfiguration(valid),true);
  assert.deepEqual(Object.keys(QA_ROLES),["sales","admin","hq"]);
  assert.throws(() => validateConfiguration({...valid, GATE3_QA_TEST_ONLY_ACK:"YES"}));
  assert.throws(() => validateConfiguration({...valid, GATE3_QA_ADMIN_EMAIL:valid.GATE3_QA_SALES_EMAIL}));
  assert.throws(() => validateConfiguration({...valid, GATE3_QA_HQ_PASSWORD:""}));
  assert.throws(() => validateConfiguration({...valid, GATE3_TEST_SUPABASE_URL:"https://"+PROD_REF+".supabase.co"}));
});
test("JWT claim parser only checks shape; remote Supabase Auth must verify signature",()=>{
  const now=Math.floor(Date.now()/1000);
  const claims={iss:TEST_URL+"/auth/v1",sub:"a-test-user",aud:"authenticated",role:"authenticated",exp:now+300};
  const token=["eyJhbGciOiJub25lIn0",Buffer.from(JSON.stringify(claims)).toString("base64url"),"placeholder"].join(".");
  assert.deepEqual(decodeJwtClaims(token),claims);
  assert.equal(assertClaims(claims,claims.sub,now),true);
  assert.throws(() => assertClaims({...claims,iss:"https://"+PROD_REF+".supabase.co/auth/v1"},claims.sub,now));
  assert.throws(() => assertClaims({...claims,role:"service_role"},claims.sub,now));
  assert.throws(() => assertClaims({...claims,exp:now-1},claims.sub,now));
  assert.throws(() => decodeJwtClaims("malformed"));
});
