CREATE OR REPLACE FUNCTION public.validate_proposal(_proposal_id uuid, _difference_category text DEFAULT NULL, _difference_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.proposals%ROWTYPE; r public.renewals%ROWTYPE;
  _errs text[] := '{}'; _items int; _contract numeric; _diff numeric;
  _is_renewal boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO p FROM public.proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND'; END IF;
  IF NOT public.can_manage_proposal_document(_proposal_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: you cannot validate this proposal';
  END IF;
  IF p.status = 'Ready' THEN
    RETURN jsonb_build_object('proposal_id', p.id, 'status', 'Ready', 'already_validated', true);
  END IF;
  IF p.status <> 'Draft' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: only Draft proposals can be validated (current: %)', p.status;
  END IF;
  _is_renewal := p.renewal_id IS NOT NULL OR p.source_type = 'renewal';

  IF coalesce(btrim(p.client_name),'') = '' THEN _errs := _errs || 'Client name is missing.'; END IF;
  SELECT count(*) INTO _items FROM public.proposal_items WHERE proposal_id = p.id;
  IF _items = 0 THEN _errs := _errs || 'The proposal has no line items.'; END IF;
  IF coalesce(p.total_year_1,0) <= 0 THEN _errs := _errs || 'The proposal has no commercial value.'; END IF;
  IF coalesce(p.total_recurring,0) < 0 OR coalesce(p.total_recurring,0) > coalesce(p.total_year_1,0) + 0.01 THEN
    _errs := _errs || 'Recurring total is inconsistent with the Year 1 total.';
  END IF;
  -- Variant is required to close a renewal; opportunity award resolves it at conversion.
  IF _is_renewal AND p.product_family = 'Business' AND coalesce(btrim(p.license_model),'') = '' THEN
    _errs := _errs || 'The commercial variant (licence model) must be resolved.';
  END IF;

  IF _is_renewal THEN
    SELECT * INTO r FROM public.renewals WHERE id = p.renewal_id;
    IF NOT FOUND THEN _errs := _errs || 'The proposal is not linked to a renewal.';
    ELSIF r.closed_at IS NOT NULL THEN _errs := _errs || 'The renewal is already closed.';
    ELSE
      _contract := public.proposal_contract_recurring(p.id);
      IF _contract IS NULL THEN
        _errs := _errs || 'No contract is linked, so the renewal baseline cannot be checked.';
      ELSE
        _diff := round(coalesce(p.total_recurring,0) - _contract, 2);
        IF abs(_diff) > 0.01 THEN
          _difference_category := coalesce(_difference_category, p.difference_category);
          _difference_note := coalesce(nullif(btrim(_difference_note),''), p.difference_note);
          IF _difference_category IS NULL OR _difference_category NOT IN
             ('price_change','plan_change','discount','indexation','scope_change','year2_progression','promo_end','other') THEN
            _errs := _errs || format('Recurring value %s differs from the contract (%s) by %s: choose a difference category.',
                                     coalesce(p.total_recurring,0), _contract, _diff);
          ELSIF _difference_category = 'other' AND coalesce(btrim(_difference_note),'') = '' THEN
            _errs := _errs || 'A note is required when the difference category is "Other".';
          END IF;
        END IF;
      END IF;
    END IF;
  ELSE
    IF p.deal_id IS NULL AND coalesce(p.source_type,'deal') = 'deal' THEN
      _errs := _errs || 'The proposal is not linked to an opportunity.';
    END IF;
  END IF;

  IF array_length(_errs,1) > 0 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: %', array_to_string(_errs, ' | ');
  END IF;

  PERFORM set_config('partneros.proposal_op', 'on', true);
  UPDATE public.proposals SET status = 'Ready', validated_at = now(), validated_by = auth.uid(),
    difference_category = CASE WHEN abs(coalesce(_diff,0)) > 0.01 THEN _difference_category ELSE NULL END,
    difference_note = CASE WHEN abs(coalesce(_diff,0)) > 0.01 THEN _difference_note ELSE NULL END,
    updated_at = now()
  WHERE id = p.id;
  PERFORM set_config('partneros.proposal_op', 'off', true);

  INSERT INTO public.proposal_status_events (proposal_id, action, from_status, to_status, actor_id, details)
  VALUES (p.id, 'validated', p.status, 'Ready', auth.uid(), jsonb_build_object(
    'contract_recurring', _contract, 'proposal_recurring', p.total_recurring, 'difference', _diff,
    'difference_category', _difference_category, 'difference_note', _difference_note,
    'total_year_1', p.total_year_1));
  RETURN jsonb_build_object('proposal_id', p.id, 'status', 'Ready', 'already_validated', false, 'difference', _diff);
END $$;