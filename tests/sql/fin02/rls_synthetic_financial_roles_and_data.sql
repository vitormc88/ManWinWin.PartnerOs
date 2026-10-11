-- FIN02 Gate2B synthetic ONLY role/partner/finance fixtures.
-- Module-access levels were read-only captured from TEST role templates.
-- No real people, partners, clients, customer IDs or licensing data.
INSERT INTO public.partners(id,assigned_manager_id) VALUES
('00000000-0000-4000-8000-000000000101',NULL),
('00000000-0000-4000-8000-000000000102',NULL);

INSERT INTO public.profiles(id,partner_id,is_hq) VALUES
('00000000-0000-4000-8000-000000000001',NULL,true),
('00000000-0000-4000-8000-000000000002',NULL,true),
('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000101',false),
('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000101',false),
('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000102',false),
('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000101',false),
('00000000-0000-4000-8000-000000000007',NULL,true);

INSERT INTO public.user_roles(user_id,role) VALUES
('00000000-0000-4000-8000-000000000001','hq_admin'),
('00000000-0000-4000-8000-000000000002','hq_standard'),
('00000000-0000-4000-8000-000000000003','partner_admin'),
('00000000-0000-4000-8000-000000000004','partner_sales'),
('00000000-0000-4000-8000-000000000005','partner_admin'),
('00000000-0000-4000-8000-000000000006','partner_connector'),
('00000000-0000-4000-8000-000000000007','hq_standard');

-- TEST read-only captured defaults for clients and renewals.
INSERT INTO public.role_permission_templates(role,module_key,access_level) VALUES
 ('hq_admin'::public.app_role,'clients','admin'),
 ('hq_admin'::public.app_role,'renewals','admin'),
 ('hq_standard'::public.app_role,'clients','edit'),
 ('hq_standard'::public.app_role,'renewals','edit'),
 ('partner_admin'::public.app_role,'clients','edit'),
 ('partner_admin'::public.app_role,'renewals','view'),
 ('partner_connector'::public.app_role,'clients','no_access'),
 ('partner_connector'::public.app_role,'renewals','no_access'),
 ('partner_implementer_trainee'::public.app_role,'clients','no_access'),
 ('partner_implementer_trainee'::public.app_role,'renewals','no_access'),
 ('partner_manager'::public.app_role,'clients','edit'),
 ('partner_manager'::public.app_role,'renewals','view'),
 ('partner_reseller_trainee'::public.app_role,'clients','no_access'),
 ('partner_reseller_trainee'::public.app_role,'renewals','no_access'),
 ('partner_restricted'::public.app_role,'clients','view'),
 ('partner_restricted'::public.app_role,'renewals','no_access'),
 ('partner_sales'::public.app_role,'clients','view'),
 ('partner_sales'::public.app_role,'renewals','no_access');

-- Synthetic permission override: an HQ Standard explicitly downgraded from
-- clients:edit template to clients:view effective access. This exercises the
-- real TEST get_effective_permissions() override precedence.
INSERT INTO public.user_module_permissions(user_id,module_key,access_level,is_override)
VALUES ('00000000-0000-4000-8000-000000000007','clients','view',true);

-- Synthetic finance graph; credentials, tokens and actual customer records absent.
INSERT INTO public.clients(id,client_code,commercial_name,partner_id,partner_uuid) VALUES
('00000000-0000-4000-8000-000000000301','LAB_CLIENT_A','Synthetic A','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101'),
('00000000-0000-4000-8000-000000000302','LAB_CLIENT_B','Synthetic B','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000102');

INSERT INTO public.deals(id,company_name,stage,partner_id) VALUES
('00000000-0000-4000-8000-000000000401','Synthetic Deal A','Proposal','00000000-0000-4000-8000-000000000101'),
('00000000-0000-4000-8000-000000000402','Synthetic Deal B','Proposal','00000000-0000-4000-8000-000000000102');

INSERT INTO public.proposals(id,client_name,source_type,deal_id,partner_uuid,product_family,proposal_mode,status) VALUES
('00000000-0000-4000-8000-000000000501','Synthetic A','deal','00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000101','Business','keepit_only','Ready'),
('00000000-0000-4000-8000-000000000502','Synthetic B','deal','00000000-0000-4000-8000-000000000402','00000000-0000-4000-8000-000000000102','Business','keepit_only','Ready');

INSERT INTO public.proposal_items(id,proposal_id,item_name) VALUES
('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000501','Synthetic module A'),
('00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000502','Synthetic module B');

INSERT INTO public.contracts(id,client_id) VALUES
('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000301'),
('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000302');

INSERT INTO public.contract_lines(id,contract_id,client_id,line_type,description,amount) VALUES
('00000000-0000-4000-8000-000000000701','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000301','module','Synthetic A',100),
('00000000-0000-4000-8000-000000000702','00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000302','module','Synthetic B',100);

INSERT INTO public.licenses(id,client_id,contract_id) VALUES
('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000201'),
('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000202');

INSERT INTO public.renewals(id,client_id,contract_id,license_id,partner_id,partner_uuid) VALUES
('00000000-0000-4000-8000-000000000601','00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101'),
('00000000-0000-4000-8000-000000000602','00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000102');
