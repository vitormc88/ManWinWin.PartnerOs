-- Sprint 4B.2 / 01 — Safe new probationary partner roles.
-- Run and COMMIT before the next migration: PostgreSQL enum values cannot
-- be used in statements in the same transaction that added them.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner_connector';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner_reseller_trainee';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner_implementer_trainee';
