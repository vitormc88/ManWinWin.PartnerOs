-- =========================================
-- RBAC v2: Role permission templates + overrides
-- =========================================

-- 1. Safety backups (idempotent — only on first run)
CREATE TABLE IF NOT EXISTS public._backup_profiles_v1 AS TABLE public.profiles;
CREATE TABLE IF NOT EXISTS public._backup_user_roles_v1 AS TABLE public.user_roles;
CREATE TABLE IF NOT EXISTS public._backup_user_module_permissions_v1 AS TABLE public.user_module_permissions;
CREATE TABLE IF NOT EXISTS public._backup_partners_v1 AS TABLE public.partners;

-- 2. Add override flag to user_module_permissions (preserve all existing rows as overrides)
ALTER TABLE public.user_module_permissions
  ADD COLUMN IF NOT EXISTS is_override boolean NOT NULL DEFAULT true;

-- All existing explicit perms are treated as overrides — preserved as-is.
UPDATE public.user_module_permissions SET is_override = true WHERE is_override IS DISTINCT FROM true;

-- 3. Role permission templates table
CREATE TABLE IF NOT EXISTS public.role_permission_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  module_key text NOT NULL,
  access_level text NOT NULL DEFAULT 'no_access' CHECK (access_level IN ('no_access','view','edit','admin')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, module_key)
);

ALTER TABLE public.role_permission_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rpt_select ON public.role_permission_templates;
DROP POLICY IF EXISTS rpt_insert ON public.role_permission_templates;
DROP POLICY IF EXISTS rpt_update ON public.role_permission_templates;
DROP POLICY IF EXISTS rpt_delete ON public.role_permission_templates;

CREATE POLICY rpt_select ON public.role_permission_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY rpt_insert ON public.role_permission_templates FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'hq_admin'::app_role));
CREATE POLICY rpt_update ON public.role_permission_templates FOR UPDATE TO authenticated USING (has_role(auth.uid(),'hq_admin'::app_role)) WITH CHECK (has_role(auth.uid(),'hq_admin'::app_role));
CREATE POLICY rpt_delete ON public.role_permission_templates FOR DELETE TO authenticated USING (has_role(auth.uid(),'hq_admin'::app_role));

-- 4. Seed default matrix
-- Modules list
DO $$
DECLARE
  modules text[] := ARRAY[
    'dashboard','partners','clients','renewals','pipeline','incoming_leads',
    'deal_registrations','commissions','onboarding','certifications',
    'knowledge_base','training','announcements','community','notifications',
    'analytics','tiers','performance','settings','user_management'
  ];
  m text;
  defaults jsonb := jsonb_build_object(
    -- HQ Admin: admin everywhere
    'hq_admin', jsonb_build_object('__default','admin'),
    -- HQ Standard: edit operational, no user_management/settings
    'hq_standard', jsonb_build_object(
      '__default','edit',
      'user_management','no_access',
      'settings','view',
      'analytics','view'
    ),
    -- Partner Admin
    'partner_admin', jsonb_build_object(
      '__default','no_access',
      'dashboard','view',
      'pipeline','edit',
      'incoming_leads','view',
      'deal_registrations','edit',
      'clients','edit',
      'renewals','view',
      'commissions','view',
      'onboarding','view',
      'certifications','view',
      'knowledge_base','view',
      'training','view',
      'notifications','view'
    ),
    -- Partner Sales
    'partner_sales', jsonb_build_object(
      '__default','no_access',
      'dashboard','view',
      'pipeline','edit',
      'deal_registrations','edit',
      'incoming_leads','view',
      'clients','view',
      'knowledge_base','view',
      'training','view',
      'notifications','view'
    ),
    -- Partner Restricted (Read Only)
    'partner_restricted', jsonb_build_object(
      '__default','no_access',
      'dashboard','view',
      'pipeline','view',
      'clients','view',
      'knowledge_base','view',
      'training','view',
      'notifications','view'
    ),
    -- Partner Manager (deprecated → mirrors partner_admin)
    'partner_manager', jsonb_build_object(
      '__default','no_access',
      'dashboard','view',
      'pipeline','edit',
      'incoming_leads','view',
      'deal_registrations','edit',
      'clients','edit',
      'renewals','view',
      'commissions','view',
      'onboarding','view',
      'certifications','view',
      'knowledge_base','view',
      'training','view',
      'notifications','view'
    )
  );
  role_key text;
  role_cfg jsonb;
  level text;
BEGIN
  FOR role_key, role_cfg IN SELECT key, value FROM jsonb_each(defaults) LOOP
    FOREACH m IN ARRAY modules LOOP
      level := COALESCE(role_cfg->>m, role_cfg->>'__default', 'no_access');
      INSERT INTO public.role_permission_templates(role, module_key, access_level)
      VALUES (role_key::app_role, m, level)
      ON CONFLICT (role, module_key) DO NOTHING; -- preserve admin edits on re-run
    END LOOP;
  END LOOP;
END $$;

-- 5. Helper: rank access levels
CREATE OR REPLACE FUNCTION public.access_level_rank(_lvl text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _lvl
    WHEN 'admin' THEN 3
    WHEN 'edit' THEN 2
    WHEN 'view' THEN 1
    ELSE 0
  END
$$;

-- 6. Effective permissions for a user (override else max template across user's roles)
CREATE OR REPLACE FUNCTION public.get_effective_permissions(_user_id uuid)
RETURNS TABLE(module_key text, access_level text, is_override boolean, template_level text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH user_roles_x AS (
    SELECT role FROM user_roles WHERE user_id = _user_id
  ),
  template AS (
    SELECT rpt.module_key,
           (SELECT level FROM (
             SELECT access_level AS level, access_level_rank(access_level) AS r
             FROM role_permission_templates rpt2
             WHERE rpt2.module_key = rpt.module_key
               AND rpt2.role IN (SELECT role FROM user_roles_x)
             ORDER BY r DESC LIMIT 1
           ) t) AS template_level
    FROM role_permission_templates rpt
    GROUP BY rpt.module_key
  ),
  override AS (
    SELECT module_key, access_level
    FROM user_module_permissions
    WHERE user_id = _user_id AND is_override = true
  )
  SELECT
    t.module_key,
    COALESCE(o.access_level, t.template_level, 'no_access') AS access_level,
    (o.access_level IS NOT NULL) AS is_override,
    COALESCE(t.template_level, 'no_access') AS template_level
  FROM template t
  LEFT JOIN override o ON o.module_key = t.module_key;
$$;

-- 7. Convenience for current user
CREATE OR REPLACE FUNCTION public.get_my_effective_permissions()
RETURNS TABLE(module_key text, access_level text, is_override boolean, template_level text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.get_effective_permissions(auth.uid())
$$;

-- 8. Boolean helpers
CREATE OR REPLACE FUNCTION public.can_view_module(_user_id uuid, _module_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT access_level_rank(access_level) >= 1
  FROM public.get_effective_permissions(_user_id)
  WHERE module_key = _module_key
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_edit_module(_user_id uuid, _module_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT access_level_rank(access_level) >= 2
  FROM public.get_effective_permissions(_user_id)
  WHERE module_key = _module_key
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_admin_module(_user_id uuid, _module_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT access_level_rank(access_level) >= 3
  FROM public.get_effective_permissions(_user_id)
  WHERE module_key = _module_key
  LIMIT 1
$$;

-- 9. Reset a user to role template (deletes overrides)
CREATE OR REPLACE FUNCTION public.reset_user_to_role_template(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'hq_admin'::app_role) THEN
    RAISE EXCEPTION 'Only HQ Admin can reset user permissions';
  END IF;
  DELETE FROM user_module_permissions WHERE user_id = _user_id;
END $$;

-- 10. Apply template to a single user (no overrides created — purely informational
-- because effective perms now resolve via template when no override exists)
-- Provided for symmetry; a no-op once overrides are cleared.
CREATE OR REPLACE FUNCTION public.apply_role_template_to_user(_user_id uuid, _overwrite_overrides boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'hq_admin'::app_role) THEN
    RAISE EXCEPTION 'Only HQ Admin can apply role templates';
  END IF;
  IF _overwrite_overrides THEN
    DELETE FROM user_module_permissions WHERE user_id = _user_id;
  END IF;
END $$;

-- 11. Sync template to all users with a given role
CREATE OR REPLACE FUNCTION public.sync_role_template_to_users(_role app_role, _overwrite_overrides boolean DEFAULT false)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  affected int := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'hq_admin'::app_role) THEN
    RAISE EXCEPTION 'Only HQ Admin can sync role templates';
  END IF;
  IF _overwrite_overrides THEN
    DELETE FROM user_module_permissions
    WHERE user_id IN (SELECT user_id FROM user_roles WHERE role = _role);
    GET DIAGNOSTICS affected = ROW_COUNT;
  END IF;
  RETURN affected;
END $$;

-- 12. Tighten select RLS on role_permission_templates already done. Done.
