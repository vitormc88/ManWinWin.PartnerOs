-- FIN02 Gate5D SOURCE-AWARE COMMERCIAL AUTHORITY PROTOTYPE. LAB ONLY.
-- Runs ONLY on disposable synthetic PostgreSQL 17 after Gate5C candidate.
-- NEVER put this SQL in supabase/migrations or execute against TEST/PROD.
--
-- Actual Lovable TEST source catalog READ-ONLY findings: pricing_rules exists
-- with id/code/unit_price/support_percentage/updated_at, HQ Admin update RLS;
-- NO partner_discount_limits table and NO proposal discount-guard triggers.
-- Older migrations_review/ SQL represents production/review contract ONLY.
--
-- These trusted price rows are synthetic. Real product Business engine is far
-- broader: quantities, derived UseIT, regional hosting, API, plugins, onsite
-- services, 17% S&TA, plan changes and overrides need exact server parity.
ALTER TABLE public.partners ADD COLUMN partnership_level text;

CREATE TABLE private.fin02_gate5d_catalog_lab(
 rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text NOT NULL UNIQUE,
 option text NOT NULL CHECK(option IN ('keepit','useit')),
 item_code text NOT NULL,
 item_name text NOT NULL,
 line_type text NOT NULL,
 category text NOT NULL CHECK(category IN ('software','services','web','sat')),
 unit_price numeric(14,2) NOT NULL CHECK(unit_price>=0),
 qty numeric NOT NULL DEFAULT 1 CHECK(qty>0),
 frequency text NOT NULL,
 recurring boolean NOT NULL,
 discount_channel text,
 rule_version integer NOT NULL DEFAULT 1 CHECK(rule_version>=1),
 active boolean NOT NULL DEFAULT true,
 sort_order int NOT NULL,
 UNIQUE(option,sort_order)
);
CREATE TABLE private.fin02_gate5d_partner_overrides_lab(
 partner_id uuid PRIMARY KEY REFERENCES public.partners(id),
 software_limit numeric CHECK(software_limit BETWEEN 0 AND 100),
 services_limit numeric CHECK(services_limit BETWEEN 0 AND 100)
);
REVOKE ALL ON private.fin02_gate5d_catalog_lab,
 private.fin02_gate5d_partner_overrides_lab FROM PUBLIC,anon,authenticated;

-- Actor identity & organization are taken ONLY from signed auth.uid()
-- (synthetic JWT claim in disposable CI), never from form's partner_uuid.
CREATE FUNCTION private.fin02_gate5d_limits_lab()
RETURNS TABLE(software_limit numeric,services_limit numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 _uid uuid:=auth.uid();
 _partner uuid;
 _hq boolean;
 _level text;
 _sw numeric;
 _sv numeric;
BEGIN
 IF _uid IS NULL THEN RAISE EXCEPTION 'FIN02_DISCOUNT_ACTOR_REQUIRED'
 USING ERRCODE='42501'; END IF;
 SELECT p.partner_id,
   (coalesce(p.is_hq,false) AND EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.user_id=_uid
      AND r.role IN ('hq_admin','hq_standard')))
 INTO _partner,_hq
 FROM public.profiles p WHERE p.id=_uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'FIN02_DISCOUNT_PROFILE_MISSING'
 USING ERRCODE='42501'; END IF;
 IF _hq THEN
  software_limit:=100;services_limit:=100;RETURN NEXT;RETURN;
 END IF;
 IF _partner IS NULL THEN RAISE EXCEPTION 'FIN02_DISCOUNT_PARTNER_MISSING'
 USING ERRCODE='42501'; END IF;
 SELECT lower(coalesce(p.partnership_level,'')) INTO _level
 FROM public.partners p WHERE p.id=_partner;
 software_limit:=10;
 services_limit:=CASE WHEN _level='implementer' THEN 100 ELSE 10 END;
 SELECT o.software_limit,o.services_limit INTO _sw,_sv
 FROM private.fin02_gate5d_partner_overrides_lab o
 WHERE o.partner_id=_partner;
 IF _sw IS NOT NULL THEN software_limit:=_sw; END IF;
 IF _sv IS NOT NULL THEN services_limit:=_sv; END IF;
 RETURN NEXT;
END $fn$;
REVOKE ALL ON FUNCTION private.fin02_gate5d_limits_lab()
 FROM PUBLIC,anon,authenticated;

-- Strict price channels reflect current BusinessConfig discounts.
-- This proof deliberately supports a tiny *fixed quantity* catalog subset.
-- It must never be treated as the full ManWinWin pricing calculator.
CREATE FUNCTION public.fin02_authorize_and_freeze_lab(_comparison uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 _uid uuid:=auth.uid();
 _p public.proposals%ROWTYPE;
 _d jsonb;
 _soft numeric;_web numeric;_services numeric;_api numeric;
 _sw_limit numeric;_svc_limit numeric;_renews boolean;
 _row record;
 _discount_pct numeric;
 _gross numeric;_discount numeric;
 _keepit_gross numeric;
 _existing int;
BEGIN
 IF _uid IS NULL THEN RAISE EXCEPTION 'FIN02_AUTHORITY_ACTOR_REQUIRED'
 USING ERRCODE='42501'; END IF;
 SELECT * INTO _p FROM public.proposals WHERE id=_comparison FOR UPDATE;
 IF NOT FOUND OR _p.status NOT IN ('Ready','Sent','Accepted')
 OR _p.proposal_mode<>'compare_keepit_useit'
 OR _p.product_family<>'Business'
 OR NOT coalesce(public.can_manage_deal(_p.deal_id),false)
 THEN RAISE EXCEPTION 'FIN02_AUTHORITY_PROPOSAL_OR_ROLE_DENIED'
 USING ERRCODE='42501'; END IF;

 SELECT count(*) INTO _existing FROM private.fin02_frozen_option_lab
 WHERE comparison_id=_comparison;
 IF _existing=2 THEN
  -- Idempotent: NEVER reload current catalog for a previously frozen version.
  RETURN public.fin02_freeze_compared_options_lab(_comparison);
 END IF;
 IF _existing<>0 OR EXISTS(SELECT 1 FROM private.fin02_verified_quote_lines_lab
 WHERE comparison_id=_comparison)
 THEN RAISE EXCEPTION 'FIN02_AUTHORITY_PARTIAL_OR_FOREIGN_PRICE_SOURCE'
 USING ERRCODE='23514'; END IF;

 _d:=coalesce(_p.business_config->'discounts','{}'::jsonb);
 IF jsonb_typeof(_d)<>'object'
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(_d) AS k
   WHERE k NOT IN ('softwarePct','webUsersPct','webUsersRenews','apiPct','servicesPct'))
 THEN RAISE EXCEPTION 'FIN02_AUTHORITY_INVALID_DISCOUNT_CHANNELS'
 USING ERRCODE='23514'; END IF;

 -- Fail closed on non-numeric/negative/over-100 even if a hacked browser
 -- bypasses its own percentage clamps.
 _soft:=coalesce((_d->>'softwarePct')::numeric,0);
 _web:=coalesce((_d->>'webUsersPct')::numeric,0);
 _services:=coalesce((_d->>'servicesPct')::numeric,0);
 _api:=coalesce((_d->>'apiPct')::numeric,0);
 _renews:=coalesce((_d->>'webUsersRenews')::boolean,false);
 IF _soft NOT BETWEEN 0 AND 100 OR _web NOT BETWEEN 0 AND 100
 OR _services NOT BETWEEN 0 AND 100 OR _api NOT BETWEEN 0 AND 100
 THEN RAISE EXCEPTION 'FIN02_AUTHORITY_DISCOUNT_OUT_OF_RANGE'
 USING ERRCODE='23514'; END IF;
 SELECT software_limit,services_limit INTO _sw_limit,_svc_limit
 FROM private.fin02_gate5d_limits_lab();
 IF _soft>_sw_limit OR _web>_sw_limit OR _api>_sw_limit
 OR _services>_svc_limit THEN
  RAISE EXCEPTION 'FIN02_AUTHORITY_DISCOUNT_EXCEEDS_ROLE_CAP'
  USING ERRCODE='42501'; END IF;

 -- Lab source catalog: KeepIT gross license subtotal must drive S&TA.
 SELECT sum(unit_price*qty) INTO _keepit_gross
 FROM private.fin02_gate5d_catalog_lab
 WHERE option='keepit' AND category='software' AND active=true;
 IF _keepit_gross IS NULL OR _keepit_gross<=0 THEN
  RAISE EXCEPTION 'FIN02_AUTHORITY_MISSING_KEEPIT_BASE' USING ERRCODE='23514'; END IF;

 -- All pricing is derived from PRIVATE trusted rules; the client NEVER
 -- supplies an option priced line or official server fingerprint.
 FOR _row IN SELECT * FROM private.fin02_gate5d_catalog_lab
             WHERE active=true ORDER BY option,sort_order LOOP
  _gross:=CASE WHEN _row.category='sat'
    THEN round(_keepit_gross*_row.unit_price/100,2)
    ELSE round(_row.qty*_row.unit_price,2) END;
  _discount_pct:=CASE _row.category
   WHEN 'software' THEN _soft
   WHEN 'web' THEN _web
   WHEN 'services' THEN _services
   ELSE 0 END;
  _discount:=round(_gross*_discount_pct/100,2);
  INSERT INTO private.fin02_verified_quote_lines_lab(
    comparison_id,option,sort_order,item_code,item_name,line_type,qty,
    unit_price,frequency,gross_total,discount_amount,net_total,
    recurring,discount_renews,pricing_rule_code,pricing_rule_version)
  VALUES(_comparison,_row.option,_row.sort_order,_row.item_code,_row.item_name,
   _row.line_type,_row.qty,
   CASE WHEN _row.category='sat' THEN _gross ELSE _row.unit_price END,
   _row.frequency,_gross,_discount,_gross-_discount,_row.recurring,
   (_row.category='web' AND _renews AND _discount>0),
   _row.code,_row.rule_version);
 END LOOP;
 RETURN public.fin02_freeze_compared_options_lab(_comparison);
END $fn$;
REVOKE ALL ON FUNCTION public.fin02_authorize_and_freeze_lab(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin02_authorize_and_freeze_lab(uuid)
 TO authenticated;
