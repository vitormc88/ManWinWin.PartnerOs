-- Trigger functions are internal and do not require direct application RPC access.
REVOKE ALL ON FUNCTION public.phase1b_guard_client_hq_direct() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.phase1b_guard_revenue_partner() FROM anon, authenticated;
