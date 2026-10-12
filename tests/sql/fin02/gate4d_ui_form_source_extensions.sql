-- Gate4D-v2: add TEST-equivalent source/deal safety references to catalog overlay.
-- Must run AFTER gate4d_ui_test_catalog_columns.sql in DISPOSABLE PostgreSQL.
ALTER TABLE public.deals ADD COLUMN expected_value numeric NOT NULL DEFAULT 0;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
GRANT SELECT,UPDATE ON public.deals TO authenticated;
CREATE POLICY gate4d_deal_read ON public.deals FOR SELECT TO authenticated
 USING(owner_id=auth.uid());
CREATE POLICY gate4d_deal_write ON public.deals FOR UPDATE TO authenticated
 USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
CREATE TABLE public.contracts(id uuid PRIMARY KEY,client_id uuid NOT NULL REFERENCES public.clients(id));
CREATE TABLE public.licenses(id uuid PRIMARY KEY,client_id uuid NOT NULL REFERENCES public.clients(id));
GRANT SELECT ON public.contracts,public.licenses TO authenticated;
INSERT INTO public.contracts(id,client_id) VALUES
 ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000111');
INSERT INTO public.licenses(id,client_id) VALUES
 ('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000111');
-- The source schema uses text legacy deals.partner_id and canonical
-- proposals.partner_uuid UUID. Here the original mini-fixture's deal
-- partner_id UUID represents the same two owners only; no source data copied.

-- Exact TEST-style per-proposal source scope for UPDATE of proposal_items.
-- A missing policy silently filters matched rows for SECURITY INVOKER!
CREATE POLICY proposal_items_update ON public.proposal_items FOR UPDATE TO authenticated
 USING(EXISTS(SELECT 1 FROM public.proposals p WHERE p.id=proposal_id
  AND public.can_manage_proposal_source(p.source_type,p.deal_id,NULL::uuid,p.client_id,p.partner_uuid)))
 WITH CHECK(EXISTS(SELECT 1 FROM public.proposals p WHERE p.id=proposal_id
  AND public.can_manage_proposal_source(p.source_type,p.deal_id,NULL::uuid,p.client_id,p.partner_uuid)));
