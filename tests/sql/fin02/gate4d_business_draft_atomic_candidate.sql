-- FIN01/FN02 Draft-save atomicity candidate — LAB ONLY, NOT A DEPLOYABLE MIGRATION.
-- Source-specific narrow Business deal/client Draft save shape; actual TEST has
-- more proposal columns, status guards and non-Business modes that require
-- an explicit compatibility/security review before any live implementation.
-- Security INVOKER: database caller's RLS/GRANTs still govern both tables.
-- One PostgreSQL FUNCTION CALL = one transaction; any line failure rolls back
-- preceding header UPDATE and DELETE of prior draft lines automatically.
CREATE OR REPLACE FUNCTION public.save_business_draft_atomic_candidate(
 _proposal_id uuid, _expected_updated_at timestamptz,
 _payload jsonb, _items jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
DECLARE
 _p public.proposals%ROWTYPE;
 _actor uuid := auth.uid();
 _source_type text;
 _deal uuid;
 _client uuid;
 _partner uuid;
 _name text;
 _mode text;
 _year1 numeric;
 _recurring numeric;
 _discount numeric;
 _s1 numeric;
 _s2 numeric;
 _sd numeric;
 _bad bigint;
 _n bigint;
 _unique_sort bigint;
 _old_found boolean := false;
BEGIN
 IF _actor IS NULL OR _proposal_id IS NULL THEN
  RAISE EXCEPTION 'DRAFT_AUTH_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF _payload IS NULL OR pg_catalog.jsonb_typeof(_payload)<>'object'
 OR _items IS NULL OR pg_catalog.jsonb_typeof(_items)<>'array'
 OR pg_catalog.jsonb_array_length(_items) NOT BETWEEN 1 AND 100
 OR (_payload - ARRAY['source_type','deal_id','client_id','partner_uuid',
                      'client_name','proposal_mode','product_family',
                      'total_year_1','total_recurring','discount_amount',
                      'business_config']::text[]) <> '{}'::jsonb THEN
  RAISE EXCEPTION 'DRAFT_INVALID_PAYLOAD' USING ERRCODE='22023';
 END IF;
 _source_type := _payload->>'source_type';
 _deal := NULLIF(_payload->>'deal_id','')::uuid;
 _client := NULLIF(_payload->>'client_id','')::uuid;
 _partner := NULLIF(_payload->>'partner_uuid','')::uuid;
 _name := pg_catalog.btrim(coalesce(_payload->>'client_name',''));
 _mode := _payload->>'proposal_mode';
 _year1 := (_payload->>'total_year_1')::numeric;
 _recurring := (_payload->>'total_recurring')::numeric;
 _discount := (_payload->>'discount_amount')::numeric;
 IF _payload->>'product_family' IS DISTINCT FROM 'Business'
 OR _mode NOT IN ('keepit_only','useit_only')
 OR _name='' OR _year1 IS NULL OR _recurring IS NULL OR _discount IS NULL
 OR _year1<0 OR _recurring<0 OR _discount<0
 OR (_source_type='deal' AND (_deal IS NULL OR _client IS NOT NULL))
 OR (_source_type='client' AND (_client IS NULL OR _deal IS NOT NULL))
 OR _source_type NOT IN ('deal','client') OR _source_type IS NULL
 OR coalesce(public.can_manage_proposal_source(_source_type,_deal,NULL::uuid,_client,_partner),false)=false
 THEN
  RAISE EXCEPTION 'DRAFT_INVALID_SOURCE_OR_SCOPE' USING ERRCODE='42501';
 END IF;
 -- Source+partner coherence belongs to the authorized canonical Deal/Client;
 -- this lab fixture supplies the matching helper. Real TEST permissions and
 -- helpers MUST be rechecked before a versioned migration is written.
 IF _source_type='deal' AND NOT EXISTS (
    SELECT 1 FROM public.deals d WHERE d.id=_deal
      AND d.partner_id IS NOT DISTINCT FROM _partner
 ) THEN
  RAISE EXCEPTION 'DRAFT_DEAL_PARTNER_MISMATCH' USING ERRCODE='42501';
 END IF;
 IF _source_type='client' AND NOT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id=_client
      AND c.partner_uuid IS NOT DISTINCT FROM _partner
 ) THEN
  RAISE EXCEPTION 'DRAFT_CLIENT_PARTNER_MISMATCH' USING ERRCODE='42501';
 END IF;
 SELECT count(*), count(DISTINCT sort_order),
        count(*) FILTER (WHERE
          item_name IS NULL OR pg_catalog.btrim(item_name)='' OR
          sort_order IS NULL OR gross_total IS NULL OR net_total IS NULL OR
          discount_amount IS NULL OR gross_total<0 OR net_total<0 OR
          discount_amount<0 OR
          pg_catalog.round(gross_total,2) <> pg_catalog.round(net_total+discount_amount,2)
          OR (apply_discount_to_renewal AND NOT is_recurring)
        ),
        coalesce(sum(pg_catalog.round(net_total,2)),0),
        coalesce(sum(CASE WHEN is_recurring THEN
          pg_catalog.round(CASE WHEN apply_discount_to_renewal THEN net_total ELSE gross_total END,2)
          ELSE 0 END),0),
        coalesce(sum(pg_catalog.round(discount_amount,2)),0)
  INTO _n,_unique_sort,_bad,_s1,_s2,_sd
 FROM pg_catalog.jsonb_to_recordset(_items) AS j(
  item_name text,sort_order int,gross_total numeric,net_total numeric,
  discount_amount numeric,is_recurring boolean,apply_discount_to_renewal boolean
 );
 IF _n=0 OR _unique_sort<>_n OR _bad>0
   OR pg_catalog.round(_year1,2)<>_s1
   OR pg_catalog.round(_recurring,2)<>_s2
   OR pg_catalog.round(_discount,2)<>_sd THEN
  RAISE EXCEPTION 'DRAFT_FINANCIAL_LINE_MISMATCH' USING ERRCODE='22023';
 END IF;
 -- Existing Draft serialization + explicit optimistic clock.
 SELECT * INTO _p FROM public.proposals
 WHERE id=_proposal_id FOR UPDATE;
 _old_found := FOUND;
 IF _old_found THEN
   IF _p.status<>'Draft' OR _p.product_family<>'Business'
   OR _p.source_type IS DISTINCT FROM _source_type
   OR _p.deal_id IS DISTINCT FROM _deal
   OR _p.client_id IS DISTINCT FROM _client
   OR _p.partner_uuid IS DISTINCT FROM _partner THEN
    RAISE EXCEPTION 'DRAFT_SOURCE_OR_STATUS_LOCKED' USING ERRCODE='42501';
   END IF;
   IF _expected_updated_at IS NULL
   OR _p.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'DRAFT_VERSION_CONFLICT' USING ERRCODE='40001';
   END IF;
   UPDATE public.proposals SET
     client_name=_name,proposal_mode=_mode,total_year_1=_year1,
     total_recurring=_recurring,discount_amount=_discount,
     business_config=_payload->'business_config',
     updated_at=pg_catalog.clock_timestamp()
   WHERE id=_proposal_id;
   DELETE FROM public.proposal_items WHERE proposal_id=_proposal_id;
 ELSE
   IF _expected_updated_at IS NOT NULL THEN
    RAISE EXCEPTION 'DRAFT_UNEXPECTED_EXPECTED_VERSION' USING ERRCODE='40001';
   END IF;
   INSERT INTO public.proposals(id,source_type,deal_id,client_id,partner_uuid,
      client_name,product_family,proposal_mode,status,total_year_1,
      total_recurring,discount_amount,business_config,created_by)
   VALUES(_proposal_id,_source_type,_deal,_client,_partner,
      _name,'Business',_mode,'Draft',_year1,_recurring,_discount,
      _payload->'business_config',_actor);
 END IF;
 INSERT INTO public.proposal_items(
  proposal_id,item_code,item_name,category,sort_order,qty,unit_price,
  frequency,total,discount_type,discount_value,gross_total,
  discount_amount,net_total,is_recurring,apply_discount_to_renewal)
 SELECT _proposal_id,j.item_code,j.item_name,
     coalesce(j.category,'software'),j.sort_order,coalesce(j.qty,1),
     coalesce(j.unit_price,0),coalesce(j.frequency,'one-time'),
     coalesce(j.total,j.gross_total),coalesce(j.discount_type,'none'),
     coalesce(j.discount_value,0),j.gross_total,j.discount_amount,j.net_total,
     coalesce(j.is_recurring,false),coalesce(j.apply_discount_to_renewal,false)
 FROM pg_catalog.jsonb_to_recordset(_items) AS j(
     item_code text,item_name text,category text,sort_order int,qty numeric,
     unit_price numeric,frequency text,total numeric,discount_type text,
     discount_value numeric,gross_total numeric,discount_amount numeric,
     net_total numeric,is_recurring boolean,apply_discount_to_renewal boolean)
 ORDER BY j.sort_order;
 RETURN _proposal_id;
END $$;
REVOKE ALL ON FUNCTION public.save_business_draft_atomic_candidate(uuid,timestamptz,jsonb,jsonb)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_business_draft_atomic_candidate(uuid,timestamptz,jsonb,jsonb)
 TO authenticated;
