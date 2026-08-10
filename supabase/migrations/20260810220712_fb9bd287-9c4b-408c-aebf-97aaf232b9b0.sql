-- 1) One principal proposal per renewal (duplicates verified absent before creation)
DO $$
DECLARE _dups int;
BEGIN
  SELECT count(*) INTO _dups FROM (
    SELECT renewal_id FROM public.proposals
    WHERE renewal_id IS NOT NULL GROUP BY renewal_id HAVING count(*) > 1
  ) d;
  IF _dups > 0 THEN
    RAISE EXCEPTION 'Duplicate renewal proposals detected for % renewal(s); resolve manually before applying constraint', _dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS proposals_one_per_renewal_uidx
  ON public.proposals (renewal_id)
  WHERE renewal_id IS NOT NULL;

-- 2) Strengthen link_renewal_proposal: explicit conflict, never log against another proposal
CREATE OR REPLACE FUNCTION public.link_renewal_proposal(
  _renewal_id uuid,
  _proposal_id uuid,
  _action text,
  _performed_by text DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prop public.proposals%ROWTYPE;
  _linked uuid;
BEGIN
  SELECT * INTO _prop FROM public.proposals WHERE id = _proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal % not found', _proposal_id USING ERRCODE = 'no_data_found';
  END IF;
  IF _prop.renewal_id IS DISTINCT FROM _renewal_id THEN
    RAISE EXCEPTION 'Proposal % does not belong to renewal %', _proposal_id, _renewal_id;
  END IF;
  IF NOT public.can_access_renewal_proposal(_prop.renewal_id, _prop.client_id, _prop.partner_uuid) THEN
    RAISE EXCEPTION 'Not authorized for renewal %', _renewal_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _action NOT IN ('proposal_created','proposal_updated') THEN
    RAISE EXCEPTION 'Invalid action %', _action;
  END IF;

  SELECT source_proposal_id INTO _linked FROM public.renewals WHERE id = _renewal_id FOR UPDATE;

  IF _linked IS NOT NULL AND _linked <> _proposal_id THEN
    RAISE EXCEPTION 'Renewal % is already linked to proposal %', _renewal_id, _linked
      USING ERRCODE = 'unique_violation';
  END IF;

  IF _linked IS NULL THEN
    UPDATE public.renewals SET source_proposal_id = _proposal_id WHERE id = _renewal_id;
    _linked := _proposal_id;
  END IF;

  INSERT INTO public.renewal_activities (renewal_id, action, performed_by, notes)
  VALUES (_renewal_id, _action, _performed_by, _notes);

  RETURN _linked;
END;
$$;

REVOKE ALL ON FUNCTION public.link_renewal_proposal(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_renewal_proposal(uuid, uuid, text, text, text) TO authenticated, service_role;

-- 3) Single transactional save for renewal proposals (proposal + items + link + activity)
CREATE OR REPLACE FUNCTION public.save_renewal_proposal(
  _renewal_id uuid,
  _proposal_id uuid,
  _payload jsonb,
  _items jsonb,
  _performed_by text DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_id uuid;
  _partner uuid;
  _existing uuid;
  _target uuid;
  _row public.proposals%ROWTYPE;
  _is_update boolean;
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

  IF _proposal_id IS NOT NULL AND _existing IS NOT NULL AND _existing <> _proposal_id THEN
    RAISE EXCEPTION 'Renewal % already has proposal %', _renewal_id, _existing
      USING ERRCODE = 'unique_violation';
  END IF;

  _target := COALESCE(_proposal_id, _existing);
  _is_update := _target IS NOT NULL;

  -- Force canonical source identity; never trust client-supplied routing columns.
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
    _row := jsonb_populate_record(_row, _payload - 'id' - 'created_at');
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
      contract_id = _row.contract_id, license_id = _row.license_id
    WHERE id = _target;
    DELETE FROM public.proposal_items WHERE proposal_id = _target;
  ELSE
    _row := jsonb_populate_record(NULL::public.proposals, _payload - 'id' - 'created_at');
    INSERT INTO public.proposals SELECT (_row).* RETURNING id INTO _target;
  END IF;

  IF _items IS NOT NULL AND jsonb_typeof(_items) = 'array' AND jsonb_array_length(_items) > 0 THEN
    INSERT INTO public.proposal_items
    SELECT (jsonb_populate_record(NULL::public.proposal_items, e - 'id' - 'proposal_id')).*
    FROM jsonb_array_elements(_items) e;
    UPDATE public.proposal_items SET proposal_id = _target WHERE proposal_id IS NULL;
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
$$;

REVOKE ALL ON FUNCTION public.save_renewal_proposal(uuid, uuid, jsonb, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_renewal_proposal(uuid, uuid, jsonb, jsonb, text, text) TO authenticated, service_role;