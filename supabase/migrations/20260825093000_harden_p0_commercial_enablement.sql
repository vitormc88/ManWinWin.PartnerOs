-- P0 hardening: atomic lead promotion, strict override integrity and HQ-only deletes.

DROP POLICY IF EXISTS discovery_stakeholders_delete ON public.discovery_stakeholders;
CREATE POLICY discovery_stakeholders_delete ON public.discovery_stakeholders
FOR DELETE TO authenticated
USING (public.has_role((select auth.uid()), 'hq_admin'::app_role));

DO $$
DECLARE _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'target_account_evidence', 'target_account_signals',
    'target_account_people', 'target_account_activities'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_delete ON public.%1$s', _table);
    EXECUTE format(
      'CREATE POLICY %1$s_delete ON public.%1$s FOR DELETE TO authenticated USING (public.has_role((select auth.uid()), ''hq_admin''::app_role))',
      _table
    );
  END LOOP;
END $$;

ALTER TABLE public.stage_gate_overrides
  DROP CONSTRAINT IF EXISTS stage_gate_overrides_entity_parent_match;
ALTER TABLE public.stage_gate_overrides
  ADD CONSTRAINT stage_gate_overrides_entity_parent_match CHECK (
    (entity_type = 'lead' AND lead_id IS NOT NULL)
    OR (entity_type = 'deal' AND deal_id IS NOT NULL)
  );

ALTER TABLE public.stage_gate_overrides
  DROP CONSTRAINT IF EXISTS stage_gate_overrides_reason_not_blank;
ALTER TABLE public.stage_gate_overrides
  ADD CONSTRAINT stage_gate_overrides_reason_not_blank CHECK (length(btrim(reason)) > 0);

CREATE OR REPLACE FUNCTION public.promote_lead_to_deal(
  _lead_id uuid,
  _deal jsonb,
  _override jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _deal_id uuid;
  _lead public.incoming_leads%ROWTYPE;
BEGIN
  SELECT * INTO _lead
  FROM public.incoming_leads
  WHERE id = _lead_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.can_manage_lead(_lead_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: lead cannot be promoted';
  END IF;
  IF _lead.converted_to_deal_id IS NOT NULL THEN
    RETURN _lead.converted_to_deal_id;
  END IF;
  IF _lead.status <> 'Qualified' THEN
    RAISE EXCEPTION 'LEAD_NOT_QUALIFIED: an explicit Qualified decision is required';
  END IF;
  IF NULLIF(btrim(_deal->>'company_name'), '') IS NULL THEN
    RAISE EXCEPTION 'COMPANY_REQUIRED: company name is required';
  END IF;

  INSERT INTO public.deals (
    company_name, contact_person_name, partner_id, country, industry, stage,
    expected_value, probability, assigned_user_id, assigned_salesperson,
    lead_source, notes, status, contact_email, contact_phone, job_role, sector,
    asset_range, maintenance_team_size, register_date, stage_entered_at
  ) VALUES (
    NULLIF(btrim(_deal->>'company_name'), ''), NULLIF(_deal->>'contact_person_name', ''),
    NULLIF(_deal->>'partner_id', '')::uuid, NULLIF(_deal->>'country', ''),
    NULLIF(_deal->>'industry', ''), COALESCE(NULLIF(_deal->>'stage', ''), 'Qualified'),
    COALESCE(NULLIF(_deal->>'expected_value', '')::numeric, 0),
    COALESCE(NULLIF(_deal->>'probability', '')::integer, 0),
    NULLIF(_deal->>'assigned_user_id', '')::uuid, NULLIF(_deal->>'assigned_salesperson', ''),
    COALESCE(NULLIF(_deal->>'lead_source', ''), 'HQ (Inbound)'), NULLIF(_deal->>'notes', ''),
    'Open', NULLIF(_deal->>'contact_email', ''), NULLIF(_deal->>'contact_phone', ''),
    NULLIF(_deal->>'job_role', ''), NULLIF(_deal->>'sector', ''),
    NULLIF(_deal->>'asset_range', ''), NULLIF(_deal->>'maintenance_team_size', ''),
    COALESCE(NULLIF(_deal->>'register_date', '')::date, current_date), now()
  )
  RETURNING id INTO _deal_id;

  UPDATE public.incoming_leads
  SET converted_to_deal_id = _deal_id, status = 'Converted'
  WHERE id = _lead_id;

  UPDATE public.discovery_records SET deal_id = _deal_id WHERE lead_id = _lead_id;
  UPDATE public.agreed_next_steps SET deal_id = _deal_id WHERE lead_id = _lead_id;

  IF _override IS NOT NULL THEN
    INSERT INTO public.stage_gate_overrides (
      entity_type, lead_id, deal_id, from_stage, to_stage,
      missing_evidence, reason, performed_by
    ) VALUES (
      'lead', _lead_id, _deal_id, _lead.status,
      COALESCE(NULLIF(_deal->>'stage', ''), 'Qualified'),
      COALESCE(_override->'missing_evidence', '[]'::jsonb),
      NULLIF(btrim(_override->>'reason'), ''), (select auth.uid())
    );
  END IF;

  RETURN _deal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_lead_to_deal(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_lead_to_deal(uuid, jsonb, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.promote_lead_to_deal(uuid, jsonb, jsonb)
IS 'Atomically creates an opportunity, marks its qualified lead converted, carries discovery and next steps, and records any gate override.';

CREATE OR REPLACE FUNCTION public.convert_target_account_to_lead(
  _account_id uuid,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _account public.target_accounts%ROWTYPE;
  _person public.target_account_people%ROWTYPE;
  _lead_id uuid;
BEGIN
  SELECT * INTO _account
  FROM public.target_accounts
  WHERE id = _account_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.can_manage_target_account(_account_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: target account cannot be converted';
  END IF;
  IF _account.converted_lead_id IS NOT NULL THEN
    RETURN _account.converted_lead_id;
  END IF;
  IF _account.status <> 'Ready for Outreach' THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_READY: status must be Ready for Outreach';
  END IF;

  SELECT * INTO _person
  FROM public.target_account_people
  WHERE target_account_id = _account_id AND is_primary_contact
  LIMIT 1;

  IF NOT FOUND OR NULLIF(btrim(_person.full_name), '') IS NULL
     OR (NULLIF(btrim(_person.email), '') IS NULL AND NULLIF(btrim(_person.phone), '') IS NULL) THEN
    RAISE EXCEPTION 'PRIMARY_CONTACT_REQUIRED: name and email or phone are required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.target_account_activities
    WHERE target_account_id = _account_id
      AND outcome IN ('replied', 'meeting_scheduled', 'referral_inbound', 'agreed_next_step')
  ) THEN
    RAISE EXCEPTION 'MEANINGFUL_ENGAGEMENT_REQUIRED: record real two-way engagement first';
  END IF;

  INSERT INTO public.incoming_leads (
    company_name, country, sector, contact_name, email, phone, job_role,
    lead_source, linked_partner_id, assigned_user_id, source_target_account_id, notes
  ) VALUES (
    _account.company_name, _account.country, _account.industry, _person.full_name,
    _person.email, _person.phone, _person.job_title, 'Prospecting',
    _account.partner_uuid, _account.owner_user_id, _account.id, _notes
  ) RETURNING id INTO _lead_id;

  UPDATE public.target_accounts
  SET status = 'Converted', converted_lead_id = _lead_id
  WHERE id = _account_id;

  RETURN _lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_target_account_to_lead(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_target_account_to_lead(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.convert_target_account_to_lead(uuid, text)
IS 'Atomically converts a ready target account with a usable primary contact and recorded meaningful engagement into one lead.';
