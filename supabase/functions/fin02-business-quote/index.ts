/**
 * FIN02 Gate6B CANDIDATE ONLY — read-only authenticated Business comparison.
 * Shares the exact existing frontend Business engine (no duplicated formulas).
 *
 * Disabled by default; do NOT deploy/enable in TEST or PROD without consent,
 * original RLS/JWT integration proof and environment checks.
 * This endpoint DOES NOT approve, freeze, mark Ready, save or award proposals.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";
import { computeServerBusinessComparison, parseServerBusinessConfig,
  Fin02QuoteError } from "../../../src/lib/fin02-server-business-quote.ts";
import { getDiscountLimits } from "../../../src/lib/proposal-discount-policy.ts";
import type { PricingRule } from "../../../src/types/proposal.ts";

const cors = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json",
  "Cache-Control":"no-store",
};
function response(body:unknown,status=200) {
  return new Response(JSON.stringify(body),{status,headers:cors});
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const own=(x:unknown):x is Record<string,unknown> =>
  x!==null&&typeof x==="object"&&!Array.isArray(x);

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors,status:204});
  if(req.method!=="POST")return response({error:"FIN02_METHOD_NOT_ALLOWED"},405);
  if(Deno.env.get("FIN02_SERVER_PREVIEW_ENABLED")!=="true")
    return response({error:"FIN02_PREVIEW_DISABLED"},503);
  const authHeader=req.headers.get("authorization")??"";
  if(!/^Bearer [^\s]+$/.test(authHeader))
    return response({error:"FIN02_AUTH_REQUIRED"},401);
  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
  if(!supabaseUrl||!anonKey)return response({error:"FIN02_NOT_CONFIGURED"},503);
  try{
    const raw=await req.text();
    if(raw.length>32768) return response({error:"FIN02_PAYLOAD_TOO_LARGE"},413);
    const input:unknown=JSON.parse(raw);
    if(!own(input) ||
      Object.keys(input).some(k=>!["action","deal_id","config"].includes(k)) ||
      input.action!=="preview" ||
      typeof input.deal_id!=="string" || !UUID.test(input.deal_id)) {
      return response({error:"FIN02_INVALID_QUOTE_REQUEST"},400);
    }
    const cfg=parseServerBusinessConfig(input.config);

    // All DB operations use the caller's verified JWT + existing RLS. NO
    // service_role key, and NEVER trust partner_id or prices from the body.
    const userDb=createClient(supabaseUrl,anonKey,{
      global:{headers:{Authorization:authHeader}},
      auth:{persistSession:false,autoRefreshToken:false},
    });
    const token=authHeader.slice(7);
    const {data:identity,error:identityError}=await userDb.auth.getUser(token);
    const actorId=identity?.user?.id;
    if(identityError||!actorId)return response({error:"FIN02_AUTH_INVALID"},401);

    const {data:allowed,error:aclError}=await userDb.rpc("can_manage_deal",{
      _deal_id:input.deal_id,
    });
    if(aclError||allowed!==true)
      return response({error:"FIN02_DEAL_ACCESS_DENIED"},403);

    const [{data:profile,error:profileError},
      {data:roles,error:rolesError}]=await Promise.all([
      userDb.from("profiles").select("id,partner_id,is_hq,is_active")
        .eq("id",actorId).single(),
      userDb.from("user_roles").select("role").eq("user_id",actorId),
    ]);
    if(profileError||!profile?.is_active||rolesError||!Array.isArray(roles))
      return response({error:"FIN02_ROLE_CONTEXT_UNAVAILABLE"},403);
    const hq=profile.is_hq===true &&
      roles.some(r=>r.role==="hq_admin"||r.role==="hq_standard");
    let level:string|null=null;
    let overrides:{software:number|null;services:number|null}|null=null;
    if(!hq){
      const partnerId=profile.partner_id;
      if(typeof partnerId!=="string"||!UUID.test(partnerId))
        return response({error:"FIN02_PARTNER_UNVERIFIED"},403);
      const {data:partner,error:partnerError}=await userDb.from("partners")
        .select("id,partnership_level,is_active,status")
        .eq("id",partnerId).single();
      if(partnerError||!partner?.is_active||partner.status==="Archived")
        return response({error:"FIN02_PARTNER_INACTIVE_OR_HIDDEN"},403);
      level=partner.partnership_level??null;

      // Critical: actual TEST currently lacks this table. Do NOT fall back to
      // nominal 10/10, since an HQ-issued stricter limit might exist.
      const {data:limits,error:limitsError}=await userDb
        .from("partner_discount_limits")
        .select("max_software_discount_pct,max_services_discount_pct")
        .eq("partner_id",partnerId).maybeSingle();
      if(limitsError)return response({error:"FIN02_DISCOUNT_AUTHORITY_NOT_INSTALLED"},503);
      if(limits){
        if((limits.max_software_discount_pct!==null &&
            (typeof limits.max_software_discount_pct!=="number"||
            !Number.isFinite(limits.max_software_discount_pct)))||
           (limits.max_services_discount_pct!==null &&
            (typeof limits.max_services_discount_pct!=="number"||
            !Number.isFinite(limits.max_services_discount_pct))))
          return response({error:"FIN02_DISCOUNT_AUTHORITY_INVALID"},503);
        overrides={software:limits.max_software_discount_pct,
          services:limits.max_services_discount_pct};
      }
    }
    const verifiedLimits=getDiscountLimits({isHQ:hq,
      partnershipLevel:level,overrides});
    // Return no prices on unknown/stale catalog or failed RLS. A browser can
    // never upload its own catalog into this trusted calculation.
    const {data:rules,error:rulesError}=await userDb.from("pricing_rules")
      .select("*").eq("product_family","Business").eq("active",true);
    if(rulesError||!Array.isArray(rules))
      return response({error:"FIN02_PRICING_SOURCE_UNAVAILABLE"},503);

    const quoted=computeServerBusinessComparison(cfg,{
      actorId,dealId:input.deal_id,verifiedLimits,
      pricingRules:rules as PricingRule[],
    });
    // This function is PREVIEW-ONLY, even if commercial amount happens to
    // match the browser and no missing source fields are reported.
    return response(quoted);
  }catch(e){
    if(e instanceof Fin02QuoteError)
      return response({error:e.code},e.code==="FIN02_DISCOUNT_ABOVE_AUTHORIZED_LIMIT"?403:422);
    return response({error:"FIN02_QUOTE_UNAVAILABLE"},503);
  }
});
