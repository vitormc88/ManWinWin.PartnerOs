-- Fix: is_hq_user should only return true for actual HQ users (hq_admin, hq_standard with is_hq=true)
-- partner_manager is a partner-level role and must NOT grant HQ-wide access
CREATE OR REPLACE FUNCTION public.is_hq_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('hq_admin', 'hq_standard')
      AND coalesce(p.is_hq, false) = true
  )
$$;