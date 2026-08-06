CREATE TABLE IF NOT EXISTS public.academy_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key text NOT NULL UNIQUE,
  title text NOT NULL,
  asset_type text NOT NULL DEFAULT 'image',
  category text NOT NULL DEFAULT 'custom',
  tags text[] NOT NULL DEFAULT '{}',
  description text,
  alt_text text,
  caption text,
  file_path text,
  external_url text,
  mime_type text,
  file_size bigint,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.academy_asset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.academy_assets(id) ON DELETE CASCADE,
  version integer NOT NULL,
  file_path text,
  external_url text,
  mime_type text,
  file_size bigint,
  change_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, version)
);

CREATE INDEX IF NOT EXISTS academy_assets_status_idx ON public.academy_assets(status);
CREATE INDEX IF NOT EXISTS academy_asset_versions_asset_idx ON public.academy_asset_versions(asset_id, version DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_assets TO authenticated;
GRANT ALL ON public.academy_assets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_asset_versions TO authenticated;
GRANT ALL ON public.academy_asset_versions TO service_role;

ALTER TABLE public.academy_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_asset_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Academy users can view assets" ON public.academy_assets;
CREATE POLICY "Academy users can view assets"
ON public.academy_assets FOR SELECT TO authenticated
USING (public.can_access_academy());

DROP POLICY IF EXISTS "Academy admins manage assets" ON public.academy_assets;
CREATE POLICY "Academy admins manage assets"
ON public.academy_assets FOR ALL TO authenticated
USING (public.is_academy_admin())
WITH CHECK (public.is_academy_admin());

DROP POLICY IF EXISTS "Academy users can view asset versions" ON public.academy_asset_versions;
CREATE POLICY "Academy users can view asset versions"
ON public.academy_asset_versions FOR SELECT TO authenticated
USING (public.can_access_academy());

DROP POLICY IF EXISTS "Academy admins manage asset versions" ON public.academy_asset_versions;
CREATE POLICY "Academy admins manage asset versions"
ON public.academy_asset_versions FOR ALL TO authenticated
USING (public.is_academy_admin())
WITH CHECK (public.is_academy_admin());

DROP TRIGGER IF EXISTS academy_assets_set_updated_at ON public.academy_assets;
CREATE TRIGGER academy_assets_set_updated_at
BEFORE UPDATE ON public.academy_assets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();