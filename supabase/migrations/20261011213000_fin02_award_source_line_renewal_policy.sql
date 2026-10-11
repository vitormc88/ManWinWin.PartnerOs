-- FIN-02 R1: source-line financial integrity and first-year vs renewal pricing.
-- NEW BUSINESS awards only. Legacy history stays NULL/unmodified.
-- Reviewed for TEST staging; NO automatic historical backfill or PROD deployment.

ALTER TABLE public.contract_lines
  ADD COLUMN IF NOT EXISTS renewal_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb;

DO $fin02_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.contract_lines'::regclass
      AND conname = 'fin02_renewal_amount_nonnegative'
  ) THEN
    ALTER TABLE public.contract_lines
      ADD CONSTRAINT fin02_renewal_amount_nonnegative
      CHECK (renewal_amount IS NULL OR renewal_amount >= 0) NOT VALID;
  END IF;
END
$fin02_check$;

COMMENT ON COLUMN public.contract_lines.amount IS
  'Net amount billed for the active contractual period; historical original amount is preserved in closure_snapshot.';
COMMENT ON COLUMN public.contract_lines.renewal_amount IS
  'Next-cycle recurring amount in the same billing frequency; 0 for one-time items. NULL for legacy or unclassified rows.';
COMMENT ON COLUMN public.contract_lines.pricing_snapshot IS
  'Frozen source item and negotiated discount policy captured at creation or approved renewal transition. Not a replacement for historical lifecycle snapshots.';

-- SECURITY INVOKER; invoked by the already-authorized SECURITY DEFINER award.
-- No independent permission is granted to API users.
CREATE OR REPLACE FUNCTION public.fin02_assert_business_award(
  _proposal_id uuid, _license jsonb, _contract_lines jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $fin02_assert$
DECLARE
  _p public.proposals%ROWTYPE;
  _pi public.proposal_items%ROWTYPE;
  _l jsonb;
  _line_net numeric := 0;
  _line_recurring numeric := 0;
  _line_discount numeric := 0;
  _mapped integer := 0;
  _valid integer;
  _amount numeric;
  _frequency text;
  _mode text;
BEGIN
  SELECT * INTO _p FROM public.proposals WHERE id = _proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FIN02_PROPOSAL_NOT_FOUND'; END IF;
  IF _p.product_family <> 'Business' THEN RETURN; END IF;

  IF _p.proposal_mode = 'compare_keepit_useit' THEN
    RAISE EXCEPTION 'FIN02_COMPARE_REQUIRES_FROZEN_SELECTED_OPTION';
  END IF;
  _mode := CASE _p.proposal_mode
    WHEN 'keepit_only' THEN 'KeepIT'
    WHEN 'useit_only' THEN 'UseIT'
    ELSE NULL END;
  IF _mode IS NULL OR (_license->>'proposal_mode') IS DISTINCT FROM _mode THEN
    RAISE EXCEPTION 'FIN02_AWARDED_OPTION_DIFFERS_FROM_SAVED_PROPOSAL';
  END IF;

  IF jsonb_typeof(_contract_lines) IS DISTINCT FROM 'array' OR
     jsonb_array_length(_contract_lines) = 0 THEN
    RAISE EXCEPTION 'FIN02_CONTRACT_LINES_REQUIRED';
  END IF;

  -- Check each approved item, including zero-value lines for totals/discount.
  FOR _pi IN
    SELECT * FROM public.proposal_items WHERE proposal_id = _p.id
  LOOP
    IF _pi.gross_total < 0 OR _pi.net_total < 0 OR _pi.discount_amount < 0
       OR round(_pi.gross_total - _pi.discount_amount, 2)
          <> round(_pi.net_total, 2) THEN
      RAISE EXCEPTION 'FIN02_INVALID_SOURCE_ITEM: %', _pi.id;
    END IF;
    _line_net := _line_net + round(_pi.net_total, 2);
    _line_discount := _line_discount + round(_pi.discount_amount, 2);
    IF _pi.is_recurring THEN
      _line_recurring := _line_recurring + CASE
        WHEN _pi.apply_discount_to_renewal THEN round(_pi.net_total, 2)
        ELSE round(_pi.gross_total, 2) END;
    END IF;

    IF round(_pi.net_total, 2) > 0 THEN
      SELECT count(*) INTO _valid
        FROM jsonb_array_elements(_contract_lines) _l
       WHERE _l->>'source_item_id' = _pi.id::text;
      IF _valid <> 1 THEN
        RAISE EXCEPTION 'FIN02_MISSING_OR_DUPLICATE_SOURCE_ITEM: %', _pi.id;
      END IF;
      _mapped := _mapped + 1;
    END IF;
  END LOOP;
  IF _mapped = 0 OR _mapped <> jsonb_array_length(_contract_lines) THEN
    RAISE EXCEPTION 'FIN02_CONTRACT_LINE_COUNT_MISMATCH';
  END IF;

  -- Reject swapped +100/-100, invented line IDs and changed descriptions.
  FOR _l IN SELECT value FROM jsonb_array_elements(_contract_lines) LOOP
    IF (_l->>'source_item_id') IS NULL THEN
      RAISE EXCEPTION 'FIN02_UNSOURCED_CONTRACT_LINE';
    END IF;
    SELECT * INTO _pi FROM public.proposal_items
     WHERE id = (_l->>'source_item_id')::uuid
       AND proposal_id = _p.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'FIN02_FOREIGN_SOURCE_ITEM'; END IF;
    _amount := (_l->>'amount')::numeric;
    _frequency := lower(coalesce(_l->>'billing_frequency', ''));
    IF _amount IS NULL OR round(_amount, 2) <> round(_pi.net_total, 2)
       OR _l->>'description' IS DISTINCT FROM _pi.item_name
       OR (_pi.is_recurring AND _frequency NOT IN ('annual','annually','yearly'))
       OR (NOT _pi.is_recurring AND _frequency NOT IN ('one-time','one_time','once')) THEN
      RAISE EXCEPTION 'FIN02_CONTRACT_LINE_DIFFERS_FROM_PROPOSAL: %', _pi.id;
    END IF;
  END LOOP;

  IF round(_line_net, 2) <> round(coalesce(_p.total_year_1, 0), 2)
     OR round(_line_recurring, 2) <> round(coalesce(_p.total_recurring, 0), 2)
     OR round(_line_discount, 2) <> round(coalesce(_p.discount_amount, 0), 2)
     OR round(_line_net, 2) <>
          round((_license->>'initial_contract_value')::numeric, 2)
     OR round(_line_recurring, 2) <>
          round((_license->>'recurring_contract_value')::numeric, 2) THEN
    RAISE EXCEPTION 'FIN02_HEADER_AND_LINES_DO_NOT_RECONCILE';
  END IF;
END
$fin02_assert$;

REVOKE ALL ON FUNCTION public.fin02_assert_business_award(uuid,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;

-- Before the award inserts the contract item, freeze price/provenance.
-- The same trigger updates the current snapshot on later APPROVED renewal
-- re-parenting; close_renewal_core already captures old lines in closure_snapshot.
CREATE OR REPLACE FUNCTION public.fin02_capture_contract_line_policy()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $fin02_capture$
DECLARE
  _pi public.proposal_items%ROWTYPE;
  _p public.proposals%ROWTYPE;
BEGIN
  IF NEW.source_item_id IS NULL OR NEW.source NOT IN ('proposal','renewal') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO _pi FROM public.proposal_items WHERE id = NEW.source_item_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO _p FROM public.proposals WHERE id = _pi.proposal_id;
  IF NOT FOUND OR _p.product_family <> 'Business' THEN RETURN NEW; END IF;

  IF round(NEW.amount, 2) <> round(_pi.net_total, 2) THEN
    RAISE EXCEPTION 'FIN02_CONTRACT_SOURCE_NET_MISMATCH';
  END IF;
  NEW.renewal_amount := CASE WHEN _pi.is_recurring THEN
    CASE WHEN _pi.apply_discount_to_renewal THEN _pi.net_total
         ELSE _pi.gross_total END
    ELSE 0 END;
  NEW.pricing_snapshot := jsonb_build_object(
    'source_proposal_id', _p.id,
    'source_proposal_version', _p.version,
    'source_item_id', _pi.id,
    'pricing_rule_code', coalesce(_pi.pricing_rule_code,_pi.item_code),
    'quantity', _pi.qty,
    'unit_price', _pi.unit_price,
    'frequency', _pi.frequency,
    'first_period_gross', _pi.gross_total,
    'first_period_discount', _pi.discount_amount,
    'first_period_net', _pi.net_total,
    'discount_type', _pi.discount_type,
    'discount_value', _pi.discount_value,
    'apply_discount_to_renewal', _pi.apply_discount_to_renewal,
    'renewal_amount', NEW.renewal_amount,
    'captured_at', now(),
    'snapshot_format', 'fin02-v1'
  );
  RETURN NEW;
END
$fin02_capture$;

REVOKE ALL ON FUNCTION public.fin02_capture_contract_line_policy()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fin02_capture_contract_policy ON public.contract_lines;
CREATE TRIGGER trg_fin02_capture_contract_policy
BEFORE INSERT OR UPDATE OF amount, source_item_id, billing_frequency, source
ON public.contract_lines
FOR EACH ROW EXECUTE FUNCTION public.fin02_capture_contract_line_policy();

-- Update an EXISTING known award RPC in-place, protecting its original
-- permissions, security definer and entire atomic lifecycle implementation.
-- Fail rather than deploy a partial guard if the target signature changes.
DO $fin02_award_patch$
DECLARE
  _def text;
  _anchor text := '  IF _start_date IS NULL OR _notice_days NOT BETWEEN 0 AND 365 THEN';
  _injection text := '  PERFORM public.fin02_assert_business_award(_proposal_id, _license, _contract_lines);' || chr(10);
BEGIN
  SELECT pg_get_functiondef(
    'public.award_deal_proposal(uuid,uuid,uuid,jsonb,jsonb,date,integer)'::regprocedure
  ) INTO _def;
  IF _def IS NULL OR position(_anchor IN _def) = 0 THEN
    RAISE EXCEPTION 'FIN02_AWARD_RPC_SHAPE_CHANGED_REVIEW_REQUIRED';
  END IF;
  IF position('fin02_assert_business_award' IN _def) = 0 THEN
    EXECUTE replace(_def, _anchor, _injection || _anchor);
  END IF;
END
$fin02_award_patch$;

-- The renewal core previously summed FIRST PERIOD amount as recurring value.
-- Read frozen next-cycle amount where present, otherwise preserve legacy path.
-- Closure updates still write the new period amount and store the pre-closure
-- snapshot, so this edit does NOT retroactively reprice historical rows.
DO $fin02_renewal_patch$
DECLARE
  _def text;
  _anchor_old text := 'sum(amount) FILTER (';
  _anchor_new text := 'sum(coalesce(renewal_amount, amount)) FILTER (';
  _count integer;
BEGIN
  SELECT pg_get_functiondef(
    'public.close_renewal_core(uuid,text,uuid,text,text,date,date)'::regprocedure
  ) INTO _def;
  IF _def IS NULL THEN
    RAISE EXCEPTION 'FIN02_RENEWAL_CORE_NOT_FOUND';
  END IF;
  IF position('FIN02_RENEWAL_POLICY_V1' IN _def) > 0 THEN RETURN; END IF;
  -- Exactly three recurring aggregations in the known core: prior, current
  -- total, and unrelated recurring. Do not blindly rewrite one-time totals.
  _count := (length(_def) - length(replace(_def, _anchor_old, ''))) /
                length(_anchor_old);
  IF _count <> 4 THEN
    RAISE EXCEPTION 'FIN02_RENEWAL_CORE_SHAPE_CHANGED_COUNT_%', _count;
  END IF;
  -- Change exactly the three *recurring* aggregations, never the
  -- one-time proposal lines (which must keep their first-period amount).
  _def := replace(_def,
    'sum(amount) FILTER (' || chr(10) ||
    '           WHERE lower(coalesce(billing_frequency,''annual'')) NOT IN',
    'sum(coalesce(renewal_amount, amount)) FILTER (' || chr(10) ||
    '           WHERE lower(coalesce(billing_frequency,''annual'')) NOT IN');
  _def := replace(_def,
    'sum(amount) FILTER (' || chr(10) ||
    '      WHERE lower(coalesce(billing_frequency,''annual'')) NOT IN',
    'sum(coalesce(renewal_amount, amount)) FILTER (' || chr(10) ||
    '      WHERE lower(coalesce(billing_frequency,''annual'')) NOT IN');
  -- If anything changed upstream, abort the migration atomically.
  _count := (length(_def) -
    length(replace(_def, 'sum(coalesce(renewal_amount, amount)) FILTER (', ''))) /
    length('sum(coalesce(renewal_amount, amount)) FILTER (');
  IF _count <> 3 THEN
    RAISE EXCEPTION 'FIN02_RENEWAL_RECURRING_AGGREGATIONS_EXPECTED_3_GOT_%', _count;
  END IF;
  IF position('sum(amount) FILTER (' || chr(10) ||
    '      WHERE lower(coalesce(billing_frequency,''annual'')) IN' IN _def) = 0 THEN
    RAISE EXCEPTION 'FIN02_ONE_TIME_AGGREGATION_MUST_NOT_CHANGE';
  END IF;

  -- First-year recurring promotions mean Y1 < next-cycle baseline is
  -- legitimate. Derive one-time revenue from the approved one-time lines,
  -- not from Y1 minus the next-cycle recurring amount.
  _def := replace(_def,
    '  _one_time := greatest(coalesce(p.total_year_1,0) - _new_recurring, 0);',
    '  IF p.product_family = ''Business'' THEN' || chr(10) ||
    '    SELECT coalesce(sum(net_total),0) INTO _one_time' || chr(10) ||
    '    FROM public.proposal_items' || chr(10) ||
    '    WHERE proposal_id = p.id AND NOT is_recurring;' || chr(10) ||
    '  ELSE' || chr(10) ||
    '    _one_time := greatest(coalesce(p.total_year_1,0) - _new_recurring, 0);' || chr(10) ||
    '  END IF;');
  IF position('IF p.product_family = ''Business'' THEN' IN _def) = 0 THEN
    RAISE EXCEPTION 'FIN02_ONE_TIME_SPLIT_HOOK_MISSING';
  END IF;
  -- Marker used to prevent accidental double application in later migrations.
  _def := replace(_def, '  -- ── Renewed ─',
    '  -- FIN02_RENEWAL_POLICY_V1: recurring baseline includes next-cycle price.' || chr(10) ||
    '  -- ── Renewed ─');
  EXECUTE _def;
END
$fin02_renewal_patch$;
