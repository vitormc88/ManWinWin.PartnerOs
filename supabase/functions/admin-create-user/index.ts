import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODULE_DEFAULTS: Record<string, Array<{ module_key: string; access_level: string }>> = {
  hq_standard: [
    { module_key: "dashboard", access_level: "view" },
    { module_key: "clients", access_level: "view" },
    { module_key: "renewals", access_level: "view" },
    { module_key: "pipeline", access_level: "view" },
    { module_key: "knowledge_base", access_level: "view" },
    { module_key: "training", access_level: "view" },
  ],
  partner_manager: [
    { module_key: "dashboard", access_level: "view" },
    { module_key: "clients", access_level: "edit" },
    { module_key: "renewals", access_level: "edit" },
    { module_key: "pipeline", access_level: "edit" },
    { module_key: "deal_registrations", access_level: "edit" },
    { module_key: "knowledge_base", access_level: "view" },
    { module_key: "training", access_level: "view" },
    { module_key: "onboarding", access_level: "view" },
    { module_key: "certifications", access_level: "view" },
  ],
  partner_admin: [
    { module_key: "dashboard", access_level: "view" },
    { module_key: "clients", access_level: "view" },
    { module_key: "renewals", access_level: "view" },
    { module_key: "pipeline", access_level: "edit" },
    { module_key: "knowledge_base", access_level: "view" },
    { module_key: "training", access_level: "view" },
    { module_key: "onboarding", access_level: "view" },
    { module_key: "certifications", access_level: "view" },
  ],
  partner_sales: [
    { module_key: "dashboard", access_level: "view" },
    { module_key: "clients", access_level: "view" },
    { module_key: "renewals", access_level: "view" },
    { module_key: "pipeline", access_level: "edit" },
    { module_key: "knowledge_base", access_level: "view" },
    { module_key: "training", access_level: "view" },
  ],
  partner_readonly: [
    { module_key: "dashboard", access_level: "view" },
    { module_key: "clients", access_level: "view" },
    { module_key: "renewals", access_level: "view" },
    { module_key: "pipeline", access_level: "view" },
    { module_key: "knowledge_base", access_level: "view" },
    { module_key: "training", access_level: "view" },
  ],
};

function generateTemporaryPassword() {
  return `MWW!${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) return Response.json({ error: "Missing authorization header" }, { status: 401, headers: corsHeaders });

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerData.user.id)
      .eq("role", "hq_admin");

    if (roleError || !roleRows?.length) return Response.json({ error: "Only HQ administrators can create users" }, { status: 403, headers: corsHeaders });

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim();
    const role = String(body.role || "").trim();
    const partnerId = body.partner_id ? String(body.partner_id) : null;
    const isHq = Boolean(body.is_hq);
    const isActive = body.is_active !== false;
    const phone = body.phone ? String(body.phone) : null;

    if (!email || !fullName || !role) return Response.json({ error: "Full name, email, and role are required" }, { status: 400, headers: corsHeaders });
    if (!isHq && !partnerId) return Response.json({ error: "Partner is required for partner users" }, { status: 400, headers: corsHeaders });

    const temporaryPassword = generateTemporaryPassword();
    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createUserError || !createdUser.user) return Response.json({ error: createUserError?.message || "Failed to create auth user" }, { status: 400, headers: corsHeaders });

    const userId = createdUser.user.id;

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ full_name: fullName, email, phone, partner_id: partnerId, is_hq: isHq, is_active: isActive, invitation_status: "invited" })
      .eq("id", userId);
    if (profileError) {
      await adminClient.auth.admin.deleteUser(userId);
      return Response.json({ error: profileError.message }, { status: 400, headers: corsHeaders });
    }

    const { error: roleInsertError } = await adminClient.from("user_roles").insert({ user_id: userId, role: role as any });
    if (roleInsertError) {
      await adminClient.auth.admin.deleteUser(userId);
      return Response.json({ error: roleInsertError.message }, { status: 400, headers: corsHeaders });
    }

    const permissions = MODULE_DEFAULTS[role] ?? [];
    if (permissions.length > 0) {
      const { error: permissionError } = await adminClient.from("user_module_permissions").insert(
        permissions.map((permission) => ({ user_id: userId, ...permission }))
      );
      if (permissionError) {
        await adminClient.from("user_roles").delete().eq("user_id", userId);
        await adminClient.auth.admin.deleteUser(userId);
        return Response.json({ error: permissionError.message }, { status: 400, headers: corsHeaders });
      }
    }

    return Response.json({ userId, temporaryPassword }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
});