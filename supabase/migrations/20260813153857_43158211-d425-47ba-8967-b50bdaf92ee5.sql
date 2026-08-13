DO $mig$
DECLARE
  _def text;
  _old text;
  _new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _def
    FROM pg_proc
   WHERE proname = 'close_renewal'
     AND pronamespace = 'public'::regnamespace
   LIMIT 1;
  IF _def IS NULL THEN RAISE EXCEPTION 'close_renewal not found'; END IF;

  IF position('cl.line_type IN (''license'',''mww_web'')' in _def) > 0 THEN
    RETURN; -- already patched
  END IF;

  _old := '  IF _plan_change THEN
    DELETE FROM public.contract_lines
     WHERE contract_id = c.id
       AND line_type = ''license''
       AND (source_item_id IS NULL
            OR source_item_id NOT IN (SELECT id FROM public.proposal_items WHERE proposal_id = p.id));
  END IF;';

  _new := '  IF _plan_change THEN
    DELETE FROM public.contract_lines cl
     WHERE cl.contract_id = c.id
       AND cl.line_type IN (''license'',''mww_web'')
       AND (cl.source_item_id IS NULL
            OR cl.source_item_id NOT IN (SELECT id FROM public.proposal_items WHERE proposal_id = p.id))
       AND EXISTS (SELECT 1 FROM public.proposal_items pi
                    WHERE pi.proposal_id = p.id AND pi.line_type = cl.line_type);
  END IF;';

  IF position(_old in _def) = 0 THEN
    RAISE EXCEPTION 'close_renewal superseded-line block not found — aborting to avoid an unsafe rewrite';
  END IF;

  EXECUTE replace(_def, _old, _new);
END
$mig$;