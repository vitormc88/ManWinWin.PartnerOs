-- Synthetic standalone deals to test two simultaneous first awards and
-- a forced late-stage transactional exception.
INSERT INTO public.deals(id,partner_id,company_name,country,stage,status)
VALUES
('00000000-0000-4000-8000-000000000412','00000000-0000-4000-8000-000000000101',
 'FIN02 Concurrent Synthetic','PT','Proposal','Open'),
('00000000-0000-4000-8000-000000000413','00000000-0000-4000-8000-000000000101',
 'FIN02 Rollback Synthetic','PT','Proposal','Open');

INSERT INTO public.proposals
 (id,client_name,source_type,deal_id,partner_uuid,product_family,proposal_mode,
  license_model,status,total_year_1,total_recurring,discount_amount)
VALUES
('00000000-0000-4000-8000-000000000514','FIN02 Concurrent Synthetic',
 'deal','00000000-0000-4000-8000-000000000412',
 '00000000-0000-4000-8000-000000000101','Business','useit_only','SaaS','Ready',200,200,0),
('00000000-0000-4000-8000-000000000515','FIN02 Rollback Synthetic',
 'deal','00000000-0000-4000-8000-000000000413',
 '00000000-0000-4000-8000-000000000101','Business','useit_only','SaaS','Ready',200,200,0);

INSERT INTO public.proposal_items
 (id,proposal_id,item_name,category,line_type,frequency,
  is_recurring,gross_total,discount_amount,net_total,total,
  apply_discount_to_renewal,qty,unit_price)
VALUES
('00000000-0000-4000-8000-000000000915',
 '00000000-0000-4000-8000-000000000514',
 'UseIT SaaS Annual','software','license','annual',true,200,0,200,200,true,1,200),
('00000000-0000-4000-8000-000000000916',
 '00000000-0000-4000-8000-000000000515',
 'UseIT SaaS Annual','software','license','annual',true,200,0,200,200,true,1,200);
