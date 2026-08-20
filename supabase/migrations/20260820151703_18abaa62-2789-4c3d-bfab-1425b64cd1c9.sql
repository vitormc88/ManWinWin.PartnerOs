GRANT EXECUTE ON FUNCTION public.academy_answer_is_correct(text, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.academy_resolve_option(jsonb, jsonb) TO service_role;