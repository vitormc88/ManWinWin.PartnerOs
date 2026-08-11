DO $do$
DECLARE
  _src text;
  _old text := $old$  _interval := CASE lower(coalesce(r.billing_frequency,'annual'))
                 WHEN 'monthly' THEN interval '1 month'
                 WHEN 'quarterly' THEN interval '3 months'
                 WHEN 'semiannual' THEN interval '6 months'
                 ELSE interval '1 year' END;
  _next := coalesce(_next_renewal_date, (_eff + _interval)::date);$old$;
  _new text := $new$  _interval := CASE lower(coalesce(r.billing_frequency,''))
                 WHEN 'monthly' THEN interval '1 month'
                 WHEN 'quarterly' THEN interval '3 months'
                 WHEN 'semiannual' THEN interval '6 months'
                 WHEN 'semestral' THEN interval '6 months'
                 WHEN 'annual' THEN interval '1 year'
                 WHEN 'annually' THEN interval '1 year'
                 WHEN 'yearly' THEN interval '1 year'
                 ELSE NULL END;
  _next := coalesce(_next_renewal_date, (_eff + _interval)::date);
  IF _next IS NULL THEN
    RAISE EXCEPTION 'A next renewal date is required: this contract does not follow a standard period (%).',
      coalesce(r.billing_frequency, 'unknown');
  END IF;$new$;
BEGIN
  SELECT prosrc INTO _src
    FROM pg_proc WHERE proname = 'close_renewal' AND pronamespace = 'public'::regnamespace;
  IF position(_old in _src) = 0 THEN
    RAISE EXCEPTION 'close_renewal source did not match the expected period block; aborting';
  END IF;
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.close_renewal(_renewal_id uuid, _outcome text, _proposal_id uuid DEFAULT NULL::uuid, _closing_notes text DEFAULT NULL::text, _loss_reason text DEFAULT NULL::text, _effective_date date DEFAULT NULL::date, _next_renewal_date date DEFAULT NULL::date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
    replace(_src, _old, _new));
END
$do$;

REVOKE ALL ON FUNCTION public.close_renewal(uuid, text, uuid, text, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_renewal(uuid, text, uuid, text, text, date, date) TO authenticated;