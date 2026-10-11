-- Same file executed simultaneously in two distinct PostgreSQL sessions.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000003',true);
SELECT public.award_deal_proposal(
 '00000000-0000-4000-8000-000000000412',
 '00000000-0000-4000-8000-000000000514',
 NULL,
 '{"product_family":"Business","proposal_mode":"UseIT","license_type":"Business UseIT","license_model":"SaaS","hosting":"SaaS","initial_contract_value":200,"recurring_contract_value":200,"modules":[]}'::jsonb,
 '[{"source_item_id":"00000000-0000-4000-8000-000000000915","description":"UseIT SaaS Annual","amount":200,"billing_frequency":"annual","line_type":"license"}]'::jsonb,
 '2026-11-01',90
) AS award_response;
COMMIT;
