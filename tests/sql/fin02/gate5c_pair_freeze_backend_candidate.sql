-- FIN02 Gate5C | LAB-ONLY, source-backed selected Business option verification.
-- DO NOT MOVE INTO supabase/migrations. Not an actual TEST or PROD install.
-- This models an APPROVED SERVER PRICING BOOK. No browser supplied
-- "frozen=true" / hash can authorize prices. Server catalog / discount
-- authority must be integrated with actual TEST before release.
CREATE SCHEMA IF NOT EXISTS private;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- In this LAB the price-book is populated only by fixture owner/postgres.
-- No partner/authenticated browser grants. A production implementation must
-- derive it from server versioned price rules plus authorized overrides.
CREATE TABLE private.fin02_verified_quote_lines_lab(
 comparison_id uuid NOT NULL REFERENCES public.proposals(id),
 option text NOT NULL CHECK (option IN ('keepit','useit')),
 sort_order integer NOT NULL,
 item_code text NOT NULL,
 item_name text NOT NULL,
 line_type text NOT NULL,
 qty numeric NOT NULL CHECK(qty>0),
 unit_price numeric NOT NULL CHECK(unit_price>=0),
 frequency text NOT NULL,
 gross_total numeric(18,2) NOT NULL CHECK(gross_total>=0),
 discount_amount numeric(18,2) NOT NULL CHECK(discount_amount>=0),
 net_total numeric(18,2) NOT NULL CHECK(net_total>=0),
 recurring boolean NOT NULL,
 discount_renews boolean NOT NULL,
 pricing_rule_code text NOT NULL,
 pricing_rule_version integer NOT NULL CHECK(pricing_rule_version>=1),
 approved_override_id uuid,
 PRIMARY KEY(comparison_id, option,sort_order),
 UNIQUE(comparison_id,option,item_code)
);
REVOKE ALL ON private.fin02_verified_quote_lines_lab FROM PUBLIC,anon,authenticated;

CREATE TABLE private.fin02_frozen_option_lab(
 comparison_id uuid NOT NULL REFERENCES public.proposals(id),
 option text NOT NULL CHECK(option IN ('keepit','useit')),
 comparison_version integer NOT NULL CHECK(comparison_version>=1),
 year1 numeric(18,2) NOT NULL,
 renewal numeric(18,2) NOT NULL,
 total_discount numeric(18,2) NOT NULL,
 -- JSONB arranged deterministically by sort_order, prices in numeric cents.
 lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array'),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
 frozen_by uuid NOT NULL,
 frozen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(comparison_id,option),
 UNIQUE(comparison_id,option,fingerprint)
);
ALTER TABLE private.fin02_frozen_option_lab ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.fin02_frozen_option_lab FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.fin02_block_frozen_change_lab() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
BEGIN
 RAISE EXCEPTION 'FIN02_FROZEN_OPTION_IS_IMMUTABLE'
 USING ERRCODE='42501';
END $$;
CREATE TRIGGER fin02_no_frozen_update_delete
 BEFORE UPDATE OR DELETE ON private.fin02_frozen_option_lab
 FOR EACH ROW EXECUTE FUNCTION private.fin02_block_frozen_change_lab();

-- Canonical array is derived from TRUSTED rows, NOT caller-provided money.
CREATE FUNCTION private.fin02_quote_canonical_lab(_comparison uuid,_option text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO '' AS $$
SELECT jsonb_agg(jsonb_build_object(
 'sort_order',sort_order,
 'item_code',item_code,'item_name',item_name,'line_type',line_type,
 'qty',qty,'unit_price',unit_price,'frequency',frequency,
 'gross_total',gross_total,'discount_amount',discount_amount,
 'net_total',net_total,'recurring',recurring,
 'discount_renews',discount_renews,'pricing_rule_code',pricing_rule_code,
 'pricing_rule_version',pricing_rule_version,
 'approved_override_id',approved_override_id
) ORDER BY sort_order)
FROM private.fin02_verified_quote_lines_lab
WHERE comparison_id=_comparison AND option=_option;
$$;
REVOKE ALL ON FUNCTION private.fin02_quote_canonical_lab(uuid,text)
 FROM PUBLIC,anon,authenticated;

-- Atomic *pair* freeze, invoked by an authorized actor after Ready. Uses the
-- verified server-generated price book, not browser snapshots. If one option
-- is absent/invalid, the other must NOT be frozen.
CREATE FUNCTION public.fin02_freeze_compared_options_lab(_comparison uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 _p public.proposals%ROWTYPE;
 _actor uuid := auth.uid();
 _mode text;
 _lines jsonb;
 _year1 numeric;
 _renewal numeric;
 _discount numeric;
 _count int;
 _invalid int;
 _fp text;
 _old private.fin02_frozen_option_lab%ROWTYPE;
 _response jsonb := '{}'::jsonb;
BEGIN
 IF _actor IS NULL THEN RAISE EXCEPTION 'FIN02_FREEZE_UNAUTHENTICATED'
 USING ERRCODE='42501'; END IF;
 SELECT * INTO _p FROM public.proposals WHERE id=_comparison FOR UPDATE;
 IF NOT FOUND OR _p.product_family IS DISTINCT FROM 'Business'
 OR _p.source_type IS DISTINCT FROM 'deal'
 OR _p.proposal_mode IS DISTINCT FROM 'compare_keepit_useit'
 OR _p.status NOT IN ('Ready','Sent','Accepted')
 OR NOT coalesce(public.can_manage_deal(_p.deal_id),false) THEN
  RAISE EXCEPTION 'FIN02_COMPARISON_NOT_READY_OR_NOT_AUTHORIZED'
  USING ERRCODE='42501';
 END IF;
 -- Must be newly frozen as a matched pair, unless exact same frozen pair
 -- already exists (safe retry, not a reprice from a later catalog).
 SELECT count(*) INTO _count FROM private.fin02_frozen_option_lab
 WHERE comparison_id=_comparison;
 IF _count=2 THEN
  IF (SELECT count(*) FROM private.fin02_frozen_option_lab
     WHERE comparison_id=_comparison AND comparison_version=_p.version)<>2
  THEN RAISE EXCEPTION 'FIN02_FROZEN_VERSION_CHANGED' USING ERRCODE='23514'; END IF;
  RETURN (SELECT jsonb_object_agg(option,fingerprint)
    FROM private.fin02_frozen_option_lab WHERE comparison_id=_comparison);
 END IF;
 IF _count<>0 THEN RAISE EXCEPTION 'FIN02_PARTIAL_PAIR_NEVER_ACCEPTED'
 USING ERRCODE='23514'; END IF;
 FOREACH _mode IN ARRAY ARRAY['keepit','useit'] LOOP
  SELECT count(*),
    count(*) FILTER (WHERE item_code IS NULL OR btrim(item_code)=''
       OR item_name IS NULL OR btrim(item_name)=''
       OR round(gross_total-discount_amount,2)<>net_total
       OR (discount_renews AND NOT recurring)
       OR (pricing_rule_code IS NULL OR btrim(pricing_rule_code)='')
       OR (discount_amount>0 AND discount_amount>gross_total)),
    coalesce(sum(net_total),0),
    coalesce(sum(CASE WHEN recurring THEN
      CASE WHEN discount_renews THEN net_total ELSE gross_total END ELSE 0 END),0),
    coalesce(sum(discount_amount),0)
  INTO _count,_invalid,_year1,_renewal,_discount
  FROM private.fin02_verified_quote_lines_lab
  WHERE comparison_id=_comparison AND option=_mode;
  IF _count=0 OR _invalid>0 OR _year1<=0 OR _renewal<0 OR _discount<0
  THEN RAISE EXCEPTION 'FIN02_VERIFIED_OPTION_INVALID_OR_MISSING_%',_mode
  USING ERRCODE='23514'; END IF;
  _lines:=private.fin02_quote_canonical_lab(_comparison,_mode);
  _fp:=encode(public.digest(
   convert_to((_p.id::text||':'||_p.version::text||':'||_mode||':'||
    _lines::text),'UTF8'),'sha256'),'hex');
  INSERT INTO private.fin02_frozen_option_lab
    (comparison_id,option,comparison_version,year1,renewal,
     total_discount,lines,fingerprint,frozen_by)
  VALUES(_comparison,_mode,_p.version,_year1,_renewal,_discount,
     _lines,_fp,_actor);
  _response:=_response||jsonb_build_object(_mode,_fp);
 END LOOP;
 RETURN _response;
END $fn$;
REVOKE ALL ON FUNCTION public.fin02_freeze_compared_options_lab(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin02_freeze_compared_options_lab(uuid)
 TO authenticated;

-- FIN02 backend selected proposal guard, injected into the REAL source award
-- RPC in the LAB below. This guard never writes or reparses current catalog.
-- A deal having any Ready/Sent/Accepted compare proposal MUST use a selected
-- child bound to a frozen alternative; nulling parent ID cannot bypass it.
CREATE FUNCTION public.fin02_assert_frozen_chosen_lab(_proposal uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 _p public.proposals%ROWTYPE;
 _c public.proposals%ROWTYPE;
 _mode text;
 _f private.fin02_frozen_option_lab%ROWTYPE;
 _rows jsonb;
 _year1 numeric;_renewal numeric;_discount numeric;
 _n int;
BEGIN
 SELECT * INTO _p FROM public.proposals WHERE id=_proposal;
 IF NOT FOUND OR _p.product_family IS DISTINCT FROM 'Business' THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.proposals
   WHERE deal_id=_p.deal_id AND product_family='Business'
    AND proposal_mode='compare_keepit_useit' AND status IN ('Ready','Sent','Accepted'))
 THEN RETURN; -- stand-alone Business proposal, existing Gate3 path
 END IF;
 IF _p.parent_proposal_id IS NULL THEN
  RAISE EXCEPTION 'FIN02_SELECTED_COMPARE_PARENT_REQUIRED' USING ERRCODE='23514';
 END IF;
 SELECT * INTO _c FROM public.proposals
 WHERE id=_p.parent_proposal_id
   AND id<>_p.id AND deal_id=_p.deal_id
   AND source_type='deal' AND product_family='Business'
   AND proposal_mode='compare_keepit_useit'
   AND status IN ('Ready','Sent','Accepted');
 IF NOT FOUND OR _p.version<=_c.version
 THEN RAISE EXCEPTION 'FIN02_SELECTED_SOURCE_COMPARISON_INVALID' USING ERRCODE='23514'; END IF;
 _mode:=CASE _p.proposal_mode WHEN 'keepit_only' THEN 'keepit'
  WHEN 'useit_only' THEN 'useit' ELSE NULL END;
 IF _mode IS NULL THEN
  RAISE EXCEPTION 'FIN02_SELECTED_OPTION_UNRESOLVED' USING ERRCODE='23514'; END IF;
 SELECT * INTO _f FROM private.fin02_frozen_option_lab
 WHERE comparison_id=_c.id AND option=_mode
   AND comparison_version=_c.version;
 IF NOT FOUND THEN RAISE EXCEPTION 'FIN02_SELECTED_OPTION_NOT_FROZEN'
 USING ERRCODE='23514'; END IF;

 -- Projection from actual SAVED selected source items: amounts are compared
 -- line-by-line, with price-rule revision, quantities, description, renewal
 -- policy, gross/net, discount. Distinct proposal_item UUIDs do not matter.
 SELECT jsonb_agg(jsonb_build_object(
  'sort_order',sort_order,
  'item_code',item_code,'item_name',item_name,'line_type',line_type,
  'qty',qty,'unit_price',unit_price,'frequency',frequency,
  'gross_total',gross_total,'discount_amount',discount_amount,
  'net_total',net_total,'recurring',is_recurring,
  'discount_renews',apply_discount_to_renewal,
  'pricing_rule_code',pricing_rule_code,'pricing_rule_version',1,
  'approved_override_id',null::uuid
 ) ORDER BY sort_order),
 count(*),coalesce(sum(net_total),0),coalesce(sum(CASE WHEN is_recurring
  THEN CASE WHEN apply_discount_to_renewal THEN net_total ELSE gross_total END
  ELSE 0 END),0),coalesce(sum(discount_amount),0)
 INTO _rows,_n,_year1,_renewal,_discount
 FROM public.proposal_items WHERE proposal_id=_p.id;

 -- Lab fixture pricing-rule version is a constant because current TEST
 -- proposal_items has no independent immutable rule revision: this is a
 -- deliberate release blocker, NOT sufficient real-world provenance.
 IF _rows IS DISTINCT FROM _f.lines OR _n<>jsonb_array_length(_f.lines)
 OR round(_year1,2)<>_f.year1 OR round(_renewal,2)<>_f.renewal
 OR round(_discount,2)<>_f.total_discount
 OR round(_p.total_year_1,2)<>_f.year1
 OR round(_p.total_recurring,2)<>_f.renewal
 OR round(_p.discount_amount,2)<>_f.total_discount
 THEN RAISE EXCEPTION 'FIN02_SELECTED_LINES_DIFFER_FROM_FROZEN_OPTION'
 USING ERRCODE='23514'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.fin02_assert_frozen_chosen_lab(uuid)
 FROM PUBLIC,anon,authenticated;

-- IN DISPOSABLE CI ONLY: patch the exact previously FIN02-patched original
-- award RPC at the anchor. No live migrations, no runtime deployment.
DO $lab_patch$
DECLARE
 _def text;
 _anchor text := '  PERFORM public.fin02_assert_business_award(_proposal_id, _license, _contract_lines);';
BEGIN
 SELECT pg_get_functiondef(
  'public.award_deal_proposal(uuid,uuid,uuid,jsonb,jsonb,date,integer)'::regprocedure
 ) INTO _def;
 IF position(_anchor IN _def)=0
 OR position('fin02_assert_frozen_chosen_lab' IN _def)>0 THEN
  RAISE EXCEPTION 'FIN02_GATE5C_ORIGINAL_AWARD_PATCH_ANCHOR_NO_GO'; END IF;
 EXECUTE replace(_def,_anchor,
   _anchor||chr(10)||'  PERFORM public.fin02_assert_frozen_chosen_lab(_proposal_id);');
END $lab_patch$;
