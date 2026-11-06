-- Sales Sprint 1 removable synthetic Direct fixtures (draft only). Seller A = existing draft user demo@example.com.
-- No Seller B fixture: no second eligible HQ Sales identity exists and identities may not be created.
-- Cleanup: db/fixtures/sales_sprint1_direct_cleanup.sql
INSERT INTO public.deals (id, company_name, stage, status, probability, expected_value, sales_engine, assigned_user_id, description)
VALUES
 ('0e000000-0000-4000-8000-000000000101','QA Direct — Seller A — Open Lead','Open Lead','Open',5,12000,'new_business','00000000-0000-4000-8000-000000000001','Synthetic Sales S1 fixture'),
 ('0e000000-0000-4000-8000-000000000102','QA Direct — Seller A — Qualified','Qualified','Open',20,18000,'new_business','00000000-0000-4000-8000-000000000001','Synthetic Sales S1 fixture'),
 ('0e000000-0000-4000-8000-000000000103','QA Direct — Seller A — Demo','Demo','Open',40,24000,'new_business','00000000-0000-4000-8000-000000000001','Synthetic Sales S1 fixture'),
 ('0e000000-0000-4000-8000-000000000104','QA Direct — Seller A — Proposal Sent','Proposal Sent','Open',60,30000,'new_business','00000000-0000-4000-8000-000000000001','Synthetic Sales S1 fixture'),
 ('0e000000-0000-4000-8000-000000000105','QA Direct — Seller A — Price Negotiation','Price Negotiation','Open',90,36000,'new_business','00000000-0000-4000-8000-000000000001','Synthetic Sales S1 fixture')
ON CONFLICT (id) DO NOTHING;
-- This draft's permission templates are empty; per-user 'sales' overrides only resolve when a template row exists.
INSERT INTO public.role_permission_templates (role, module_key, access_level)
SELECT 'hq_standard','sales','no_access' WHERE NOT EXISTS (SELECT 1 FROM public.role_permission_templates WHERE role='hq_standard' AND module_key='sales');
