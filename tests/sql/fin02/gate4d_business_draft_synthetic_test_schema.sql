-- FIN01/FIN02 Gate4D synthetic-only PostgreSQL 17 authorization and Draft schema.
-- Required-column approximation of TEST, NOT a restored complete TEST schema.
CREATE SCHEMA auth;
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
 SET search_path TO '' AS $$
 SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.deals(
 id uuid PRIMARY KEY, partner_id uuid, owner_id uuid NOT NULL
);
CREATE TABLE public.clients(
 id uuid PRIMARY KEY, partner_uuid uuid, owner_id uuid NOT NULL
);
CREATE TABLE public.proposals(
 id uuid PRIMARY KEY,
 source_type text NOT NULL CHECK(source_type IN ('deal','client')),
 deal_id uuid REFERENCES public.deals(id),
 client_id uuid REFERENCES public.clients(id),
 partner_uuid uuid,
 client_name text NOT NULL,
 product_family text NOT NULL DEFAULT 'Business',
 proposal_mode text NOT NULL,
 status text NOT NULL DEFAULT 'Draft',
 total_year_1 numeric(14,2) NOT NULL DEFAULT 0,
 total_recurring numeric(14,2) NOT NULL DEFAULT 0,
 discount_amount numeric(14,2) NOT NULL DEFAULT 0,
 business_config jsonb,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (source_type='deal' AND deal_id IS NOT NULL AND client_id IS NULL
    OR source_type='client' AND client_id IS NOT NULL AND deal_id IS NULL)
);
CREATE TABLE public.proposal_items(
 id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
 proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
 category text NOT NULL DEFAULT 'software',
 item_code text,
 item_name text NOT NULL,
 qty numeric NOT NULL DEFAULT 1,
 unit_price numeric NOT NULL DEFAULT 0,
 frequency text NOT NULL DEFAULT 'one-time',
 total numeric NOT NULL DEFAULT 0,
 discount_type text NOT NULL DEFAULT 'none',
 discount_value numeric NOT NULL DEFAULT 0,
 gross_total numeric(14,2) NOT NULL DEFAULT 0,
 discount_amount numeric(14,2) NOT NULL DEFAULT 0,
 net_total numeric(14,2) NOT NULL DEFAULT 0,
 is_recurring boolean NOT NULL DEFAULT false,
 apply_discount_to_renewal boolean NOT NULL DEFAULT false,
 sort_order integer NOT NULL DEFAULT 0,
 UNIQUE(proposal_id,sort_order)
);
CREATE FUNCTION public.can_manage_proposal_source(
 _source_type text,_deal_id uuid,_renewal_id uuid,_client_id uuid,_partner uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT auth.uid() IS NOT NULL AND CASE
   WHEN _source_type='deal' THEN EXISTS(
     SELECT 1 FROM public.deals d WHERE d.id=_deal_id AND d.owner_id=auth.uid()
       AND d.partner_id IS NOT DISTINCT FROM _partner)
   WHEN _source_type='client' THEN EXISTS(
     SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.owner_id=auth.uid()
       AND c.partner_uuid IS NOT DISTINCT FROM _partner)
   ELSE false
 END;
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_proposal_source(text,uuid,uuid,uuid,uuid)
 TO authenticated;
CREATE FUNCTION public.can_view_proposal_source(
 _source_type text,_deal_id uuid,_renewal_id uuid,_client_id uuid,_partner uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT public.can_manage_proposal_source(_source_type,_deal_id,_renewal_id,_client_id,_partner);
$$;
GRANT EXECUTE ON FUNCTION public.can_view_proposal_source(text,uuid,uuid,uuid,uuid) TO authenticated;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.deals,public.clients TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.proposals,public.proposal_items TO authenticated;
CREATE POLICY proposals_select ON public.proposals FOR SELECT TO authenticated
 USING(public.can_view_proposal_source(source_type,deal_id,NULL::uuid,client_id,partner_uuid));
CREATE POLICY proposals_insert ON public.proposals FOR INSERT TO authenticated
 WITH CHECK(public.can_manage_proposal_source(source_type,deal_id,NULL::uuid,client_id,partner_uuid)
            AND created_by=auth.uid());
CREATE POLICY proposals_update ON public.proposals FOR UPDATE TO authenticated
 USING(public.can_manage_proposal_source(source_type,deal_id,NULL::uuid,client_id,partner_uuid))
 WITH CHECK(public.can_manage_proposal_source(source_type,deal_id,NULL::uuid,client_id,partner_uuid));
CREATE POLICY proposal_items_select ON public.proposal_items FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.proposals p WHERE p.id=proposal_id
  AND public.can_view_proposal_source(p.source_type,p.deal_id,NULL::uuid,p.client_id,p.partner_uuid)));
CREATE POLICY proposal_items_insert ON public.proposal_items FOR INSERT TO authenticated
 WITH CHECK(EXISTS(SELECT 1 FROM public.proposals p WHERE p.id=proposal_id
  AND public.can_manage_proposal_source(p.source_type,p.deal_id,NULL::uuid,p.client_id,p.partner_uuid)));
CREATE POLICY proposal_items_delete ON public.proposal_items FOR DELETE TO authenticated
 USING(EXISTS(SELECT 1 FROM public.proposals p WHERE p.id=proposal_id
  AND public.can_manage_proposal_source(p.source_type,p.deal_id,NULL::uuid,p.client_id,p.partner_uuid)));

-- Synthetic participants only, no data from Lovable TEST.
INSERT INTO public.deals(id,partner_id,owner_id) VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000301'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000302');
INSERT INTO public.clients(id,partner_uuid,owner_id) VALUES
 ('00000000-0000-4000-8000-000000000111','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000301');
-- Test-only injected line failure after the RPC header UPDATE/DELETE, showing
-- the entire RPC fails atomically. Not part of the candidate itself.
CREATE FUNCTION public.gate4d_fail_line_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.item_code='INJECT_AFTER_DELETE' THEN
  RAISE EXCEPTION 'LAB_INJECTED_LINE_INSERT_FAILURE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gate4d_fail_line_insert BEFORE INSERT ON public.proposal_items
 FOR EACH ROW EXECUTE FUNCTION public.gate4d_fail_line_insert();
-- Data builders used by the synthetic SQL verification only.
CREATE FUNCTION public.gate4d_payload(_source_type text DEFAULT 'deal',
 _source uuid DEFAULT '00000000-0000-4000-8000-000000000101',
 _partner uuid DEFAULT '00000000-0000-4000-8000-000000000201',
 _name text DEFAULT 'Fictional Thai Union Quote',
 _recurring numeric DEFAULT 570)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('source_type',_source_type,
  'deal_id',CASE WHEN _source_type='deal' THEN _source END,
  'client_id',CASE WHEN _source_type='client' THEN _source END,
  'partner_uuid',_partner,'client_name',_name,'product_family','Business',
  'proposal_mode','keepit_only','total_year_1',1608,
  'total_recurring',_recurring,'discount_amount',12,
  'business_config',jsonb_build_object('discounts',
   jsonb_build_object('webUsersPct',3,'webUsersRenews',_recurring=558)));
$$;
CREATE FUNCTION public.gate4d_items(_web_renews boolean DEFAULT false,
 _inject_failure boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_array(
  jsonb_build_object('sort_order',0,'item_code','SOFTWARE','item_name','Business Software',
   'category','software','gross_total',1000,'net_total',1000,'discount_amount',0,
   'is_recurring',false,'apply_discount_to_renewal',false),
  jsonb_build_object('sort_order',1,'item_code',
   CASE WHEN _inject_failure THEN 'INJECT_AFTER_DELETE' ELSE 'WEB' END,
   'item_name','Web recurring','category','addon','gross_total',400,'net_total',388,
   'discount_amount',12,'is_recurring',true,'apply_discount_to_renewal',_web_renews),
  jsonb_build_object('sort_order',2,'item_code','SAT','item_name','Gross-based S&TA 17%',
   'gross_total',170,'net_total',170,'discount_amount',0,
   'is_recurring',true,'apply_discount_to_renewal',false),
  jsonb_build_object('sort_order',3,'item_code','IMPLEMENTATION','item_name','One-time setup',
   'gross_total',50,'net_total',50,'discount_amount',0,
   'is_recurring',false,'apply_discount_to_renewal',false));
$$;
