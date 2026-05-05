DO $$
DECLARE
  max_suffix bigint;
BEGIN
  SELECT max((regexp_match(partner_code, '(\d+)$'))[1]::bigint)
  INTO max_suffix
  FROM public.partners
  WHERE partner_code ~ '\d+$';

  IF max_suffix IS NULL THEN
    PERFORM setval('public.partner_code_seq', 1, false);
  ELSE
    PERFORM setval('public.partner_code_seq', max_suffix, true);
  END IF;
END;
$$;