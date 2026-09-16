import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AHMED_SOURCE_OWNER_ID = "313453507";
const SOURCE_SYSTEM = "sharpspring";
const CLOSED_STAGES = ["won", "closed won", "lost", "closed lost", "closed"];

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const webhookSecret = Deno.env.get("SHARPSSPRING_OPPORTUNITY_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!webhookSecret || !supabaseUrl || !serviceKey) {
    console.error("Function is misconfigured: required environment values are absent");
    return json({ error: "Server misconfigured" }, 500);
  }

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token !== webhookSecret) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => null);
    if (body === null || typeof body !== "object") {
      return json({ error: "Invalid payload" }, 422);
    }

    const raw = body as Record<string, unknown>;
    const dryRunRaw = Array.isArray(body) ? undefined : raw.dry_run;
    const dryRun = dryRunRaw === false ? false : true;

    const rawItems: unknown = Array.isArray(body)
      ? body
      : Array.isArray(raw.opportunities)
        ? raw.opportunities
        : raw.opportunity ?? [raw].filter(() => raw.external_opportunity_id !== undefined);

    const items = (Array.isArray(rawItems) ? rawItems : [rawItems]) as Record<string, unknown>[];
    if (items.length === 0) return json({ error: "Invalid payload: no opportunities" }, 422);

    const supabase = createClient(supabaseUrl, serviceKey);

    // Resolve MENA partner and Ahmed's owner profile server-side (never hardcoded ids).
    const { data: partnerRows, error: partnerErr } = await supabase
      .from("partners")
      .select("id, company_name, region")
      .ilike("region", "%mena%");
    if (partnerErr) throw partnerErr;
    if (!partnerRows || partnerRows.length !== 1) {
      console.error("MENA partner did not resolve to exactly one record");
      return json({ error: "Server misconfigured: MENA partner unresolved" }, 500);
    }
    const partnerId = partnerRows[0].id as string;

    const { data: ownerRows, error: ownerErr } = await supabase
      .from("profiles")
      .select("id, full_name, partner_id")
      .ilike("full_name", "%ahmed%");
    if (ownerErr) throw ownerErr;
    const ownerMatch =
      (ownerRows ?? []).find((p) => p.partner_id === partnerId) ?? (ownerRows ?? [])[0] ?? null;
    const ownerId = (ownerMatch?.id as string | undefined) ?? null;

    // Hard validation before the preview RPC.
    const accepted: Record<string, unknown>[] = [];
    const rejected: Record<string, unknown>[] = [];

    for (const it of items) {
      const extId = String(it.external_opportunity_id ?? "").trim();
      const name = String(it.opportunity_name ?? "").trim();
      const srcUpdated = String(it.source_updated_at ?? "").trim();
      const stage = String(it.stage ?? it.source_stage_name ?? "").trim();
      const currency = String(it.currency ?? "EUR").trim().toUpperCase();
      const errors: string[] = [];

      if (String(it.source_system ?? "").trim().toLowerCase() !== SOURCE_SYSTEM) {
        errors.push("source_system must be sharpspring");
      }
      if (String(it.source_owner_id ?? "").trim() !== AHMED_SOURCE_OWNER_ID) {
        errors.push("source_owner_id is not the accepted SharpSpring owner");
      }
      if (!extId) errors.push("missing external_opportunity_id");
      if (!name) errors.push("missing opportunity_name");
      if (!srcUpdated || Number.isNaN(Date.parse(srcUpdated))) {
        errors.push("missing or invalid source_updated_at");
      }
      if (currency !== "EUR") errors.push("only EUR amounts are accepted");
      if (CLOSED_STAGES.includes(stage.toLowerCase())) {
        errors.push("closed/won opportunities are not accepted in this pass");
      }

      if (errors.length > 0) {
        rejected.push({
          external_opportunity_id: extId || null,
          action: "invalid",
          message: errors.join("; "),
        });
      } else {
        accepted.push(it);
      }
    }

    const previewPayload = accepted.map((it) => ({
      external_opportunity_id: String(it.external_opportunity_id),
      company_name: it.company_name ?? it.opportunity_name,
      amount_eur: it.amount_eur ?? it.amount ?? 0,
      close_date: it.close_date ?? null,
      stage: it.stage ?? it.source_stage_name ?? null,
    }));

    const { data: preview, error: previewErr } = await supabase.rpc(
      "preview_sharpspring_opportunity_sync",
      { payload: previewPayload, target_partner_id: partnerId, target_user_id: ownerId },
    );
    if (previewErr) throw previewErr;

    if (dryRun) {
      return json(
        {
          dry_run: true,
          partner_id: partnerId,
          owner_id: ownerId,
          owner_resolved: ownerId !== null,
          rejected,
          preview,
        },
        200,
      );
    }

    const previewItems = ((preview as Record<string, unknown>)?.items ?? []) as Record<string, unknown>[];
    const results: Record<string, unknown>[] = [...rejected];
    let created = 0;

    for (let i = 0; i < previewItems.length; i++) {
      const p = previewItems[i];
      const src = accepted[i];
      const extId = String(p.external_opportunity_id ?? "");
      let action = String(p.action ?? "invalid");
      const errs = (p.errors ?? []) as string[];

      if (action === "invalid" && errs.some((e) => e.startsWith("unrecognized source stage"))) {
        action = "review";
      }
      if (action !== "create" && action !== "update") {
        results.push({
          external_opportunity_id: extId,
          action,
          message: (errs.length ? errs : ((p.warnings ?? []) as string[])).join("; ") || "no write performed",
        });
        continue;
      }

      const sourceUpdatedAt = new Date(String(src.source_updated_at)).toISOString();

      const { data: existing, error: exErr } = await supabase
        .from("deals")
        .select("id, source_updated_at")
        .eq("source_system", SOURCE_SYSTEM)
        .eq("external_opportunity_id", extId)
        .maybeSingle();
      if (exErr) throw exErr;

      if (
        existing?.source_updated_at &&
        new Date(sourceUpdatedAt) < new Date(existing.source_updated_at as string)
      ) {
        results.push({
          external_opportunity_id: extId,
          action: "stale",
          deal_id: existing.id,
          message: "payload is older than the stored source_updated_at",
        });
        continue;
      }

      // Source-owned fields only. PartnerOS commercial/proposal fields are never touched.
      const fields: Record<string, unknown> = {
        company_name: String(src.company_name ?? src.opportunity_name),
        description: String(src.opportunity_name ?? ""),
        expected_value: Number(src.amount_eur ?? src.amount ?? 0),
        probability: src.probability === undefined || src.probability === null ? null : Number(src.probability),
        expected_close_date: src.close_date ?? null,
        stage: String(p.mapped_partneros_stage),
        source_system: SOURCE_SYSTEM,
        external_opportunity_id: extId,
        external_stage_id: src.external_stage_id ?? null,
        external_stage_name: String(src.stage ?? src.source_stage_name ?? ""),
        source_owner_id: AHMED_SOURCE_OWNER_ID,
        source_updated_at: sourceUpdatedAt,
        source_synced_at: new Date().toISOString(),
        sync_read_only: true,
        partner_id: partnerId,
        assigned_user_id: ownerId,
      };

      if (existing?.id) {
        const { error: upErr } = await supabase.from("deals").update(fields).eq("id", existing.id);
        if (upErr) throw upErr;
        results.push({
          external_opportunity_id: extId,
          action: "update",
          deal_id: existing.id,
          message: ownerId ? "updated from SharpSpring" : "updated; Ahmed owner profile unresolved",
        });
      } else {
        const { data: ins, error: insErr } = await supabase
          .from("deals")
          .insert({ ...fields, status: "Open" })
          .select("id")
          .single();
        if (insErr) throw insErr;
        created++;
        results.push({
          external_opportunity_id: extId,
          action: "create",
          deal_id: ins.id,
          message: ownerId ? "created from SharpSpring" : "created; Ahmed owner profile unresolved",
        });
      }
    }

    const onlyCreates = created > 0 && results.every((r) => r.action === "create");
    return json({ dry_run: false, partner_id: partnerId, owner_id: ownerId, results }, onlyCreates ? 201 : 200);
  } catch (err) {
    console.error("ingest-sharpspring-opportunity error:", err instanceof Error ? err.message : "unknown error");
    return json({ error: "Internal error" }, 500);
  }
});
