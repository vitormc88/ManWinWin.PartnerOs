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
  partner_restricted: [
    { module_key: "dashboard", access_level: "view" },
    { module_key: "clients", access_level: "view" },
    { module_key: "renewals", access_level: "view" },
    { module_key: "pipeline", access_level: "view" },
    { module_key: "knowledge_base", access_level: "view" },
    { module_key: "training", access_level: "view" },
  ],
};

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

    // Use getClaims for resilient JWT validation (doesn't depend on session state)
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const callerId = claimsData.claims.sub as string;

    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "hq_admin");

    if (roleError || !roleRows?.length) return Response.json({ error: "Only HQ administrators can create users" }, { status: 403, headers: corsHeaders });

    const body = await req.json();

    // --- SET PASSWORD FOR EXISTING USER ---
    if (body.action === "set_password") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) return Response.json({ error: "Email and password are required" }, { status: 400, headers: corsHeaders });
      
      const { data: users } = await adminClient.auth.admin.listUsers();
      const existingUser = users?.users?.find((u: any) => u.email === email);
      if (!existingUser) return Response.json({ error: "User not found" }, { status: 404, headers: corsHeaders });
      
      const { error: updateError } = await adminClient.auth.admin.updateUserById(existingUser.id, { password });
      if (updateError) return Response.json({ error: updateError.message }, { status: 400, headers: corsHeaders });
      
      return Response.json({ success: true, userId: existingUser.id }, { headers: corsHeaders });
    }

    // --- RESEND INVITATION ---
    if (body.action === "resend_invite") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) return Response.json({ error: "Email is required" }, { status: 400, headers: corsHeaders });

      const { data: users } = await adminClient.auth.admin.listUsers();
      const existingUser = users?.users?.find((u: any) => u.email === email);
      if (!existingUser) return Response.json({ error: "User not found" }, { status: 404, headers: corsHeaders });

      // Re-invite the user with correct redirect
      const redirectTo = body.redirectTo || `${supabaseUrl}`;
      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });

      if (inviteError) return Response.json({ error: inviteError.message }, { status: 400, headers: corsHeaders });

      return Response.json({ success: true, message: "Invitation resent" }, { headers: corsHeaders });
    }

    // --- CREATE NEW USER (INVITE FLOW) ---
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim();
    const role = String(body.role || "").trim();
    const partnerId = body.partner_id ? String(body.partner_id) : null;
    const isHq = Boolean(body.is_hq);

    if (!email || !fullName || !role) return Response.json({ error: "Full name, email, and role are required" }, { status: 400, headers: corsHeaders });
    if (!isHq && !partnerId) return Response.json({ error: "Partner is required for partner users" }, { status: 400, headers: corsHeaders });

    // Use inviteUserByEmail to create user and send invitation email
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: body.redirectTo || undefined,
    });

    if (inviteError || !inviteData.user) {
      return Response.json({ error: inviteError?.message || "Failed to invite user" }, { status: 400, headers: corsHeaders });
    }

    const userId = inviteData.user.id;

    // Update profile with role details and set status to pending
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({
        full_name: fullName,
        email,
        partner_id: partnerId,
        is_hq: isHq,
        is_active: true,
        invitation_status: "pending",
      })
      .eq("id", userId);

    if (profileError) {
      await adminClient.auth.admin.deleteUser(userId);
      return Response.json({ error: profileError.message }, { status: 400, headers: corsHeaders });
    }

    // Assign role
    const { error: roleInsertError } = await adminClient.from("user_roles").insert({ user_id: userId, role: role as any });
    if (roleInsertError) {
      await adminClient.auth.admin.deleteUser(userId);
      return Response.json({ error: roleInsertError.message }, { status: 400, headers: corsHeaders });
    }

    // Assign default module permissions
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

    return Response.json({ userId, invited: true }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
});
