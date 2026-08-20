-- Corrective: partners has company_name (not commercial_name). Recreate the
-- two certificate RPCs so they resolve the partner label from the real column.
CREATE OR REPLACE FUNCTION public.academy_my_certificates()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _rows jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'certificate_reference', c.certificate_reference,
           'user_id', c.user_id,
           'learner_name', coalesce(p.full_name, 'Academy learner'),
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
  WHERE c.user_id = _uid;

  RETURN _rows;
END $$;

REVOKE ALL ON FUNCTION public.academy_my_certificates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_my_certificates() TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_managed_certificates(_partner_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _admin boolean; _mine uuid; _rows jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _admin := public.is_academy_admin() OR public.is_hq_user();
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

-- The Qualification Checklist has no stored file and no external URL: it is a
-- content-only resource, read and printed in the app.
UPDATE public.academy_resources
   SET is_downloadable = false
 WHERE id = '81ca8468-8a80-41fb-abde-da40507bf4ff'::uuid
   AND file_path IS NULL
   AND external_url IS NULL;