-- PartnerOS R1 — minimal replay of EXISTING PROD discount protections.
-- SOURCE: read-only inspection of actual PROD PostgreSQL function definitions
-- on 12 October 2026; transcribed without inventing NEW discount mechanisms.
-- CI ONLY in disposable PG17; synthetic actors and commercial rows.
-- NOT a migration, NOT a faithful TEST/PROD database restore.
\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE SCHEMA private;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,partner_id uuid,is_hq boolean NOT NULL DEFAULT false);
CREATE TABLE public.user_roles(user_id uuid NOT NULL, role text NOT NULL);
CREATE TABLE public.partners(id uuid PRIMARY KEY, partnership_level text);
CREATE TABLE public.partner_discount_limits(
 partner_id uuid PRIMARY KEY,max_software_discount_pct numeric,
 max_services_discount_pct numeric
);
CREATE TABLE public.proposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_config jsonb NOT NULL DEFAULT '{}'::jsonb,
 discount_pct numeric DEFAULT 0,software_discount_pct numeric DEFAULT 0,
 services_discount_pct numeric DEFAULT 0
);
CREATE TABLE public.proposal_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 category text NOT NULL,item_name text NOT NULL,discount_type text DEFAULT 'none',
 discount_value numeric DEFAULT 0,gross_total numeric,total numeric,
 qty numeric DEFAULT 1,unit_price numeric DEFAULT 0
);
GRANT USAGE ON SCHEMA auth,public TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.proposals,public.proposal_items TO authenticated;

-- PRODUCTION FUNCTION SOURCE — original logic, scoped to the synthetic
-- profile/roles/partner/discount-limit fixture declared above.
CREATE OR REPLACE FUNCTION private.current_proposal_discount_limits()
 RETURNS TABLE(software_limit numeric, services_limit numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _is_hq boolean := false;
  _partner_id uuid;
  _level text;
  _ov_sw numeric;
  _ov_sv numeric;
BEGIN
  IF _uid IS NULL THEN
    software_limit := 100;
    services_limit := 100;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT coalesce(p.is_hq, false), p.partner_id
    INTO _is_hq, _partner_id
  FROM public.profiles p
  WHERE p.id = _uid;

  _is_hq := coalesce(_is_hq, false) AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _uid
      AND ur.role IN ('hq_admin', 'hq_standard')
  );

  IF _is_hq THEN
    software_limit := 100;
    services_limit := 100;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT pa.partnership_level INTO _level
  FROM public.partners pa
  WHERE pa.id = _partner_id;

  -- Unchanged default semantics.
  software_limit := 10;
  services_limit := CASE
    WHEN lower(coalesce(_level, '')) = 'implementer' THEN 100
    ELSE 10
  END;

  -- Per-partner overrides for the AUTHENTICATED actor's partner only.
  SELECT dl.max_software_discount_pct, dl.max_services_discount_pct
    INTO _ov_sw, _ov_sv
  FROM public.partner_discount_limits dl
  WHERE dl.partner_id = _partner_id;

  IF _ov_sw IS NOT NULL AND _ov_sw >= 0 AND _ov_sw <= 100 THEN
    software_limit := _ov_sw;   -- explicit 0 means zero, never a fallback
  END IF;
  IF _ov_sv IS NOT NULL AND _ov_sv >= 0 AND _ov_sv <= 100 THEN
    services_limit := _ov_sv;
  END IF;

  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_proposal_discount_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_software_limit numeric;
  v_services_limit numeric;
  v_business_discounts jsonb := coalesce(new.business_config->'discounts', '{}'::jsonb);
begin
  if auth.uid() is null then return new; end if;

  select software_limit, services_limit
  into v_software_limit, v_services_limit
  from private.current_proposal_discount_limits();

  if greatest(
    coalesce(new.discount_pct, 0),
    coalesce(new.software_discount_pct, 0),
    coalesce(nullif(v_business_discounts->>'softwarePct', '')::numeric, 0),
    coalesce(nullif(v_business_discounts->>'webUsersPct', '')::numeric, 0),
    coalesce(nullif(v_business_discounts->>'apiPct', '')::numeric, 0)
  ) > v_software_limit then
    raise exception 'Software discounts cannot exceed % percent per line for this user.', v_software_limit
      using errcode = '22023';
  end if;

  if greatest(
    coalesce(new.services_discount_pct, 0),
    coalesce(nullif(v_business_discounts->>'servicesPct', '')::numeric, 0)
  ) > v_services_limit then
    raise exception 'Service discounts cannot exceed % percent per line for this user.', v_services_limit
      using errcode = '22023';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_proposal_item_discount_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_software_limit numeric;
  v_services_limit numeric;
  v_limit numeric;
  v_gross numeric;
  v_value numeric := greatest(coalesce(new.discount_value, 0), 0);
begin
  if auth.uid() is null or coalesce(new.discount_type, 'none') = 'none' or v_value = 0 then
    return new;
  end if;

  select software_limit, services_limit
  into v_software_limit, v_services_limit
  from private.current_proposal_discount_limits();

  v_limit := case when new.category = 'service' then v_services_limit else v_software_limit end;

  if new.discount_type = 'percent' and v_value > v_limit then
    raise exception 'Discount on line "%" cannot exceed % percent for this user.', new.item_name, v_limit
      using errcode = '22023';
  end if;

  if new.discount_type = 'fixed' then
    v_gross := greatest(
      coalesce(nullif(new.gross_total, 0), nullif(new.total, 0), new.qty * new.unit_price, 0),
      0
    );
    if v_gross <= 0 or v_value > (v_gross * v_limit / 100) + 0.005 then
      raise exception 'Fixed discount on line "%" exceeds the effective % percent limit.', new.item_name, v_limit
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$function$;
CREATE TRIGGER enforce_proposal_discount_limits BEFORE INSERT OR UPDATE ON public.proposals
 FOR EACH ROW EXECUTE FUNCTION private.enforce_proposal_discount_limits();
CREATE TRIGGER enforce_proposal_item_discount_limits BEFORE INSERT OR UPDATE ON public.proposal_items
 FOR EACH ROW EXECUTE FUNCTION private.enforce_proposal_item_discount_limits();

-- All actors below are explicitly fictional / contain no real customer data.
INSERT INTO public.partners(id,partnership_level) VALUES
 ('00000000-0000-4000-8000-000000000101','reseller'),
 ('00000000-0000-4000-8000-000000000102','implementer');
INSERT INTO public.profiles(id,partner_id,is_hq) VALUES
 ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000101',false),
 ('00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000102',false),
 ('00000000-0000-4000-8000-000000000303',NULL,true),
 ('00000000-0000-4000-8000-000000000304','00000000-0000-4000-8000-000000000101',true);
INSERT INTO public.user_roles(user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000303','hq_admin');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',false);
DO $test$
DECLARE denied boolean:=false;
BEGIN
  INSERT INTO public.proposals(business_config)
  VALUES ('{"discounts":{"softwarePct":8,"webUsersPct":3,"servicesPct":8}}');
  BEGIN
    INSERT INTO public.proposals(business_config)
    VALUES ('{"discounts":{"softwarePct":15,"webUsersPct":3}}');
  EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'PROD_RESELLER_DISCOUNT_CAP_NOT_ENFORCED'; END IF;
  denied:=false;
  BEGIN
    INSERT INTO public.proposal_items(category,item_name,discount_type,discount_value,
      gross_total,total,qty,unit_price)
    VALUES('software','Core Software','fixed',20,100,100,1,100);
  EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'PROD_FIXED_EUR_DISCOUNT_CAP_NOT_ENFORCED'; END IF;
  INSERT INTO public.proposal_items(category,item_name,discount_type,discount_value,
      gross_total,total,qty,unit_price)
    VALUES('software','Core Software','fixed',10,100,100,1,100);
END $test$;
RESET ROLE;

-- Zero is a real override, never a missing-value fallback.
INSERT INTO public.partner_discount_limits(partner_id,max_software_discount_pct)
 VALUES('00000000-0000-4000-8000-000000000101',0);
SET ROLE authenticated;
DO $zero$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    INSERT INTO public.proposals(business_config)
    VALUES ('{"discounts":{"softwarePct":1}}');
  EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'PROD_ZERO_LIMIT_OVERRIDE_IGNORED'; END IF;
  INSERT INTO public.proposals(business_config)
    VALUES ('{"discounts":{"softwarePct":0}}');
END $zero$;
RESET ROLE;
DELETE FROM public.partner_discount_limits
 WHERE partner_id='00000000-0000-4000-8000-000000000101';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',false);
DO $impl$
DECLARE denied boolean:=false;
BEGIN
 INSERT INTO public.proposals(business_config)
  VALUES ('{"discounts":{"softwarePct":10,"servicesPct":80}}');
 BEGIN
  INSERT INTO public.proposals(business_config)
   VALUES ('{"discounts":{"softwarePct":15,"servicesPct":80}}');
 EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'PROD_IMPLEMENTER_SOFTWARE_CAP_IGNORED'; END IF;
END $impl$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',false);
DO $hq$
BEGIN
 INSERT INTO public.proposals(business_config)
  VALUES ('{"discounts":{"softwarePct":95,"servicesPct":95}}');
END $hq$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',false);
DO $unapprovedHq$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
 INSERT INTO public.proposals(business_config)
  VALUES ('{"discounts":{"softwarePct":15}}');
 EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'HQ_FLAG_WITHOUT_HQ_ROLE_BYPASSED_DISCOUNT_CAP'; END IF;
END $unapprovedHq$;
RESET ROLE;

SELECT 'PASS — original PROD discount functions deny reseller 15%, fixed EUR > 10%, 0% override, unapproved HQ flag; accept implementer 80% services and HQ 95% in fictional PG17.' AS result;
-- TRUST BOUNDARY OBSERVATION (not tested as role integrity):
-- Original trigger code returns NEW if auth.uid() IS NULL; service-trigger
-- writes must be separately authorized/audited before public exposure.
