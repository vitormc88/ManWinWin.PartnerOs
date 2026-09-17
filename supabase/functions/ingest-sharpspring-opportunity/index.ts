import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AHMED_SOURCE_OWNER_ID = "313453507";
const SOURCE_SYSTEM = "sharpspring";
const CLOSED_STAGES = ["won", "closed won", "lost", "closed lost", "closed"];

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function asArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(asObject).filter((v): v is JsonObject => v !== null) : [];
}

function textValue(...values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return null;
}

function sourceTimestamp(value: unknown): string | null {
  const raw = textValue(value);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(" ", "T")}Z`
    : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sourceDate(value: unknown): string | null {
  const timestamp = sourceTimestamp(value);
  return timestamp ? timestamp.slice(0, 10) : null;
}

function normalizeTeamSize(value: unknown): string | null {
  const raw = textValue(value);
  if (!raw) return null;
  if (/^1\s*(to|[-–])\s*3$/i.test(raw)) return "1–3";
  if (/^(4|more than 3)/i.test(raw)) return "4 or more";
  return raw;
}

function normalizeAssetRange(value: unknown): string | null {
  const raw = textValue(value);
  if (!raw) return null;
  if (/less than 100|^1\s*(to|[-–])\s*100$/i.test(raw)) return "1–100";
  if (/^101\s*(to|[-–])\s*250$/i.test(raw)) return "101–250";
  if (/more than 250|^\+?250/i.test(raw)) return "+250";
  return raw;
}

async function syncEnrichment(
  supabase: ReturnType<typeof createClient>,
  dealId: string,
  src: JsonObject,
  ownerId: string | null,
  ownerName: string | null,
) {
  let contacts = 0;
  let activities = 0;
  let tasks = 0;

  const contact = asObject(src.contact);
  if (contact) {
    const externalContactId = textValue(contact.id, contact.leadID);
    const contactName = textValue(
      [textValue(contact.firstName), textValue(contact.lastName)].filter(Boolean).join(" "),
      contact.displayName,
      contact.emailAddress,
    );
    const role = textValue(
      contact.title,
      contact.role_at_your_company_59e4c2a258846,
    );
    const email = textValue(contact.emailAddress, contact.email);
    const phone = textValue(contact.phoneNumber, contact.mobilePhoneNumber, contact.officePhoneNumber);
    const contactUpdatedAt = sourceTimestamp(contact.updateTimestamp, contact.createTimestamp);

    const dealContactFields: JsonObject = {
      deal_id: dealId,
      contact_name: contactName,
      role,
      email,
      phone,
      is_decision_maker: false,
      notes: textValue(contact.description),
      source_system: SOURCE_SYSTEM,
      external_contact_id: externalContactId,
      source_updated_at: contactUpdatedAt,
      sync_read_only: true,
    };

    if (externalContactId && contactName) {
      const { data: existingContact, error: contactLookupError } = await supabase
        .from("deal_contacts")
        .select("id")
        .eq("source_system", SOURCE_SYSTEM)
        .eq("external_contact_id", externalContactId)
        .maybeSingle();
      if (contactLookupError) throw contactLookupError;

      const contactWrite = existingContact?.id
        ? await supabase.from("deal_contacts").update(dealContactFields).eq("id", existingContact.id)
        : await supabase.from("deal_contacts").insert(dealContactFields);
      if (contactWrite.error) throw contactWrite.error;
      contacts++;
    }

    const sector = textValue(
      contact.industry,
      contact.company_business_sector_5eafdc3b7e0aa,
      contact.sector__company_name___account__5a295585ea85c,
    );
    const dealEnrichment: JsonObject = {
      company_name: textValue(contact.companyName, src.company_name, src.opportunity_name),
      contact_person_name: contactName,
      contact_email: email,
      contact_phone: phone,
      country: textValue(contact.country),
      job_role: role,
      industry: sector,
      sector,
      maintenance_team_size: normalizeTeamSize(contact.maintenance_team_size_59e4c359d2eb4),
      asset_range: normalizeAssetRange(contact.number_of_assets_in_cmms_5e91769c6ed0e),
    };
    for (const key of Object.keys(dealEnrichment)) {
      if (dealEnrichment[key] === null) delete dealEnrichment[key];
    }
    if (Object.keys(dealEnrichment).length > 0) {
      const { error: dealEnrichmentError } = await supabase
        .from("deals")
        .update(dealEnrichment)
        .eq("id", dealId);
      if (dealEnrichmentError) throw dealEnrichmentError;
    }
  }

  for (const note of asArray(src.opportunity_notes)) {
    const externalNoteId = textValue(note.id, note.noteID);
    const description = textValue(note.note, note.description, note.body);
    if (!externalNoteId || !description) continue;

    const createdAt = sourceTimestamp(note.createTimestamp) ?? new Date().toISOString();
    const noteFields: JsonObject = {
      deal_id: dealId,
      activity_type: "note",
      subject: textValue(note.title) ?? "SharpSpring note",
      description,
      performed_by: textValue(note.displayName, note.emailAddress, ownerName),
      performed_by_user_id: ownerId,
      activity_date: createdAt,
      tags: ["SharpSpring"],
      source_system: SOURCE_SYSTEM,
      external_note_id: externalNoteId,
      source_created_at: createdAt,
      source_updated_at: sourceTimestamp(note.updateTimestamp) ?? createdAt,
      sync_read_only: true,
    };

    const { data: existingNote, error: noteLookupError } = await supabase
      .from("deal_activities")
      .select("id")
      .eq("source_system", SOURCE_SYSTEM)
      .eq("external_note_id", externalNoteId)
      .maybeSingle();
    if (noteLookupError) throw noteLookupError;

    const noteWrite = existingNote?.id
      ? await supabase.from("deal_activities").update(noteFields).eq("id", existingNote.id)
      : await supabase.from("deal_activities").insert({ ...noteFields, created_at: createdAt });
    if (noteWrite.error) throw noteWrite.error;
    activities++;
  }

  for (const task of asArray(src.source_tasks)) {
    const externalTaskId = textValue(task.id, task.taskID);
    const title = textValue(task.subject, task.title, task.taskName, task.name, task.note, task.description);
    if (!externalTaskId || !title) continue;

    const marker = `[SharpSpring task ${externalTaskId}]`;
    const description = [textValue(task.description, task.note), marker].filter(Boolean).join("\n\n");
    const taskFields: JsonObject = {
      deal_id: dealId,
      title,
      description,
      assigned_to: ownerName,
      assigned_user_id: ownerId,
      due_date: sourceDate(task.dueDate, task.dueTimestamp, task.date),
      is_completed: false,
      status: "To Do",
      priority: textValue(task.priority) ?? "Medium",
    };

    const { data: existingTask, error: taskLookupError } = await supabase
      .from("deal_tasks")
      .select("id")
      .eq("deal_id", dealId)
      .ilike("description", `%${marker}%`)
      .maybeSingle();
    if (taskLookupError) throw taskLookupError;

    const taskWrite = existingTask?.id
      ? await supabase.from("deal_tasks").update(taskFields).eq("id", existingTask.id)
      : await supabase.from("deal_tasks").insert(taskFields);
    if (taskWrite.error) throw taskWrite.error;
    tasks++;
  }

  return { contacts, activities, tasks };
}

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
    const ownerName = textValue(ownerMatch?.full_name);

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

      let dealId: string;
      let writeAction: "create" | "update";
      if (existing?.id) {
        const { error: upErr } = await supabase.from("deals").update(fields).eq("id", existing.id);
        if (upErr) throw upErr;
        dealId = String(existing.id);
        writeAction = "update";
      } else {
        const { data: ins, error: insErr } = await supabase
          .from("deals")
          .insert({ ...fields, status: "Open" })
          .select("id")
          .single();
        if (insErr) throw insErr;
        created++;
        dealId = String(ins.id);
        writeAction = "create";
      }

      const enrichment = await syncEnrichment(supabase, dealId, src, ownerId, ownerName);
      results.push({
        external_opportunity_id: extId,
        action: writeAction,
        deal_id: dealId,
        enrichment,
        message: ownerId
          ? `${writeAction === "create" ? "created" : "updated"} from SharpSpring with related data`
          : `${writeAction === "create" ? "created" : "updated"}; Ahmed owner profile unresolved`,
      });
    }

    const onlyCreates = created > 0 && results.every((r) => r.action === "create");
    return json({ dry_run: false, partner_id: partnerId, owner_id: ownerId, results }, onlyCreates ? 201 : 200);
  } catch (err) {
    console.error("ingest-sharpspring-opportunity error:", err instanceof Error ? err.message : "unknown error");
    return json({ error: "Internal error" }, 500);
  }
});
