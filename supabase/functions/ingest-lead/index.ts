import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authenticate using WEBHOOK_SECRET
  const authHeader = req.headers.get("Authorization");
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");

  if (!webhookSecret) {
    console.error("WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== webhookSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    // Support single lead or array of leads
    const leads = Array.isArray(body) ? body : [body];

    // Validate and sanitize each lead
    const sanitized = leads.map((lead: Record<string, unknown>) => ({
      company_name: lead.company_name ?? null,
      contact_name: lead.contact_name ?? null,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      country: lead.country ?? null,
      job_role: lead.job_role ?? null,
      sector: lead.sector ?? null,
      notes: lead.notes ?? null,
      lead_source: lead.lead_source ?? null,
      linked_partner_name: lead.linked_partner_name ?? null,
      lead_owner_type: lead.lead_owner_type ?? null,
      routing_reason: lead.routing_reason ?? null,
      sharpspring_id: lead.sharpspring_id ?? null,
      asset_range: lead.asset_range ?? "Unknown",
      maintenance_team_size: lead.maintenance_team_size ?? "Unknown",
    }));

    // Use service role to bypass RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("incoming_leads")
      .insert(sanitized)
      .select();

    if (error) {
      // Duplicate sharpspring_id → 409
      if (error.code === "23505") {
        return new Response(
          JSON.stringify({ error: "Duplicate lead", detail: error.message }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      throw error;
    }

    return new Response(
      JSON.stringify({ success: true, count: data.length, data }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Ingest error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
