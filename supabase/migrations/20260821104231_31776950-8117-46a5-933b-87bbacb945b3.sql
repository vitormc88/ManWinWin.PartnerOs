REVOKE EXECUTE ON FUNCTION public.academy_cert_default_settings() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.academy_cert_settings_error(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.academy_cert_settings_guard() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.academy_cert_settings(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.academy_cert_blueprint_ok(uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.academy_cert_blueprint_ok(uuid[], jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.academy_cert_select_questions(uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.academy_cert_answer(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_cert_state(uuid) TO authenticated;