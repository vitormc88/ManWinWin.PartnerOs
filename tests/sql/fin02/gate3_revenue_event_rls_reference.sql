-- Exact 2026-10-11 TEST Revenue/Activities/Lifecycle RLS source predicates.

-- This is a standalone sandbox fixture; no live TEST/PROD writes.

GRANT SELECT ON public.client_revenue_history,public.lifecycle_events,public.renewal_activities TO authenticated;

ALTER TABLE public."client_revenue_history" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."lifecycle_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."renewal_activities" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pg_probationary_denied" ON public."client_revenue_history" AS RESTRICTIVE FOR ALL TO authenticated
USING ((NOT pg_is_probationary_partner()))
WITH CHECK ((NOT pg_is_probationary_partner()));

CREATE POLICY "revenue_delete" ON public."client_revenue_history" AS PERMISSIVE FOR DELETE TO authenticated
USING (is_hq_user(auth.uid()));

CREATE POLICY "revenue_insert" ON public."client_revenue_history" AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (is_hq_user(auth.uid()));

CREATE POLICY "revenue_select" ON public."client_revenue_history" AS PERMISSIVE FOR SELECT TO authenticated
USING (can_view_client(client_id));

CREATE POLICY "revenue_update" ON public."client_revenue_history" AS PERMISSIVE FOR UPDATE TO authenticated
USING (is_hq_user(auth.uid()))
WITH CHECK (is_hq_user(auth.uid()));

CREATE POLICY "lifecycle_events_delete" ON public."lifecycle_events" AS PERMISSIVE FOR DELETE TO authenticated
USING (is_hq_user(auth.uid()));

CREATE POLICY "lifecycle_events_insert" ON public."lifecycle_events" AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK ((is_hq_user(auth.uid()) OR ((client_id IS NOT NULL) AND can_manage_client(client_id))));

CREATE POLICY "lifecycle_events_select" ON public."lifecycle_events" AS PERMISSIVE FOR SELECT TO authenticated
USING ((is_hq_user(auth.uid()) OR ((client_id IS NOT NULL) AND can_view_client(client_id))));

CREATE POLICY "lifecycle_events_update" ON public."lifecycle_events" AS PERMISSIVE FOR UPDATE TO authenticated
USING (is_hq_user(auth.uid()))
WITH CHECK (is_hq_user(auth.uid()));

CREATE POLICY "pg_probationary_denied" ON public."renewal_activities" AS RESTRICTIVE FOR ALL TO authenticated
USING ((NOT pg_is_probationary_partner()))
WITH CHECK ((NOT pg_is_probationary_partner()));

CREATE POLICY "renewal_activities_delete" ON public."renewal_activities" AS PERMISSIVE FOR DELETE TO authenticated
USING ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM renewals r
  WHERE ((r.id = renewal_activities.renewal_id) AND (r.partner_id IS NOT NULL) AND ((r.partner_id)::uuid = get_user_partner_id(auth.uid())))))));

CREATE POLICY "renewal_activities_insert" ON public."renewal_activities" AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM renewals r
  WHERE ((r.id = renewal_activities.renewal_id) AND (r.partner_id IS NOT NULL) AND ((r.partner_id)::uuid = get_user_partner_id(auth.uid())))))));

CREATE POLICY "renewal_activities_select" ON public."renewal_activities" AS PERMISSIVE FOR SELECT TO authenticated
USING ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM renewals r
  WHERE ((r.id = renewal_activities.renewal_id) AND (r.partner_id IS NOT NULL) AND can_view_partner((r.partner_id)::uuid))))));

CREATE POLICY "renewal_activities_update" ON public."renewal_activities" AS PERMISSIVE FOR UPDATE TO authenticated
USING ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM renewals r
  WHERE ((r.id = renewal_activities.renewal_id) AND (r.partner_id IS NOT NULL) AND ((r.partner_id)::uuid = get_user_partner_id(auth.uid())))))))
WITH CHECK ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM renewals r
  WHERE ((r.id = renewal_activities.renewal_id) AND (r.partner_id IS NOT NULL) AND ((r.partner_id)::uuid = get_user_partner_id(auth.uid())))))));
