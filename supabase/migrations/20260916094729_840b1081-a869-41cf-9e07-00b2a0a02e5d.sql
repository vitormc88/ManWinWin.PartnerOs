CREATE OR REPLACE FUNCTION public.preview_sharpspring_opportunity_sync(
  payload jsonb,
  target_partner_id uuid DEFAULT NULL,
  target_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  item jsonb;
  items jsonb := '[]'::jsonb;
  ext_id text;
  company text;
  norm_company text;
  email text;
  amount numeric;
  close_date_txt text;
  src_stage text;
  mapped_stage text;
  notes_arr jsonb;
  contact_obj jsonb;
  note_count int;
  contact_count int;
  warnings text[];
  errors text[];
  matched uuid;
  candidates uuid[];
  action text;
  t_records int := 0; t_create int := 0; t_update int := 0; t_review int := 0; t_invalid int := 0;
  t_notes int := 0; t_contacts int := 0; t_amount numeric := 0;
  evidence_warning constant text :=
    'Stage synchronized from SharpSpring, the authoritative CRM. Missing PartnerOS evidence was not inferred. Review required.';
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'array' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'payload must be a JSON array',
      'items', '[]'::jsonb,
      'totals', jsonb_build_object('records',0,'create',0,'update',0,'review',0,'invalid',0,'notes',0,'contacts',0,'total_amount_eur',0)
    );
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(payload) LOOP
    warnings := ARRAY[]::text[];
    errors := ARRAY[]::text[];
    matched := NULL;
    candidates := ARRAY[]::uuid[];

    ext_id := NULLIF(btrim(COALESCE(item->>'external_opportunity_id', item->>'opportunity_id', item->>'id', '')), '');
    company := NULLIF(btrim(COALESCE(item->>'company_name', item->>'company', '')), '');
    email := lower(NULLIF(btrim(COALESCE(item#>>'{contact,email}', '')), ''));
    close_date_txt := NULLIF(btrim(COALESCE(item->>'close_date', '')), '');
    src_stage := NULLIF(btrim(COALESCE(item->>'stage', item->>'source_stage_name', '')), '');
    notes_arr := CASE WHEN jsonb_typeof(COALESCE(item->'opportunity_notes','null')) = 'array'
                      THEN item->'opportunity_notes' ELSE '[]'::jsonb END;
    contact_obj := CASE WHEN jsonb_typeof(COALESCE(item->'contact','null')) = 'object'
                        THEN item->'contact' ELSE NULL END;
    note_count := jsonb_array_length(notes_arr);
    contact_count := CASE WHEN contact_obj IS NULL THEN 0 ELSE 1 END;

    IF ext_id IS NULL THEN errors := errors || 'missing external_opportunity_id'::text; END IF;
    IF company IS NULL THEN errors := errors || 'missing company_name'::text; END IF;

    amount := NULL;
    BEGIN
      amount := (COALESCE(item->>'amount_eur', item->>'amount', '0'))::numeric;
    EXCEPTION WHEN others THEN
      errors := errors || 'amount_eur is not numeric'::text;
    END;
    IF amount IS NOT NULL AND amount < 0 THEN errors := errors || 'amount_eur must be >= 0'::text; END IF;

    IF close_date_txt IS NOT NULL THEN
      BEGIN
        PERFORM close_date_txt::date;
      EXCEPTION WHEN others THEN
        errors := errors || 'close_date is not a valid date'::text;
      END;
    END IF;

    mapped_stage := CASE lower(COALESCE(src_stage,''))
      WHEN 'meeting1' THEN 'Qualified'
      WHEN 'meeting 1' THEN 'Qualified'
      WHEN 'advance1' THEN 'Decision Path Confirmed'
      WHEN 'advance 1' THEN 'Decision Path Confirmed'
      WHEN 'price negotiation' THEN 'Price Negotiation'
      WHEN 'won' THEN 'Won'
      WHEN 'closed won' THEN 'Won'
      ELSE NULL
    END;
    IF mapped_stage IS NULL THEN
      errors := errors || format('unrecognized source stage: %s', COALESCE(src_stage,'(none)'))::text;
    ELSE
      warnings := warnings || evidence_warning;
      IF mapped_stage = 'Won' THEN
        warnings := warnings || 'Won/Closed Won: operational conversion is pending a valid PartnerOS proposal. No client, license, contract, revenue or renewal record is created by this dry-run.'::text;
      END IF;
    END IF;

    IF array_length(errors,1) IS NOT NULL THEN
      action := 'invalid';
    ELSE
      norm_company := regexp_replace(lower(company), '[^a-z0-9]', '', 'g');

      SELECT d.id INTO matched
      FROM public.deals d
      WHERE lower(d.source_system) = 'sharpspring'
        AND d.external_opportunity_id = ext_id
      LIMIT 1;

      IF matched IS NOT NULL THEN
        action := 'update';
      ELSE
        SELECT array_agg(d.id) INTO candidates
        FROM public.deals d
        WHERE regexp_replace(lower(COALESCE(d.company_name,'')), '[^a-z0-9]', '', 'g') = norm_company
           OR (email IS NOT NULL AND lower(COALESCE(d.contact_email,'')) = email);

        IF candidates IS NULL OR array_length(candidates,1) IS NULL THEN
          action := 'create';
        ELSIF array_length(candidates,1) = 1 THEN
          action := 'review';
          warnings := warnings || 'Candidate PartnerOS deal matched by normalized company/email. Ambiguous match is never merged automatically.'::text;
        ELSE
          action := 'review';
          warnings := warnings || 'Multiple candidate PartnerOS deals matched by normalized company/email. Manual review required.'::text;
        END IF;
      END IF;
    END IF;

    t_records := t_records + 1;
    t_notes := t_notes + note_count;
    t_contacts := t_contacts + contact_count;
    IF action <> 'invalid' THEN t_amount := t_amount + COALESCE(amount,0); END IF;
    IF action = 'create' THEN t_create := t_create + 1;
    ELSIF action = 'update' THEN t_update := t_update + 1;
    ELSIF action = 'review' THEN t_review := t_review + 1;
    ELSE t_invalid := t_invalid + 1; END IF;

    items := items || jsonb_build_array(jsonb_build_object(
      'external_opportunity_id', ext_id,
      'company_name', company,
      'action', action,
      'matched_deal_id', matched,
      'candidate_deal_ids', COALESCE(to_jsonb(candidates), '[]'::jsonb),
      'mapped_partneros_stage', mapped_stage,
      'source_stage_name', src_stage,
      'amount_eur', amount,
      'note_count', note_count,
      'contact_count', contact_count,
      'warnings', to_jsonb(warnings),
      'errors', to_jsonb(errors)
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', true,
    'target_partner_id', target_partner_id,
    'target_user_id', target_user_id,
    'items', items,
    'totals', jsonb_build_object(
      'records', t_records,
      'create', t_create,
      'update', t_update,
      'review', t_review,
      'invalid', t_invalid,
      'notes', t_notes,
      'contacts', t_contacts,
      'total_amount_eur', t_amount
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.preview_sharpspring_opportunity_sync(jsonb, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_sharpspring_opportunity_sync(jsonb, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_sharpspring_opportunity_sync(jsonb, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_sharpspring_opportunity_sync(jsonb, uuid, uuid) TO service_role;