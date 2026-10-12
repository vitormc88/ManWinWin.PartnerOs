-- FIN02 exact TEST policy definitions extracted read-only from pg_policies on 2026-10-11.
-- NOT EXECUTED in current financial-column lab: needs actual auth/partner/helper routines.
-- DO NOT install in PROD or apply to TEST: reference only for future Gate-2 private restore.
-- 36 policies across eight financial tables, including six RESTRICTIVE probationary policies.

CREATE POLICY "clients_delete" ON public."clients" AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'hq_admin'::app_role));

CREATE POLICY "clients_insert" ON public."clients" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))));

CREATE POLICY "clients_select" ON public."clients" AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_client(id));

CREATE POLICY "clients_update" ON public."clients" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))))
  WITH CHECK ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))));

CREATE POLICY "pg_probationary_denied" ON public."clients" AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT pg_is_probationary_partner()))
  WITH CHECK ((NOT pg_is_probationary_partner()));

CREATE POLICY "contract_lines_manage" ON public."contract_lines" AS PERMISSIVE FOR ALL TO authenticated
  USING (can_manage_client(client_id))
  WITH CHECK (can_manage_client(client_id));

CREATE POLICY "contract_lines_view" ON public."contract_lines" AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_client(client_id));

CREATE POLICY "contracts_delete" ON public."contracts" AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'hq_admin'::app_role));

CREATE POLICY "contracts_insert" ON public."contracts" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = contracts.client_id) AND (c.partner_id IS NOT NULL) AND ((c.partner_id)::uuid = get_user_partner_id(auth.uid())))))));

CREATE POLICY "contracts_select" ON public."contracts" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = contracts.client_id) AND (c.partner_id IS NOT NULL) AND can_view_partner((c.partner_id)::uuid))))));

CREATE POLICY "contracts_update" ON public."contracts" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = contracts.client_id) AND (c.partner_id IS NOT NULL) AND ((c.partner_id)::uuid = get_user_partner_id(auth.uid())))))))
  WITH CHECK ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = contracts.client_id) AND (c.partner_id IS NOT NULL) AND ((c.partner_id)::uuid = get_user_partner_id(auth.uid())))))));

CREATE POLICY "deals_delete" ON public."deals" AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'hq_admin'::app_role));

CREATE POLICY "deals_insert" ON public."deals" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))));

CREATE POLICY "deals_select" ON public."deals" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND can_view_partner((partner_id)::uuid))));

CREATE POLICY "deals_update" ON public."deals" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))))
  WITH CHECK ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))));

CREATE POLICY "pg_probationary_denied" ON public."deals" AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT pg_is_probationary_partner()))
  WITH CHECK ((NOT pg_is_probationary_partner()));

CREATE POLICY "licenses_delete" ON public."licenses" AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'hq_admin'::app_role));

CREATE POLICY "licenses_insert" ON public."licenses" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = licenses.client_id) AND (c.partner_id IS NOT NULL) AND ((c.partner_id)::uuid = get_user_partner_id(auth.uid())))))));

CREATE POLICY "licenses_select" ON public."licenses" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = licenses.client_id) AND (c.partner_id IS NOT NULL) AND can_view_partner((c.partner_id)::uuid))))));

CREATE POLICY "licenses_update" ON public."licenses" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = licenses.client_id) AND (c.partner_id IS NOT NULL) AND ((c.partner_id)::uuid = get_user_partner_id(auth.uid())))))))
  WITH CHECK ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = licenses.client_id) AND (c.partner_id IS NOT NULL) AND ((c.partner_id)::uuid = get_user_partner_id(auth.uid())))))));

CREATE POLICY "pg_probationary_denied" ON public."licenses" AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT pg_is_probationary_partner()))
  WITH CHECK ((NOT pg_is_probationary_partner()));

CREATE POLICY "pg_probationary_denied" ON public."proposal_items" AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT pg_is_probationary_partner()))
  WITH CHECK ((NOT pg_is_probationary_partner()));

CREATE POLICY "proposal_items_delete" ON public."proposal_items" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_items.proposal_id) AND can_manage_proposal_source(p.source_type, p.deal_id, p.renewal_id, p.client_id, p.partner_uuid)))));

CREATE POLICY "proposal_items_insert" ON public."proposal_items" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_items.proposal_id) AND can_manage_proposal_source(p.source_type, p.deal_id, p.renewal_id, p.client_id, p.partner_uuid)))));

CREATE POLICY "proposal_items_select" ON public."proposal_items" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_items.proposal_id) AND can_view_proposal_source(p.source_type, p.deal_id, p.renewal_id, p.client_id, p.partner_uuid)))));

CREATE POLICY "proposal_items_update" ON public."proposal_items" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_items.proposal_id) AND can_manage_proposal_source(p.source_type, p.deal_id, p.renewal_id, p.client_id, p.partner_uuid)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_items.proposal_id) AND can_manage_proposal_source(p.source_type, p.deal_id, p.renewal_id, p.client_id, p.partner_uuid)))));

CREATE POLICY "pg_probationary_denied" ON public."proposals" AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT pg_is_probationary_partner()))
  WITH CHECK ((NOT pg_is_probationary_partner()));

CREATE POLICY "proposals_delete" ON public."proposals" AS PERMISSIVE FOR DELETE TO authenticated
  USING (can_manage_proposal_source(source_type, deal_id, renewal_id, client_id, partner_uuid));

CREATE POLICY "proposals_insert" ON public."proposals" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((can_manage_proposal_source(source_type, deal_id, renewal_id, client_id, partner_uuid) AND ((created_by IS NULL) OR (created_by = auth.uid()))));

CREATE POLICY "proposals_select" ON public."proposals" AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_proposal_source(source_type, deal_id, renewal_id, client_id, partner_uuid));

CREATE POLICY "proposals_update" ON public."proposals" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (can_manage_proposal_source(source_type, deal_id, renewal_id, client_id, partner_uuid))
  WITH CHECK (can_manage_proposal_source(source_type, deal_id, renewal_id, client_id, partner_uuid));

CREATE POLICY "pg_probationary_denied" ON public."renewals" AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT pg_is_probationary_partner()))
  WITH CHECK ((NOT pg_is_probationary_partner()));

CREATE POLICY "renewals_delete" ON public."renewals" AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'hq_admin'::app_role));

CREATE POLICY "renewals_insert" ON public."renewals" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))));

CREATE POLICY "renewals_select" ON public."renewals" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND can_view_partner((partner_id)::uuid))));

CREATE POLICY "renewals_update" ON public."renewals" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))))
  WITH CHECK ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))));
