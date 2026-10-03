-- Phase 2 (TEST): proposal validation / sent / acceptance operations, official
-- renewal close wrapper (D3 permissions, ambiguity guard, accepted evidence),
-- and status guards. Guards start in WARN mode (private.renewal_workflow_settings.enforce=false).

-- 1. Settings + guard log ----------------------------------------------------
CREATE TABLE IF NOT EXISTS private.renewal_workflow_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enforce boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.renewal_workflow_settings (id, enforce) VALUES (true, false) ON CONFLICT DO NOTHING;
REVOKE ALL ON private.renewal_workflow_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.renewal_workflow_settings TO service_role;

CREATE TABLE IF NOT EXISTS private.workflow_guard_events (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  guard text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  actor uuid,
  enforced boolean NOT NULL,
  detail jsonb
);
REVOKE ALL ON private.workflow_guard_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.workflow_guard_events TO service_role;

CREATE OR REPLACE FUNCTION private.renewal_workflow_enforced()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private, public AS $$
  SELECT coalesce((SELECT enforce FROM private.renewal_workflow_settings WHERE id), false)
$$;
REVOKE ALL ON FUNCTION private.renewal_workflow_enforced() FROM PUBLIC, anon, authenticated;

-- Records a violation; raises when enforcement is on.
CREATE OR REPLACE FUNCTION private.workflow_violation(_guard text, _entity_type text, _entity_id uuid, _message text, _detail jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public AS $$
DECLARE _enf boolean := private.renewal_workflow_enforced();
BEGIN
  INSERT INTO private.workflow_guard_events (guard, entity_type, entity_id, actor, enforced, detail)
  VALUES (_guard, _entity_type, _entity_id, auth.uid(), _enf, coalesce(_detail,'{}'::jsonb) || jsonb_build_object('message', _message));
  IF _enf THEN
    RAISE EXCEPTION '%', _message USING ERRCODE = 'check_violation';
  END IF;
END $$;
REVOKE ALL ON FUNCTION private.workflow_violation(text,text,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;

-- 2. Proposal columns ----------------------------------------------------------
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validated_by uuid,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_by uuid,
  ADD COLUMN IF NOT EXISTS sent_method text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS acceptance_date date,
  ADD COLUMN IF NOT EXISTS acceptance_evidence_type text,
  ADD COLUMN IF NOT EXISTS acceptance_reference text,
  ADD COLUMN IF NOT EXISTS acceptance_file_path text,
  ADD COLUMN IF NOT EXISTS acceptance_notes text,
  ADD COLUMN IF NOT EXISTS difference_category text,
  ADD COLUMN IF NOT EXISTS difference_note text;

-- 3. Append-only status trail ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposal_status_events_proposal_idx ON public.proposal_status_events(proposal_id, created_at);
GRANT SELECT ON public.proposal_status_events TO authenticated;
GRANT ALL ON public.proposal_status_events TO service_role;
ALTER TABLE public.proposal_status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View status events of visible proposals" ON public.proposal_status_events
  FOR SELECT TO authenticated USING (public.can_view_proposal_document(proposal_id));

-- 4. Proposal operations ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proposal_contract_recurring(_proposal_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.proposals%ROWTYPE; r public.renewals%ROWTYPE; _cid uuid; _v numeric;
BEGIN
  SELECT * INTO p FROM public.proposals WHERE id = _proposal_id;
  IF p.renewal_id IS NOT NULL THEN SELECT * INTO r FROM public.renewals WHERE id = p.renewal_id; END IF;
  _cid := coalesce(r.contract_id, p.contract_id);
  IF _cid IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(sum(amount) FILTER (WHERE lower(coalesce(billing_frequency,'annual')) NOT IN ('one_time','one-time','once')),0)
    INTO _v FROM public.contract_lines WHERE contract_id = _cid;
  IF coalesce(_v,0) = 0 THEN SELECT coalesce(contract_value, total_value) INTO _v FROM public.contracts WHERE id = _cid; END IF;
  RETURN _v;
END $$;
REVOKE ALL ON FUNCTION public.proposal_contract_recurring(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_contract_recurring(uuid) TO authenticated;

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
  IF p.product_family = 'Business' AND coalesce(btrim(p.license_model),'') = '' THEN
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
REVOKE ALL ON FUNCTION public.validate_proposal(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_proposal(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_proposal_sent(_proposal_id uuid, _sent_date date DEFAULT NULL, _method text DEFAULT 'manual', _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.proposals%ROWTYPE; _at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO p FROM public.proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND'; END IF;
  IF NOT public.can_manage_proposal_document(_proposal_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF p.status = 'Sent' THEN RETURN jsonb_build_object('proposal_id', p.id, 'status', 'Sent', 'already_sent', true); END IF;
  IF p.status <> 'Ready' THEN
    RAISE EXCEPTION 'NOT_READY: only a validated (Ready) proposal can be marked as sent (current: %)', p.status;
  END IF;
  IF coalesce(_method,'manual') NOT IN ('manual','partneros') THEN RAISE EXCEPTION 'INVALID_METHOD'; END IF;
  IF _sent_date IS NOT NULL AND _sent_date > current_date THEN RAISE EXCEPTION 'INVALID_DATE: sent date cannot be in the future'; END IF;
  _at := CASE WHEN _sent_date IS NULL OR _sent_date = current_date THEN now() ELSE _sent_date::timestamptz END;
  PERFORM set_config('partneros.proposal_op', 'on', true);
  UPDATE public.proposals SET status = 'Sent', sent_at = _at, sent_by = auth.uid(), sent_method = coalesce(_method,'manual'), updated_at = now()
   WHERE id = p.id;
  PERFORM set_config('partneros.proposal_op', 'off', true);
  INSERT INTO public.proposal_status_events (proposal_id, action, from_status, to_status, actor_id, details)
  VALUES (p.id, 'sent', p.status, 'Sent', auth.uid(), jsonb_build_object('method', coalesce(_method,'manual'), 'sent_at', _at, 'note', _note));
  RETURN jsonb_build_object('proposal_id', p.id, 'status', 'Sent', 'already_sent', false);
END $$;
REVOKE ALL ON FUNCTION public.mark_proposal_sent(uuid,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_proposal_sent(uuid,date,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_proposal_acceptance(_proposal_id uuid, _evidence_type text, _acceptance_date date,
  _reference text DEFAULT NULL, _file_path text DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.proposals%ROWTYPE; r public.renewals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO p FROM public.proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND'; END IF;
  IF p.renewal_id IS NULL THEN RAISE EXCEPTION 'NOT_RENEWAL: acceptance is recorded only for renewal proposals; use Award & Convert for opportunities'; END IF;
  IF NOT public.can_manage_proposal_document(_proposal_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  SELECT * INTO r FROM public.renewals WHERE id = p.renewal_id;
  IF r.closed_at IS NOT NULL THEN RAISE EXCEPTION 'RENEWAL_CLOSED'; END IF;
  IF p.status = 'Accepted' THEN RETURN jsonb_build_object('proposal_id', p.id, 'status', 'Accepted', 'already_accepted', true); END IF;
  IF p.status NOT IN ('Ready','Sent') THEN
    RAISE EXCEPTION 'NOT_ELIGIBLE: only a validated or sent proposal can be accepted (current: %)', p.status;
  END IF;
  IF _evidence_type IS NULL OR _evidence_type NOT IN ('signed_proposal','purchase_order','acceptance_email','internal_note') THEN
    RAISE EXCEPTION 'EVIDENCE_REQUIRED: choose the acceptance evidence type';
  END IF;
  IF _acceptance_date IS NULL THEN RAISE EXCEPTION 'EVIDENCE_REQUIRED: acceptance date is required'; END IF;
  IF _acceptance_date > current_date THEN RAISE EXCEPTION 'INVALID_DATE: acceptance date cannot be in the future'; END IF;
  IF _evidence_type = 'internal_note' THEN
    IF NOT public.is_hq_user(auth.uid()) THEN
      RAISE EXCEPTION 'HQ_EXCEPTION_ONLY: an internal note is accepted only as an audited HQ exception';
    END IF;
    IF coalesce(btrim(_notes),'') = '' THEN RAISE EXCEPTION 'EVIDENCE_REQUIRED: explain the HQ exception in the notes'; END IF;
  ELSIF coalesce(btrim(_reference),'') = '' AND coalesce(btrim(_file_path),'') = '' THEN
    RAISE EXCEPTION 'EVIDENCE_REQUIRED: add a reference (PO number, email subject...) or a file';
  END IF;
  PERFORM set_config('partneros.proposal_op', 'on', true);
  UPDATE public.proposals SET status = 'Accepted', accepted_at = now(), accepted_by = auth.uid(),
    acceptance_date = _acceptance_date, acceptance_evidence_type = _evidence_type,
    acceptance_reference = nullif(btrim(_reference),''), acceptance_file_path = nullif(btrim(_file_path),''),
    acceptance_notes = nullif(btrim(_notes),''), updated_at = now()
   WHERE id = p.id;
  PERFORM set_config('partneros.proposal_op', 'off', true);
  INSERT INTO public.proposal_status_events (proposal_id, action, from_status, to_status, actor_id, details)
  VALUES (p.id, CASE WHEN _evidence_type='internal_note' THEN 'accepted_hq_exception' ELSE 'accepted' END, p.status, 'Accepted', auth.uid(),
    jsonb_build_object('evidence_type', _evidence_type, 'acceptance_date', _acceptance_date, 'reference', _reference, 'file_path', _file_path, 'notes', _notes));
  RETURN jsonb_build_object('proposal_id', p.id, 'status', 'Accepted', 'already_accepted', false);
END $$;
REVOKE ALL ON FUNCTION public.record_proposal_acceptance(uuid,text,date,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_proposal_acceptance(uuid,text,date,text,text,text) TO authenticated;

-- 5. Proposal status guard ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proposals_status_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _op boolean := coalesce(current_setting('partneros.proposal_op', true),'off') = 'on';
        _close boolean := coalesce(current_setting('partneros.renewal_close', true),'off') = 'on';
        _old text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;
        _renewal boolean := NEW.renewal_id IS NOT NULL OR NEW.source_type = 'renewal';
BEGIN
  IF NEW.status IS NOT DISTINCT FROM _old THEN RETURN NEW; END IF;
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
END $$;
DROP TRIGGER IF EXISTS trg_a_proposals_status_guard ON public.proposals;
CREATE TRIGGER trg_a_proposals_status_guard BEFORE INSERT OR UPDATE OF status ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.proposals_status_guard();

-- 6. Renewal terminal-status guard -------------------------------------------------
CREATE OR REPLACE FUNCTION public.renewals_terminal_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _close boolean := coalesce(current_setting('partneros.renewal_close', true),'off') = 'on';
BEGIN
  IF _close THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('Won','Lost','Completed','Renewed') OR NEW.closed_at IS NOT NULL OR NEW.outcome IS NOT NULL THEN
      PERFORM private.workflow_violation('renewal_terminal', 'renewal', NEW.id,
        'CLOSE_GUARD: a renewal cannot be created already closed; use the official close',
        jsonb_build_object('status', NEW.status));
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Won','Lost','Completed','Renewed'))
     OR (OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL)
     OR (NEW.outcome IS DISTINCT FROM OLD.outcome) THEN
    PERFORM private.workflow_violation('renewal_terminal', 'renewal', NEW.id,
      'CLOSE_GUARD: Renewed/Lost can only be recorded through the official Close Renewal flow',
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_a_renewals_terminal_guard ON public.renewals;
CREATE TRIGGER trg_a_renewals_terminal_guard BEFORE INSERT OR UPDATE ON public.renewals
  FOR EACH ROW EXECUTE FUNCTION public.renewals_terminal_guard();

-- 7. Close readiness (ambiguity + D3 + evidence), shared by UI and close ----------
CREATE OR REPLACE FUNCTION public.renewal_close_readiness(_renewal_id uuid, _outcome text DEFAULT 'renewed', _proposal_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.renewals%ROWTYPE; cl public.clients%ROWTYPE; p public.proposals%ROWTYPE;
  _uid uuid := auth.uid(); _perm boolean; _issues jsonb := '[]'::jsonb; _amb jsonb;
BEGIN
  SELECT * INTO r FROM public.renewals WHERE id = _renewal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RENEWAL_NOT_FOUND'; END IF;
  IF NOT public.can_view_client(r.client_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  SELECT * INTO cl FROM public.clients WHERE id = r.client_id;

  _perm := public.is_hq_user(_uid) OR (
    public.has_role(_uid, 'partner_admin')
    AND NOT coalesce(cl.is_hq_direct,false)
    AND cl.partner_uuid IS NOT NULL
    AND cl.partner_uuid = public.get_user_partner_id(_uid));
  IF NOT _perm THEN
    _issues := _issues || jsonb_build_object('code','NOT_AUTHORIZED_CLOSE','message',
      CASE WHEN coalesce(cl.is_hq_direct,false) THEN 'HQ Direct renewals can only be closed by HQ.'
           ELSE 'Only HQ or an admin of this client''s partner can close this renewal.' END);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'renewal_type', o.renewal_type, 'renewal_date', o.renewal_date, 'contract_id', o.contract_id)), '[]'::jsonb)
    INTO _amb
    FROM public.renewals o
   WHERE o.client_id = r.client_id AND o.id <> r.id AND o.closed_at IS NULL
     AND coalesce(o.status,'') NOT IN ('Won','Lost','Completed','Renewed','Expired')
     AND ((o.contract_id IS NOT NULL AND r.contract_id IS NOT NULL AND o.contract_id <> r.contract_id)
          OR abs(o.renewal_date - r.renewal_date) > 31);
  IF jsonb_array_length(_amb) > 0 THEN
    _issues := _issues || jsonb_build_object('code','AMBIGUOUS_COMPONENTS','message',
      'This client has other open renewal components with a different contract or end date. Manual review is required before closing.',
      'components', _amb);
  END IF;

  IF _outcome = 'renewed' THEN
    IF _proposal_id IS NOT NULL THEN
      SELECT * INTO p FROM public.proposals WHERE id = _proposal_id AND renewal_id = r.id;
    ELSE
      SELECT * INTO p FROM public.proposals WHERE renewal_id = r.id ORDER BY version DESC, created_at DESC LIMIT 1;
    END IF;
    IF p.id IS NULL THEN
      _issues := _issues || jsonb_build_object('code','PROPOSAL_REQUIRED','message','A renewal proposal is required.');
    ELSIF p.status <> 'Accepted' OR p.acceptance_evidence_type IS NULL OR p.acceptance_date IS NULL THEN
      _issues := _issues || jsonb_build_object('code','ACCEPTANCE_REQUIRED','message',
        format('The renewal proposal must be Accepted with evidence before closing as Renewed (current: %s).', p.status));
    END IF;
  END IF;

  RETURN jsonb_build_object('renewal_id', r.id, 'closed', r.closed_at IS NOT NULL,
    'can_close', jsonb_array_length(_issues) = 0, 'issues', _issues,
    'enforced', private.renewal_workflow_enforced(), 'proposal_id', p.id, 'proposal_status', p.status);
END $$;
REVOKE ALL ON FUNCTION public.renewal_close_readiness(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renewal_close_readiness(uuid,text,uuid) TO authenticated;

-- 8. Official close wrapper ------------------------------------------------------
ALTER FUNCTION public.close_renewal(uuid,text,uuid,text,text,date,date) RENAME TO close_renewal_core;
REVOKE ALL ON FUNCTION public.close_renewal_core(uuid,text,uuid,text,text,date,date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.close_renewal(_renewal_id uuid, _outcome text, _proposal_id uuid DEFAULT NULL, _closing_notes text DEFAULT NULL,
  _loss_reason text DEFAULT NULL, _effective_date date DEFAULT NULL, _next_renewal_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.renewals%ROWTYPE; _ready jsonb; _issue jsonb; _res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO r FROM public.renewals WHERE id = _renewal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RENEWAL_NOT_FOUND'; END IF;
  IF r.closed_at IS NULL THEN
    _ready := public.renewal_close_readiness(_renewal_id, _outcome, _proposal_id);
    FOR _issue IN SELECT * FROM jsonb_array_elements(_ready->'issues') LOOP
      PERFORM private.workflow_violation('renewal_close', 'renewal', _renewal_id,
        (_issue->>'code') || ': ' || (_issue->>'message'), _issue);
    END LOOP;
  END IF;
  PERFORM set_config('partneros.renewal_close', 'on', true);
  _res := public.close_renewal_core(_renewal_id, _outcome, _proposal_id, _closing_notes, _loss_reason, _effective_date, _next_renewal_date);
  PERFORM set_config('partneros.renewal_close', 'off', true);
  RETURN _res;
END $$;
REVOKE ALL ON FUNCTION public.close_renewal(uuid,text,uuid,text,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_renewal(uuid,text,uuid,text,text,date,date) TO authenticated;