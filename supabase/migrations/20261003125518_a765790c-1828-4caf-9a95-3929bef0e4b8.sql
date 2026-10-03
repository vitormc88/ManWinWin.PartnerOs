-- Phase 2 hardening: full commercial-term protection (proposal fields + line items).
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS commercial_fingerprint text;
COMMENT ON COLUMN public.proposals.commercial_fingerprint IS
  'Hash of the commercial configuration (pricing fields + line items) captured when the proposal left Draft. Changes while Ready/Sent require returning to Draft; changes while Accepted/Won are rejected.';

CREATE OR REPLACE FUNCTION private.proposal_commercial_fingerprint(_id uuid, _p jsonb)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT md5(
    jsonb_build_object(
      'plan', _p->'plan', 'hosting', _p->'hosting', 'product_family', _p->'product_family',
      'license_model', _p->'license_model', 'proposal_mode', _p->'proposal_mode', 'deployment', _p->'deployment',
      'business_config', coalesce(_p->'business_config','null'::jsonb),
      'include_requests_module', _p->'include_requests_module', 'web_users', _p->'web_users',
      'service_days', round(coalesce((_p->>'service_days')::numeric,0),2),
      'service_hours', round(coalesce((_p->>'service_hours')::numeric,0),2),
      'implementation_type', _p->'implementation_type',
      'discount_pct', round(coalesce((_p->>'discount_pct')::numeric,0),2), 'discount_scope', _p->'discount_scope',
      'software_discount_pct', round(coalesce((_p->>'software_discount_pct')::numeric,0),2),
      'services_discount_pct', round(coalesce((_p->>'services_discount_pct')::numeric,0),2),
      'software_subtotal', round(coalesce((_p->>'software_subtotal')::numeric,0),2),
      'services_subtotal', round(coalesce((_p->>'services_subtotal')::numeric,0),2),
      'discount_amount', round(coalesce((_p->>'discount_amount')::numeric,0),2),
      'total_year_1', round(coalesce((_p->>'total_year_1')::numeric,0),2),
      'total_recurring', round(coalesce((_p->>'total_recurring')::numeric,0),2),
      'payment_terms', _p->'payment_terms',
      'renewal_change_mode', _p->'renewal_change_mode', 'source_plan', _p->'source_plan', 'target_plan', _p->'target_plan',
      'target_product_family', _p->'target_product_family', 'entitlements', coalesce(_p->'entitlements','null'::jsonb),
      'implementation_source', _p->'implementation_source',
      'implementation_transition_rule_code', _p->'implementation_transition_rule_code',
      'implementation_hours', round(coalesce((_p->>'implementation_hours')::numeric,0),2),
      'implementation_hourly_rate', round(coalesce((_p->>'implementation_hourly_rate')::numeric,0),2),
      'implementation_gross', round(coalesce((_p->>'implementation_gross')::numeric,0),2),
      'implementation_discount_amount', round(coalesce((_p->>'implementation_discount_amount')::numeric,0),2),
      'implementation_net', round(coalesce((_p->>'implementation_net')::numeric,0),2),
      'items', coalesce((
        SELECT jsonb_agg(x ORDER BY x::text) FROM (
          SELECT jsonb_build_object(
            'category', i.category, 'item_code', i.item_code, 'item_name', i.item_name,
            'qty', round(coalesce(i.qty,0)::numeric,4), 'unit_price', round(coalesce(i.unit_price,0)::numeric,2),
            'frequency', i.frequency, 'total', round(coalesce(i.total,0)::numeric,2),
            'is_override', i.is_override, 'is_recurring', i.is_recurring,
            'discount_type', i.discount_type, 'discount_value', round(coalesce(i.discount_value,0)::numeric,2),
            'gross_total', round(coalesce(i.gross_total,0)::numeric,2),
            'discount_amount', round(coalesce(i.discount_amount,0)::numeric,2),
            'net_total', round(coalesce(i.net_total,0)::numeric,2),
            'apply_discount_to_renewal', i.apply_discount_to_renewal,
            'source_plan', i.source_plan, 'target_plan', i.target_plan, 'line_type', i.line_type,
            'change_kind', i.change_kind, 'gross_delta', round(coalesce(i.gross_delta,0)::numeric,2),
            'access_type', i.access_type, 'total_licensed_qty', i.total_licensed_qty,
            'included_qty', i.included_qty, 'billable_qty', i.billable_qty,
            'implementation_source', i.implementation_source,
            'implementation_hours', round(coalesce(i.implementation_hours,0)::numeric,2),
            'implementation_hourly_rate', round(coalesce(i.implementation_hourly_rate,0)::numeric,2)) AS x
          FROM public.proposal_items i WHERE i.proposal_id = _id) s), '[]'::jsonb)
    )::text);
$$;
REVOKE ALL ON FUNCTION private.proposal_commercial_fingerprint(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- Capture the fingerprint whenever a proposal leaves Draft (Validate, or legacy paths).
CREATE OR REPLACE FUNCTION public.proposals_capture_fingerprint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('Ready','Sent','Accepted','Won')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND (NEW.commercial_fingerprint IS NULL OR TG_OP = 'INSERT' OR OLD.status NOT IN ('Ready','Sent','Accepted','Won')) THEN
    NEW.commercial_fingerprint := private.proposal_commercial_fingerprint(NEW.id, to_jsonb(NEW));
  ELSIF NEW.status NOT IN ('Ready','Sent','Accepted','Won') THEN
    NEW.commercial_fingerprint := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.proposals_capture_fingerprint() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_b_proposals_capture_fingerprint ON public.proposals;
CREATE TRIGGER trg_b_proposals_capture_fingerprint BEFORE INSERT OR UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.proposals_capture_fingerprint();

-- Checked at commit, so an identical delete + re-insert of lines is allowed.
CREATE OR REPLACE FUNCTION private.proposal_terms_check(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.proposals%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.proposals WHERE id = _id;
  IF NOT FOUND OR p.commercial_fingerprint IS NULL OR p.status NOT IN ('Ready','Sent','Accepted','Won') THEN RETURN; END IF;
  IF private.proposal_commercial_fingerprint(p.id, to_jsonb(p)) = p.commercial_fingerprint THEN RETURN; END IF;
  IF p.status IN ('Accepted','Won') THEN
    RAISE EXCEPTION 'TERMS_LOCKED: this proposal is %; its commercial terms can no longer be changed. Create a new version instead.', p.status
      USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.workflow_violation('proposal_terms', 'proposal', p.id,
    format('REVALIDATION_REQUIRED: the commercial terms of a %s proposal changed; return it to Draft and validate again', p.status),
    jsonb_build_object('status', p.status));
END $$;
REVOKE ALL ON FUNCTION private.proposal_terms_check(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.proposal_terms_check_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'proposals' THEN
    PERFORM private.proposal_terms_check(NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM private.proposal_terms_check(OLD.proposal_id);
  ELSE
    PERFORM private.proposal_terms_check(NEW.proposal_id);
    IF TG_OP = 'UPDATE' AND OLD.proposal_id IS DISTINCT FROM NEW.proposal_id THEN
      PERFORM private.proposal_terms_check(OLD.proposal_id);
    END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.proposal_terms_check_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_z_proposals_terms_check ON public.proposals;
CREATE CONSTRAINT TRIGGER trg_z_proposals_terms_check AFTER INSERT OR UPDATE ON public.proposals
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.proposal_terms_check_trg();
DROP TRIGGER IF EXISTS trg_z_proposal_items_terms_check ON public.proposal_items;
CREATE CONSTRAINT TRIGGER trg_z_proposal_items_terms_check AFTER INSERT OR UPDATE OR DELETE ON public.proposal_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.proposal_terms_check_trg();

-- Same-status totals check now also covers Won (immediate feedback; the commit-time check covers everything else).
CREATE OR REPLACE FUNCTION public.proposals_status_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _op boolean := coalesce(current_setting('partneros.proposal_op', true),'off') = 'on';
        _close boolean := coalesce(current_setting('partneros.renewal_close', true),'off') = 'on';
        _old text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;
        _renewal boolean := NEW.renewal_id IS NOT NULL OR NEW.source_type = 'renewal';
BEGIN
  IF NEW.status IS NOT DISTINCT FROM _old THEN
    IF TG_OP = 'UPDATE' AND _old IN ('Ready','Sent','Accepted','Won') AND NOT _op AND NOT _close
       AND (round(coalesce(NEW.total_year_1,0),2) IS DISTINCT FROM round(coalesce(OLD.total_year_1,0),2)
         OR round(coalesce(NEW.total_recurring,0),2) IS DISTINCT FROM round(coalesce(OLD.total_recurring,0),2)) THEN
      IF _old IN ('Accepted','Won') THEN
        RAISE EXCEPTION 'TERMS_LOCKED: this proposal is %; its commercial terms can no longer be changed. Create a new version instead.', _old
          USING ERRCODE = 'P0001';
      END IF;
      PERFORM private.workflow_violation('proposal_terms', 'proposal', NEW.id,
        format('REVALIDATION_REQUIRED: the commercial terms of a %s proposal changed; return it to Draft and validate again', _old),
        jsonb_build_object('status', _old,
          'old', jsonb_build_object('y1', OLD.total_year_1, 'rec', OLD.total_recurring),
          'new', jsonb_build_object('y1', NEW.total_year_1, 'rec', NEW.total_recurring)));
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IN ('Ready','Sent','Accepted') AND NOT _op THEN
    PERFORM private.workflow_violation('proposal_status', 'proposal', NEW.id,
      format('STATUS_GUARD: "%s" can only be set through Validate / Mark Sent / Record acceptance', NEW.status),
      jsonb_build_object('from', _old, 'to', NEW.status));
  ELSIF _renewal AND NEW.status IN ('Won','Lost') AND NOT _close THEN
    PERFORM private.workflow_violation('proposal_status', 'proposal', NEW.id,
      'STATUS_GUARD: renewal proposals become Won/Lost only through the official renewal close',
      jsonb_build_object('from', _old, 'to', NEW.status));
  ELSIF _old IN ('Accepted','Won') AND NOT _op AND NOT _close THEN
    PERFORM private.workflow_violation('proposal_status', 'proposal', NEW.id,
      format('STATUS_GUARD: an %s proposal cannot be changed back to %s', _old, NEW.status),
      jsonb_build_object('from', _old, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.proposals_status_guard() FROM PUBLIC, anon, authenticated;

-- Ambiguity rule aligned with the approved plan (2e): any other open component of the
-- client with a different contract, a different service type or a different end date
-- blocks the close for manual review. No date tolerance.
DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.renewal_close_readiness'::regproc);
  IF position('OR abs(o.renewal_date - r.renewal_date) > 31)' in d) = 0 THEN
    RAISE EXCEPTION 'renewal_close_readiness ambiguity clause not found; aborting';
  END IF;
  d := replace(d,
    'AND ((o.contract_id IS NOT NULL AND r.contract_id IS NOT NULL AND o.contract_id <> r.contract_id)
          OR abs(o.renewal_date - r.renewal_date) > 31);',
    'AND (o.contract_id IS DISTINCT FROM r.contract_id
          OR o.renewal_type IS DISTINCT FROM r.renewal_type
          OR o.renewal_date IS DISTINCT FROM r.renewal_date);');
  d := replace(d, 'other open renewal components with a different contract or end date.',
                  'other open renewal components with a different contract, service type or end date.');
  IF position('o.renewal_type IS DISTINCT FROM r.renewal_type' in d) = 0 THEN
    RAISE EXCEPTION 'ambiguity clause replacement failed; aborting';
  END IF;
  EXECUTE d;
END $mig$;