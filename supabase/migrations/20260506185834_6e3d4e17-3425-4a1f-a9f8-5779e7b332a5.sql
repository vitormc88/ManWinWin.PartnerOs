ALTER TABLE public._backup_profiles_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_user_roles_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_user_module_permissions_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_partners_v1 ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anon/authenticated; superuser still reads.
ALTER FUNCTION public.access_level_rank(text) SET search_path = public;