import { findAuthUser, getResetUrl, sendAccessLink } from "./recovery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function createAdminUserHandler(createClient: any, env: { get(name: string): string | undefined }) {
return async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = env.get("SUPABASE_URL")!;
    const anonKey = env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = env.get("SUPABASE_SERVICE_ROLE_KEY") ?? env.get("SERVICE_ROLE_KEY");
    if (!serviceRoleKey) return Response.json({ error: "Server misconfiguration" }, { status: 500, headers: corsHeaders });
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

    if (roleError) return Response.json({ error: `Role check failed: ${roleError.message}` }, { status: 500, headers: corsHeaders });
    if (!roleRows?.length) return Response.json({ error: "Only HQ administrators can create users" }, { status: 403, headers: corsHeaders });

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles").select("is_hq, is_active").eq("id", callerId).single();
    if (callerProfileError || !callerProfile?.is_hq || !callerProfile?.is_active) {
      return Response.json({ error: "Only active HQ administrators can manage access" }, { status: 403, headers: corsHeaders });
    }
    const body = await req.json();
    const redirectTo = getResetUrl(supabaseUrl);
    if (body.action && !["set_password", "resend_invite", "recover_access"].includes(body.action)) {
      return Response.json({ error: "Unknown action" }, { status: 400, headers: corsHeaders });
    }

    // --- SET PASSWORD FOR EXISTING USER ---
    if (body.action === "set_password") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) return Response.json({ error: "Email and password are required" }, { status: 400, headers: corsHeaders });

      const existingUser = await findAuthUser(adminClient.auth.admin, email);
      if (!existingUser) return Response.json({ error: "User not found" }, { status: 404, headers: corsHeaders });

      const { error: updateError } = await adminClient.auth.admin.updateUserById(existingUser.id, { password });
      if (updateError) return Response.json({ error: updateError.message }, { status: 400, headers: corsHeaders });

      return Response.json({ success: true, userId: existingUser.id }, { headers: corsHeaders });
    }

    // Existing identity is preserved; confirmed emails use recovery, not a second invite.
    // Legacy resend_invite callers remain supported until every frontend is updated.
    if (body.action === "resend_invite" || body.action === "recover_access") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) return Response.json({ error: "Email is required" }, { status: 400, headers: corsHeaders });
      const existingUser = await findAuthUser(adminClient.auth.admin, email, body.user_id);
      if (!existingUser) return Response.json({ error: "User not found" }, { status: 404, headers: corsHeaders });
      const { data: targetProfile, error: targetError } = await adminClient
        .from("profiles").select("id, is_active, invitation_status").eq("id", existingUser.id).single();
      if (targetError || !targetProfile) return Response.json({ error: "User profile not found" }, { status: 404, headers: corsHeaders });
      if (!targetProfile.is_active) return Response.json({ error: "Reactivate this user before sending an access link" }, { status: 409, headers: corsHeaders });
      const kind = await sendAccessLink(adminClient.auth, existingUser, redirectTo);
      // Do not regress active accounts to pending or change roles/partner/permissions.
      if (targetProfile.invitation_status === "pending") {
        const { error: stampError } = await adminClient.from("profiles")
          .update({ invitation_sent_at: new Date().toISOString() }).eq("id", existingUser.id);
        if (stampError) return Response.json({ success: true, kind, warning: "Access email requested, but invitation timestamp could not be saved" }, { headers: corsHeaders });
      }
      return Response.json({ success: true, kind, message: "Access email requested" }, { headers: corsHeaders });
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

    // Pre-check: does an auth user with this email already exist?
    const existingAuthUser = await findAuthUser(adminClient.auth.admin, email);
    if (existingAuthUser) {
      return Response.json({
        error: "A user with this email already exists",
        code: "user_already_exists",
        userId: existingAuthUser.id,
      }, { status: 409, headers: corsHeaders });
    }

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
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo,
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
    const message = error instanceof Error ? error.message
      : typeof error === "object" && error !== null && "message" in error ? String(error.message)
      : "Unexpected error";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
};
}
