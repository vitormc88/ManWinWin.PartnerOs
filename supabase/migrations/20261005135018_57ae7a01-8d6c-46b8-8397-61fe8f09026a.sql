-- Focused renewal corrections (B, C, D). Applied as guarded in-place rewrites of
-- the current function bodies so the rest of each function stays byte-identical.
CREATE OR REPLACE FUNCTION private.license_is_perpetual(_model text, _periodicity text, _product text, _edition text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(coalesce(_periodicity,'')) = 'perpetual'
      OR lower(replace(replace(coalesce(_model,''),'-',''),' ','')) IN ('keepit','perpetual')
      OR lower(replace(coalesce(_product,''),'-','')) LIKE '%keepit%'
      OR lower(replace(coalesce(_edition,''),'-','')) LIKE '%keepit%';
$$;
REVOKE ALL ON FUNCTION private.license_is_perpetual(text,text,text,text) FROM PUBLIC;

DO $mig$
DECLARE
  d text;
  old_f text := $o$status NOT IN ('Completed','Cancelled','Lost')$o$;
  new_f text := $n$status NOT IN ('Completed','Cancelled','Lost','Won') AND closed_at IS NULL AND nullif(btrim(coalesce(outcome,'')),'') IS NULL$n$;
  old_l text := E'      license_start_date = _eff,\n      license_end_date = (_next - 1),';
  new_l text := E'      -- Perpetual (KeepIT) rights are not annual: an S&AT/Web renewal never resets them.\n'
             || E'      license_start_date = CASE WHEN private.license_is_perpetual(license_model, periodicity, product, edition) THEN license_start_date ELSE _eff END,\n'
             || E'      license_end_date   = CASE WHEN private.license_is_perpetual(license_model, periodicity, product, edition) THEN license_end_date ELSE (_next - 1) END,\n'
             || E'      -- Current recurring value follows the reconciled contract lines.\n'
             || E'      recurring_contract_value = _recurring_total,';
BEGIN
  -- B: closed cycles never drive active counts / next date in commercial intelligence.
  d := pg_get_functiondef('public.get_client_commercial_intelligence(uuid)'::regprocedure);
  IF (length(d) - length(replace(d, old_f, ''))) / length(old_f) <> 2 THEN
    RAISE EXCEPTION 'get_client_commercial_intelligence: expected 2 renewal status filters';
  END IF;
  EXECUTE replace(d, old_f, new_f);

  -- C + D: official close.
  d := pg_get_functiondef('public.close_renewal_core(uuid,text,uuid,text,text,date,date)'::regprocedure);
  IF position(old_l IN d) = 0 THEN
    RAISE EXCEPTION 'close_renewal_core: licence date block not found';
  END IF;
  EXECUTE replace(d, old_l, new_l);
END
$mig$;

REVOKE EXECUTE ON FUNCTION public.get_client_commercial_intelligence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_commercial_intelligence(uuid) TO authenticated, service_role;