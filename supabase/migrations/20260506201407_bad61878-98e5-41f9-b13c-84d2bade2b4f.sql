-- Clear all legacy overrides created during the RBAC migration.
-- Role templates are now the source of truth; admins can re-add specific overrides via the UI.
DELETE FROM public.user_module_permissions;