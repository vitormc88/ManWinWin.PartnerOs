
CREATE TABLE public.user_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  access_level text NOT NULL DEFAULT 'no_access',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_key)
);

ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perms_select" ON public.user_module_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'hq_admin'));

CREATE POLICY "perms_insert" ON public.user_module_permissions
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'hq_admin'));

CREATE POLICY "perms_update" ON public.user_module_permissions
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'hq_admin'))
  WITH CHECK (has_role(auth.uid(), 'hq_admin'));

CREATE POLICY "perms_delete" ON public.user_module_permissions
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'hq_admin'));

CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'hq_admin'))
  WITH CHECK (has_role(auth.uid(), 'hq_admin'));

CREATE POLICY "roles_update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'hq_admin'))
  WITH CHECK (has_role(auth.uid(), 'hq_admin'));
