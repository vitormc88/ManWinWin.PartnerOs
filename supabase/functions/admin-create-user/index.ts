import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

      const PRODUCTION_APP_URL = "https://partneros-manwinwin.lovable.app";
      const redirectTo = body.redirectTo || `${PRODUCTION_APP_URL}/reset-password`;
      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, { redirectTo });

      if (inviteError) return Response.json({ error: inviteError.message }, { status: 400, headers: corsHeaders });

      await adminClient
        .from("profiles")
        .update({
          invitation_status: "pending",
          invitation_sent_at: new Date().toISOString(),
        })
        .eq("id", existingUser.id);

      return Response.json({ success: true, message: "Invitation resent" }, { headers: corsHeaders });
    }

    // --- CREATE NEW USER ---
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim();
    const role = String(body.role || "").trim();
    const partnerId = body.partner_id ? String(body.partner_id) : null;
    const isHq = Boolean(body.is_hq);
    const mode = body.mode || "invite";
    const password = body.password ? String(body.password) : null;

    if (!email || !fullName || !role) return Response.json({ error: "Full name, email, and role are required" }, { status: 400, headers: corsHeaders });
    if (!isHq && !partnerId) return Response.json({ error: "Partner is required for partner users" }, { status: 400, headers: corsHeaders });

    let userId: string;
    const now = new Date().toISOString();

    if (mode === "manual") {
      if (!password || password.length < 6) return Response.json({ error: "Password must be at least 6 characters" }, { status: 400, headers: corsHeaders });

      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !createData.user) {
        return Response.json({ error: createError?.message || "Failed to create user" }, { status: 400, headers: corsHeaders });
      }
      userId = createData.user.id;
    } else {
      const PRODUCTION_APP_URL = "https://partneros-manwinwin.lovable.app";
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: body.redirectTo || `${PRODUCTION_APP_URL}/reset-password`,
      });

      if (inviteError || !inviteData.user) {
        return Response.json({ error: inviteError?.message || "Failed to invite user" }, { status: 400, headers: corsHeaders });
      }
      userId = inviteData.user.id;
    }

    // Update profile with proper lifecycle stamps
    const profileUpdate: Record<string, unknown> = {
      full_name: fullName,
      email,
      partner_id: partnerId,
      is_hq: isHq,
      is_active: true,
      invitation_status: mode === "manual" ? "active" : "pending",
    };
    if (mode === "manual") {
      profileUpdate.invitation_accepted_at = now;
      profileUpdate.invitation_sent_at = null;
    } else {
      profileUpdate.invitation_sent_at = now;
      profileUpdate.invitation_accepted_at = null;
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .update(profileUpdate)
      .eq("id", userId);

    if (profileError) {
      await adminClient.auth.admin.deleteUser(userId);
      return Response.json({ error: profileError.message }, { status: 400, headers: corsHeaders });
    }

    // Assign role only — DO NOT create explicit module permission overrides.
    // Effective permissions are resolved from role_permission_templates via
    // get_effective_permissions(). Writing override rows here would falsely
    // mark every user as having "custom permissions" and could leak access
    // to modules that are not in the role template.
    const { error: roleInsertError } = await adminClient.from("user_roles").insert({ user_id: userId, role: role as any });
    if (roleInsertError) {
      await adminClient.auth.admin.deleteUser(userId);
      return Response.json({ error: roleInsertError.message }, { status: 400, headers: corsHeaders });
    }

    return Response.json({ userId, mode, invited: mode === "invite" }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
});
