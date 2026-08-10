CREATE OR REPLACE FUNCTION public.save_renewal_proposal(_renewal_id uuid, _proposal_id uuid, _payload jsonb, _items jsonb, _performed_by text DEFAULT NULL::text, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _client_id uuid;
  _partner uuid;
  _existing uuid;
  _target uuid;
  _row public.proposals%ROWTYPE;
  _item public.proposal_items%ROWTYPE;
  _e jsonb;
  _is_update boolean;
  _owner_renewal uuid;
  _found boolean;
BEGIN
  SELECT r.client_id INTO _client_id FROM public.renewals r WHERE r.id = _renewal_id;
  IF _client_id IS NULL THEN
    RAISE EXCEPTION 'Renewal % not found', _renewal_id USING ERRCODE = 'no_data_found';
  END IF;

  _partner := public.renewal_canonical_partner(_renewal_id);

  IF NOT public.can_access_renewal_proposal(_renewal_id, _client_id, _partner) THEN
    RAISE EXCEPTION 'Not authorized for renewal %', _renewal_id USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO _existing FROM public.proposals WHERE renewal_id = _renewal_id FOR UPDATE;

  -- Ownership guard: a supplied proposal id must already belong to THIS renewal.
  -- Prevents transferring a proposal (possibly another partner's) between renewals.
  IF _proposal_id IS NOT NULL THEN
    SELECT p.renewal_id, true INTO _owner_renewal, _found
    FROM public.proposals p WHERE p.id = _proposal_id FOR UPDATE;

    IF NOT COALESCE(_found, false) THEN
      RAISE EXCEPTION 'Proposal % not found', _proposal_id USING ERRCODE = 'no_data_found';
    END IF;

    IF _owner_renewal IS DISTINCT FROM _renewal_id THEN
      RAISE EXCEPTION 'Proposal % does not belong to renewal %', _proposal_id, _renewal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF _proposal_id IS NOT NULL AND _existing IS NOT NULL AND _existing <> _proposal_id THEN
    RAISE EXCEPTION 'Renewal % already has proposal %', _renewal_id, _existing
      USING ERRCODE = 'unique_violation';
  END IF;

  _target := COALESCE(_proposal_id, _existing);
  _is_update := _target IS NOT NULL;

  _payload := _payload
    || jsonb_build_object(
         'source_type', 'renewal',
         'renewal_id', _renewal_id,
         'client_id', _client_id,
         'partner_uuid', _partner,
         'lead_id', NULL,
         'deal_id', NULL
       );

  IF _is_update THEN
    SELECT * INTO _row FROM public.proposals WHERE id = _target;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Proposal % not found', _target USING ERRCODE = 'no_data_found';
    END IF;
    _row := jsonb_populate_record(_row, _payload - 'id' - 'created_at' - 'updated_at');
    _row.id := _target;
    UPDATE public.proposals SET
      source_type = _row.source_type, renewal_id = _row.renewal_id, client_id = _row.client_id,
      partner_uuid = _row.partner_uuid, lead_id = NULL, deal_id = NULL,
      version = _row.version, language = _row.language, plan = _row.plan, status = _row.status,
      hosting = _row.hosting, product_family = _row.product_family, license_model = _row.license_model,
      proposal_mode = _row.proposal_mode, deployment = _row.deployment, business_config = _row.business_config,
      client_name = _row.client_name, project_name = _row.project_name, country = _row.country,
      proposal_date = _row.proposal_date, validity_days = _row.validity_days, payment_terms = _row.payment_terms,
      notes = _row.notes, implementation_type = _row.implementation_type, per_diem = _row.per_diem,
      discount_pct = _row.discount_pct, discount_scope = _row.discount_scope,
      software_discount_pct = _row.software_discount_pct, services_discount_pct = _row.services_discount_pct,
      include_requests_module = _row.include_requests_module, web_users = _row.web_users,
      service_days = _row.service_days, software_subtotal = _row.software_subtotal,
      services_subtotal = _row.services_subtotal, discount_amount = _row.discount_amount,
      total_year_1 = _row.total_year_1, total_recurring = _row.total_recurring,
      contract_id = _row.contract_id, license_id = _row.license_id,
      updated_at = now()
    WHERE id = _target;
    DELETE FROM public.proposal_items WHERE proposal_id = _target;
  ELSE
    _row := jsonb_populate_record(NULL::public.proposals, _payload - 'id' - 'created_at' - 'updated_at');
    _row.id := gen_random_uuid();
    _row.created_at := now();
    _row.updated_at := now();
    INSERT INTO public.proposals SELECT (_row).*;
    _target := _row.id;
  END IF;

  IF _items IS NOT NULL AND jsonb_typeof(_items) = 'array' THEN
    FOR _e IN SELECT jsonb_array_elements(_items) LOOP
      _item := jsonb_populate_record(NULL::public.proposal_items, _e - 'id' - 'proposal_id' - 'created_at');
      _item.id := gen_random_uuid();
      _item.proposal_id := _target;
      _item.created_at := now();
      INSERT INTO public.proposal_items SELECT (_item).*;
    END LOOP;
  END IF;

  PERFORM public.link_renewal_proposal(
    _renewal_id,
    _target,
    CASE WHEN _is_update THEN 'proposal_updated' ELSE 'proposal_created' END,
    _performed_by,
    _notes
  );

  RETURN _target;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_renewal_proposal(uuid, uuid, jsonb, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_renewal_proposal(uuid, uuid, jsonb, jsonb, text, text) TO authenticated;