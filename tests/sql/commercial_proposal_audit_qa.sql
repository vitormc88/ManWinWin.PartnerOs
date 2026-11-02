-- Create a fresh LOCAL synthetic database before running. Never run against TEST/PROD.
\set ON_ERROR_STOP on
\ir commercial_addition_lifecycle_qa.sql
\ir commercial_addition_simple_editor.sql
\ir ../../supabase/migrations/20261102110325_commercial_proposal_audit_guards.sql
\ir ../../supabase/migrations/20261102110848_commercial_service_payment_wording.sql
\ir commercial_proposal_audit_guards.sql
