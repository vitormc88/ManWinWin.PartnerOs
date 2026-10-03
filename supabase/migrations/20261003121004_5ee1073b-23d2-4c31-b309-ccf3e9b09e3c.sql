CREATE OR REPLACE FUNCTION public.close_renewal(_renewal_id uuid, _outcome text, _proposal_id uuid DEFAULT NULL::uuid, _closing_notes text DEFAULT NULL::text, _loss_reason text DEFAULT NULL::text, _effective_date date DEFAULT NULL::date, _next_renewal_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.renewals%ROWTYPE; _ready jsonb; _issue jsonb; _res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO r FROM public.renewals WHERE id = _renewal_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_view_client(r.client_id) THEN
    RAISE EXCEPTION 'RENEWAL_NOT_FOUND: this renewal is not available to your account';
  END IF;
  IF r.closed_at IS NULL THEN
    _ready := public.renewal_close_readiness(_renewal_id, _outcome, _proposal_id);
    FOR _issue IN SELECT * FROM jsonb_array_elements(_ready->'issues') LOOP
      -- D3 closing permission is a security rule: always enforced, never warn-only.
      IF _issue->>'code' = 'NOT_AUTHORIZED_CLOSE' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED_CLOSE: %', _issue->>'message';
      END IF;
      PERFORM private.workflow_violation('renewal_close', 'renewal', _renewal_id,
        (_issue->>'code') || ': ' || (_issue->>'message'), _issue);
    END LOOP;
  END IF;
  PERFORM set_config('partneros.renewal_close', 'on', true);
  _res := public.close_renewal_core(_renewal_id, _outcome, _proposal_id, _closing_notes, _loss_reason, _effective_date, _next_renewal_date);
  PERFORM set_config('partneros.renewal_close', 'off', true);
  RETURN _res;
END $function$;

CREATE OR REPLACE FUNCTION public.renewal_close_readiness(_renewal_id uuid, _outcome text DEFAULT 'renewed'::text, _proposal_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.renewals%ROWTYPE; cl public.clients%ROWTYPE; p public.proposals%ROWTYPE;
  _uid uuid := auth.uid(); _perm boolean; _issues jsonb := '[]'::jsonb; _amb jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO r FROM public.renewals WHERE id = _renewal_id;
  IF NOT FOUND OR NOT public.can_view_client(r.client_id) THEN
    RAISE EXCEPTION 'RENEWAL_NOT_FOUND: this renewal is not available to your account';
  END IF;
  SELECT * INTO cl FROM public.clients WHERE id = r.client_id;

  _perm := public.is_hq_user(_uid) OR (
    public.has_role(_uid, 'partner_admin')
    AND NOT coalesce(cl.is_hq_direct,false)
    AND cl.partner_uuid IS NOT NULL
    AND cl.partner_uuid = public.get_user_partner_id(_uid));
  IF NOT _perm THEN
    _issues := _issues || jsonb_build_object('code','NOT_AUTHORIZED_CLOSE','message',
      CASE WHEN coalesce(cl.is_hq_direct,false) THEN 'HQ Direct renewals can only be closed by HQ.'
           WHEN public.get_user_partner_id(_uid) = cl.partner_uuid THEN 'Only a partner administrator can close renewals. Ask your partner admin or HQ.'
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
END $function$;

REVOKE ALL ON FUNCTION public.close_renewal(uuid,text,uuid,text,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_renewal(uuid,text,uuid,text,text,date,date) TO authenticated;
REVOKE ALL ON FUNCTION public.renewal_close_readiness(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renewal_close_readiness(uuid,text,uuid) TO authenticated;