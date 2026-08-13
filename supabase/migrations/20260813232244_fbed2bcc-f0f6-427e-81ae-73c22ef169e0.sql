UPDATE public.proposal_items
   SET discount_type = 'percent',
       discount_value = 50,
       discount_amount = 825,
       net_total = 825
 WHERE sort_order = 2
   AND proposal_id IN (
     SELECT id FROM public.proposals
      WHERE client_id = '0c00aaaa-0000-4000-8000-00000000000a'
        AND project_name LIKE 'ZZVP0 upgrade%'
   );

INSERT INTO public.zzv_p0_results(step, passed, detail)
VALUES ('04b_fixture_line_discount', true, 'Implementation line carries percent 50 → net 825 (header impl_net unchanged at 825)')
ON CONFLICT (step) DO UPDATE SET detail = EXCLUDED.detail;