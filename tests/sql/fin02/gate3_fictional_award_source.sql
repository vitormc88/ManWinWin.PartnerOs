-- Gate 3: completely fictional Business KeepIT proposal.
-- Perpetual software (€1000) and one-time implementation (€50);
-- recurring Web list €400 less 3% FIRST YEAR ONLY (€388),
-- recurring S&TA 17% of GROSS €1000 (= €170).
-- Year1 1608, next recurring 570. No Academy/customer rows.
INSERT INTO public.deals
 (id,partner_id,company_name,country,stage,status)
VALUES ('00000000-0000-4000-8000-000000000411',
        '00000000-0000-4000-8000-000000000101',
        'FIN02 Gate3 Fictional Manufacturing','PT','Proposal','Open');

INSERT INTO public.proposals
 (id,client_name,source_type,deal_id,partner_uuid,product_family,
  proposal_mode,license_model,status,version,total_year_1,total_recurring,discount_amount)
VALUES ('00000000-0000-4000-8000-000000000511',
        'FIN02 Gate3 Fictional Manufacturing','deal',
        '00000000-0000-4000-8000-000000000411',
        '00000000-0000-4000-8000-000000000101',
        'Business','keepit_only','Perpetual','Ready',1,1608,570,12);

INSERT INTO public.proposal_items
  (id,proposal_id,item_name,category,line_type,qty,unit_price,frequency,
  is_recurring,gross_total,discount_amount,net_total,total,apply_discount_to_renewal,sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000911',
   '00000000-0000-4000-8000-000000000511','Core License',
   'software','license',1,1000,'one-time',false,1000,0,1000,1000,false,1),
  ('00000000-0000-4000-8000-000000000912',
   '00000000-0000-4000-8000-000000000511','Web Access',
   'software','mww_web',1,400,'annual',true,400,12,388,388,false,2),
  ('00000000-0000-4000-8000-000000000913',
   '00000000-0000-4000-8000-000000000511','S&TA',
   'software','sat',1,170,'annual',true,170,0,170,170,true,3),
  ('00000000-0000-4000-8000-000000000914',
   '00000000-0000-4000-8000-000000000511','Implementation',
   'services','implementation',1,50,'one-time',false,50,0,50,50,false,4);
