-- Corrective: is_hq_user takes the user id; the zero-argument call failed at
-- runtime for every caller of academy_managed_certificates.
CREATE OR REPLACE FUNCTION public.academy_managed_certificates(_partner_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _admin boolean; _mine uuid; _rows jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _admin := public.is_academy_admin() OR public.is_hq_user(_uid);
  _mine  := public.get_user_partner_id(_uid);

  IF NOT _admin THEN
    IF _mine IS NULL THEN RETURN '[]'::jsonb; END IF;
    IF _partner_id IS NOT NULL AND _partner_id <> _mine THEN
      RAISE EXCEPTION 'Not authorised';
    END IF;
    _partner_id := _mine;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'certificate_reference', c.certificate_reference,
           'user_id', c.user_id,
           'learner_name', coalesce(p.full_name, 'Academy learner'),
           'learner_email', CASE WHEN _admin THEN p.email ELSE NULL END,
           'partner_id', p.partner_id,
           'partner_name', pa.company_name,
           'module_id', c.module_id,
           'module_title', m.title,
           'module_slug', m.slug,
           'module_version', c.module_version,
           'score', c.score,
           'scenario_score', c.scenario_score,
           'issued_at', c.issued_at,
           'status', c.status,
           'attempt_id', c.attempt_id
         ) ORDER BY c.issued_at DESC), '[]'::jsonb)
    INTO _rows
  FROM public.academy_certifications c
  JOIN public.academy_modules m ON m.id = c.module_id
  LEFT JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN public.partners pa ON pa.id = p.partner_id
  WHERE (_partner_id IS NULL OR p.partner_id = _partner_id);

  RETURN _rows;
END $$;

REVOKE ALL ON FUNCTION public.academy_managed_certificates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_managed_certificates(uuid) TO authenticated;