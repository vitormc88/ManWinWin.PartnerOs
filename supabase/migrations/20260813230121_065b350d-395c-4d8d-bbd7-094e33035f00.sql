-- ── 1. Linkage columns (present in test, absent in production) ─────────────
ALTER TABLE public.client_revenue_history ADD COLUMN IF NOT EXISTS contract_id uuid;
ALTER TABLE public.client_revenue_history ADD COLUMN IF NOT EXISTS renewal_id  uuid;
ALTER TABLE public.client_revenue_history ADD COLUMN IF NOT EXISTS proposal_id uuid;

-- Safe foreign keys: only when absent and only when existing data is compatible.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_revenue_history_contract_id_fkey')
     AND NOT EXISTS (SELECT 1 FROM public.client_revenue_history h
                      WHERE h.contract_id IS NOT NULL
                        AND NOT EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = h.contract_id)) THEN
    ALTER TABLE public.client_revenue_history
      ADD CONSTRAINT client_revenue_history_contract_id_fkey
      FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_revenue_history_renewal_id_fkey')
     AND NOT EXISTS (SELECT 1 FROM public.client_revenue_history h
                      WHERE h.renewal_id IS NOT NULL
                        AND NOT EXISTS (SELECT 1 FROM public.renewals r WHERE r.id = h.renewal_id)) THEN
    ALTER TABLE public.client_revenue_history
      ADD CONSTRAINT client_revenue_history_renewal_id_fkey
      FOREIGN KEY (renewal_id) REFERENCES public.renewals(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_revenue_history_proposal_id_fkey')
     AND NOT EXISTS (SELECT 1 FROM public.client_revenue_history h
                      WHERE h.proposal_id IS NOT NULL
                        AND NOT EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = h.proposal_id)) THEN
    ALTER TABLE public.client_revenue_history
      ADD CONSTRAINT client_revenue_history_proposal_id_fkey
      FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crh_contract_id ON public.client_revenue_history (contract_id);
CREATE INDEX IF NOT EXISTS idx_crh_renewal_id  ON public.client_revenue_history (renewal_id);
CREATE INDEX IF NOT EXISTS idx_crh_proposal_id ON public.client_revenue_history (proposal_id);

-- ── 2. Canonical idempotency key: (client_id, source_reference) ────────────
CREATE UNIQUE INDEX IF NOT EXISTS ux_crh_client_source_reference
  ON public.client_revenue_history (client_id, source_reference)
  WHERE source_reference IS NOT NULL;

-- ── 3. Closure trigger — composite conflict target, composite lookups ──────
CREATE OR REPLACE FUNCTION public.renewal_closure_record_revenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _currency text;
  _partner uuid;
  _recurring numeric := coalesce(NEW.renewed_recurring_value, 0);
  _one_time numeric := coalesce(NEW.one_time_value, 0);
  _eff date := coalesce(NEW.renewal_effective_date, NEW.renewal_date, current_date);
  _rec_ref text := 'renewal:' || NEW.id::text || ':recurring';
  _one_ref text := 'renewal:' || NEW.id::text || ':one_time';
  _rec_id uuid;
  _one_id uuid;
  _total numeric := 0;
BEGIN
  IF coalesce(NEW.outcome, '') <> 'renewed' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(ct.currency, 'EUR') INTO _currency
    FROM public.contracts ct WHERE ct.id = NEW.contract_id;
  _currency := coalesce(_currency, 'EUR');

  _partner := coalesce(NEW.partner_uuid, (SELECT cl.partner_uuid FROM public.clients cl WHERE cl.id = NEW.client_id));

  IF _recurring > 0 THEN
    INSERT INTO public.client_revenue_history (
      client_id, partner_id, contract_id, renewal_id, proposal_id,
      revenue_type, amount, currency, revenue_date, source, source_reference, notes)
    VALUES (NEW.client_id, _partner, NEW.contract_id, NEW.id, NEW.closed_proposal_id,
      'renewal', _recurring, _currency, _eff, 'renewal_closure', _rec_ref,
      'Recurring value billed when the renewal was closed as Renewed.')
    ON CONFLICT (client_id, source_reference) DO NOTHING;
  END IF;

  IF _one_time > 0 THEN
    INSERT INTO public.client_revenue_history (
      client_id, partner_id, contract_id, renewal_id, proposal_id,
      revenue_type, amount, currency, revenue_date, source, source_reference, notes)
    VALUES (NEW.client_id, _partner, NEW.contract_id, NEW.id, NEW.closed_proposal_id,
      'implementation', _one_time, _currency, _eff, 'renewal_closure', _one_ref,
      'One-time implementation value billed when the renewal was closed as Renewed.')
    ON CONFLICT (client_id, source_reference) DO NOTHING;
  END IF;

  SELECT id INTO _rec_id FROM public.client_revenue_history
   WHERE client_id = NEW.client_id AND source_reference = _rec_ref;
  SELECT id INTO _one_id FROM public.client_revenue_history
   WHERE client_id = NEW.client_id AND source_reference = _one_ref;

  SELECT coalesce(sum(amount), 0) INTO _total FROM public.client_revenue_history
   WHERE client_id = NEW.client_id
     AND source = 'renewal_closure'
     AND source_reference IN (_rec_ref, _one_ref);

  IF round(_total, 2) <> round(_recurring + _one_time, 2) THEN
    RAISE EXCEPTION 'REVENUE_RECONCILIATION_FAILED: recorded % expected %',
      _total, (_recurring + _one_time);
  END IF;

  NEW.closure_snapshot := coalesce(NEW.closure_snapshot, '{}'::jsonb) || jsonb_build_object(
    'revenue', jsonb_build_object(
      'currency', _currency,
      'total', _total,
      'recurring', jsonb_build_object('id', _rec_id, 'amount', _recurring,
        'revenue_type', 'renewal', 'source_reference', _rec_ref),
      'one_time', jsonb_build_object('id', _one_id, 'amount', _one_time,
        'revenue_type', 'implementation', 'source_reference', _one_ref)));

  RETURN NEW;
END;
$function$;

-- ── 4. Backfill — same composite key, still dry-run by default, HQ only ────
CREATE OR REPLACE FUNCTION public.renewal_revenue_backfill(_dry_run boolean DEFAULT true, _renewal_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _rows jsonb := '[]'::jsonb;
  _inserted int := 0;
  _total numeric := 0;
  rec record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.is_hq_user(auth.uid()) THEN RAISE EXCEPTION 'NOT_AUTHORIZED: HQ only'; END IF;

  FOR rec IN
    SELECT r.id AS renewal_id, r.client_id, r.contract_id, r.closed_proposal_id,
           coalesce(r.partner_uuid, c.partner_uuid) AS partner_uuid,
           coalesce(r.renewal_effective_date, r.renewal_date, r.closed_at::date) AS eff,
           coalesce(r.renewed_recurring_value, 0) AS recurring,
           coalesce(r.one_time_value, 0) AS one_time,
           coalesce(ct.currency, 'EUR') AS currency
      FROM public.renewals r
      JOIN public.clients c ON c.id = r.client_id
      LEFT JOIN public.contracts ct ON ct.id = r.contract_id
     WHERE r.outcome = 'renewed' AND r.closed_at IS NOT NULL
       AND (_renewal_id IS NULL OR r.id = _renewal_id)
  LOOP
    IF rec.recurring > 0 AND NOT EXISTS (
      SELECT 1 FROM public.client_revenue_history
       WHERE client_id = rec.client_id
         AND source_reference = 'renewal:' || rec.renewal_id::text || ':recurring') THEN
      _rows := _rows || jsonb_build_object('renewal_id', rec.renewal_id, 'revenue_type', 'renewal',
        'amount', rec.recurring, 'revenue_date', rec.eff,
        'source_reference', 'renewal:' || rec.renewal_id::text || ':recurring');
      _total := _total + rec.recurring;
      IF NOT _dry_run THEN
        INSERT INTO public.client_revenue_history (client_id, partner_id, contract_id, renewal_id, proposal_id,
          revenue_type, amount, currency, revenue_date, source, source_reference, notes)
        VALUES (rec.client_id, rec.partner_uuid, rec.contract_id, rec.renewal_id, rec.closed_proposal_id,
          'renewal', rec.recurring, rec.currency, rec.eff, 'renewal_closure',
          'renewal:' || rec.renewal_id::text || ':recurring', 'Backfilled from a renewal closed before revenue recording.')
        ON CONFLICT (client_id, source_reference) DO NOTHING;
        _inserted := _inserted + 1;
      END IF;
    END IF;

    IF rec.one_time > 0 AND NOT EXISTS (
      SELECT 1 FROM public.client_revenue_history
       WHERE client_id = rec.client_id
         AND source_reference = 'renewal:' || rec.renewal_id::text || ':one_time') THEN
      _rows := _rows || jsonb_build_object('renewal_id', rec.renewal_id, 'revenue_type', 'implementation',
        'amount', rec.one_time, 'revenue_date', rec.eff,
        'source_reference', 'renewal:' || rec.renewal_id::text || ':one_time');
      _total := _total + rec.one_time;
      IF NOT _dry_run THEN
        INSERT INTO public.client_revenue_history (client_id, partner_id, contract_id, renewal_id, proposal_id,
          revenue_type, amount, currency, revenue_date, source, source_reference, notes)
        VALUES (rec.client_id, rec.partner_uuid, rec.contract_id, rec.renewal_id, rec.closed_proposal_id,
          'implementation', rec.one_time, rec.currency, rec.eff, 'renewal_closure',
          'renewal:' || rec.renewal_id::text || ':one_time', 'Backfilled from a renewal closed before revenue recording.')
        ON CONFLICT (client_id, source_reference) DO NOTHING;
        _inserted := _inserted + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('dry_run', _dry_run, 'missing_count', jsonb_array_length(_rows),
    'missing_total', _total, 'inserted', _inserted, 'entries', _rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.renewal_revenue_backfill(boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renewal_revenue_backfill(boolean, uuid) TO authenticated;