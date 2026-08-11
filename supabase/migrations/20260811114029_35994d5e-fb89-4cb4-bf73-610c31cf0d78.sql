CREATE OR REPLACE FUNCTION public.renewal_line_type_for(_name text, _category text, _recurring boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(coalesce(_name,'')) ~ 's&at|support' THEN 'sat'
    WHEN lower(coalesce(_name,'')) ~ 'hosting|saas' THEN 'hosting'
    WHEN lower(coalesce(_name,'')) ~ 'web' THEN 'mww_web'
    WHEN lower(coalesce(_name,'')) ~ 'licen' THEN 'license'
    WHEN lower(coalesce(_name,'')) ~ 'module|módulo' THEN 'module'
    WHEN lower(coalesce(_name,'')) ~ 'plugin' THEN 'plugin'
    WHEN lower(coalesce(_name,'')) ~ 'implement' THEN 'implementation'
    WHEN lower(coalesce(_name,'')) ~ 'training|forma' THEN 'training'
    WHEN _recurring THEN 'license'
    ELSE 'other'
  END;
$$;