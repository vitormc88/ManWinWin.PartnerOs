import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const result = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

/**
 * Explicit HQ-only invitation after verified conversion.
 * Disabled by default in TEST and PROD; deployment needs both:
 * PARTNER_GROWTH_INVITES_ENABLED=true
 * PARTNER_GROWTH_INVITE_REDIRECT_URL=<approved auth allowlisted URL>
 *
 * NEVER used for automatic conversion, Academy accreditation or partner role promotions.
 */
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return result({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey)
      return result({ error: "Invitation service not configured" }, 503);

    // Deployment alone NEVER sends emails. HQ must explicitly enable and click.
    const enabled = Deno.env.get("PARTNER_GROWTH_INVITES_ENABLED") === "true";
    const redirectTo = Deno.env.get("PARTNER_GROWTH_INVITE_REDIRECT_URL") ?? "";
    if (!enabled || !/^https:\/\//.test(redirectTo))
      return result({ error: "TEST invitation delivery not enabled. Preview can be reviewed without sending email." }, 503);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return result({ error: "Authentication required" }, 401);
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);
    const jwt = authHeader.slice(7);
    const claims = await caller.auth.getClaims(jwt);
    if (claims.error || !claims.data?.claims?.sub)
      return result({ error: "Authentication invalid" }, 401);
    const body = await req.json();
    const prospectId = String(body?.prospect_id ?? "");
    const contactId = String(body?.contact_id ?? "");
    if (body?.confirmed !== true || !/^[0-9a-f\-]{36}$/i.test(prospectId) ||
        !/^[0-9a-f\-]{36}$/i.test(contactId))
      return result({ error: "Select an authorized contact and confirm the invitation" }, 400);

    // Server-side SEC DEFINER reservation validates HQ role, conversion
    // receipt, model, email uniqueness and named candidate ownership.
    const { data: rows, error: reserveError } = await caller.rpc("pg_reserve_partner_invitation", {
      p_prospect_id: prospectId, p_contact_id: contactId,
    });
    if (reserveError) return result({ error: reserveError.message }, 403);
    const reserved = rows?.[0];
    if (!reserved?.reservation_token || !reserved?.contact_email ||
        !reserved?.role_name || !reserved?.partner_id) return result({ error: "Invitation preflight returned no candidate" }, 409);

    const token = reserved.reservation_token as string;
    let authUserId: string | undefined;
    try {
      const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
        reserved.contact_email,
        { data: { full_name: reserved.contact_name }, redirectTo },
      );
      if (inviteError || !inviteData.user)
        throw new Error("invitation_provider_failure");
      authUserId = inviteData.user.id;

      // Complete profile, role and HQ audit record atomically on the DB.
      const { error: finalizeError } = await admin.rpc("pg_complete_partner_invitation", {
        p_token: token, p_user_id: authUserId,
      });
      if (finalizeError) throw new Error("invitation_finalize_failure");
      return result({ success: true, invited: true, contact_id: contactId, partner_id: reserved.partner_id });
    } catch (e) {
      // Fail closed: created auth user is never left with unintended rights.
      if (authUserId) await admin.auth.admin.deleteUser(authUserId);
      await admin.rpc("pg_fail_partner_invitation", {
        p_token: token,
        p_reason_code: e instanceof Error ? e.message : "unknown_error",
      });
      return result({ error: "Invitation could not be completed; no partner access was authorized." }, 409);
    }
  } catch {
    return result({ error: "Invitation request failed" }, 500);
  }
});
