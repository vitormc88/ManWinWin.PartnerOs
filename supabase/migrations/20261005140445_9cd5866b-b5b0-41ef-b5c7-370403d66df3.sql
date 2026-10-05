-- Renewal payment terms: a renewal proposal cannot be validated while its terms are empty (review required).
DO $mig$
DECLARE
  d text;
  anchor text := $a$  IF _is_renewal AND p.product_family = 'Business'$a$;
BEGIN
  d := pg_get_functiondef('public.validate_proposal'::regproc);
  IF position('Payment terms must be reviewed' IN d) > 0 THEN RETURN; END IF;
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'validate_proposal: anchor not found';
  END IF;
  EXECUTE replace(d, anchor,
    E'  IF _is_renewal AND coalesce(btrim(p.payment_terms),'''') = '''' THEN\n'
 || E'    _errs := array_append(_errs, ''Payment terms must be reviewed: enter the terms agreed with this customer.''::text);\n'
 || E'  END IF;\n' || anchor);
END
$mig$;