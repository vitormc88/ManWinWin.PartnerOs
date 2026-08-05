
-- Partner Academy (iteration 1): additive content + progress model.

CREATE OR REPLACE FUNCTION public.is_academy_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'hq_admin'::app_role)
      OR public.can_admin_module(auth.uid(), 'onboarding')
$$;

-- ── Phases ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_phases TO authenticated;
GRANT ALL ON public.academy_phases TO service_role;
ALTER TABLE public.academy_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academy_phases_read_published" ON public.academy_phases
  FOR SELECT TO authenticated USING (status = 'published' OR public.is_academy_admin());
CREATE POLICY "academy_phases_admin_write" ON public.academy_phases
  FOR ALL TO authenticated USING (public.is_academy_admin()) WITH CHECK (public.is_academy_admin());
CREATE TRIGGER academy_phases_set_updated_at BEFORE UPDATE ON public.academy_phases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Modules ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid REFERENCES public.academy_phases(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  short_description text,
  full_description text,
  estimated_duration_minutes integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version integer NOT NULL DEFAULT 1,
  -- reserved for a later certification iteration
  certification_enabled boolean NOT NULL DEFAULT false,
  certification_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_modules TO authenticated;
GRANT ALL ON public.academy_modules TO service_role;
ALTER TABLE public.academy_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academy_modules_read_published" ON public.academy_modules
  FOR SELECT TO authenticated USING (status = 'published' OR public.is_academy_admin());
CREATE POLICY "academy_modules_admin_write" ON public.academy_modules
  FOR ALL TO authenticated USING (public.is_academy_admin()) WITH CHECK (public.is_academy_admin());
CREATE TRIGGER academy_modules_set_updated_at BEFORE UPDATE ON public.academy_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS academy_modules_phase_idx ON public.academy_modules(phase_id, sort_order);

-- ── Missions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.academy_modules(id) ON DELETE CASCADE,
  mission_number integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  slug text NOT NULL,
  short_description text,
  estimated_duration_minutes integer NOT NULL DEFAULT 0,
  content_markdown text,
  content_json jsonb,
  item_kind text NOT NULL DEFAULT 'mission'
    CHECK (item_kind IN ('intro','mission','exercise','summary','checklist','certification')),
  is_locked boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_missions TO authenticated;
GRANT ALL ON public.academy_missions TO service_role;
ALTER TABLE public.academy_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academy_missions_read_published" ON public.academy_missions
  FOR SELECT TO authenticated USING (status = 'published' OR public.is_academy_admin());
CREATE POLICY "academy_missions_admin_write" ON public.academy_missions
  FOR ALL TO authenticated USING (public.is_academy_admin()) WITH CHECK (public.is_academy_admin());
CREATE TRIGGER academy_missions_set_updated_at BEFORE UPDATE ON public.academy_missions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS academy_missions_module_idx ON public.academy_missions(module_id, sort_order);

-- ── Resources ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid REFERENCES public.academy_modules(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES public.academy_missions(id) ON DELETE CASCADE,
  title text NOT NULL,
  resource_type text NOT NULL DEFAULT 'link'
    CHECK (resource_type IN ('link','file','markdown','template','checklist')),
  content text,
  file_path text,
  is_downloadable boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academy_resources_parent_required CHECK (module_id IS NOT NULL OR mission_id IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_resources TO authenticated;
GRANT ALL ON public.academy_resources TO service_role;
ALTER TABLE public.academy_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academy_resources_read_published" ON public.academy_resources
  FOR SELECT TO authenticated USING (status = 'published' OR public.is_academy_admin());
CREATE POLICY "academy_resources_admin_write" ON public.academy_resources
  FOR ALL TO authenticated USING (public.is_academy_admin()) WITH CHECK (public.is_academy_admin());
CREATE TRIGGER academy_resources_set_updated_at BEFORE UPDATE ON public.academy_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Per-user progress ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_module_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  module_id uuid NOT NULL REFERENCES public.academy_modules(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','ready_for_certification','certification_failed','certified')),
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_module_progress TO authenticated;
GRANT ALL ON public.academy_module_progress TO service_role;
ALTER TABLE public.academy_module_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academy_module_progress_own" ON public.academy_module_progress
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER academy_module_progress_set_updated_at BEFORE UPDATE ON public.academy_module_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.academy_mission_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  mission_id uuid NOT NULL REFERENCES public.academy_missions(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.academy_modules(id) ON DELETE CASCADE,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mission_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_mission_progress TO authenticated;
GRANT ALL ON public.academy_mission_progress TO service_role;
ALTER TABLE public.academy_mission_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academy_mission_progress_own" ON public.academy_mission_progress
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER academy_mission_progress_set_updated_at BEFORE UPDATE ON public.academy_mission_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
