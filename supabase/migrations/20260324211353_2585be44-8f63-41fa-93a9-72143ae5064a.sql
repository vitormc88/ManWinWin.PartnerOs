ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS contact_person_name text,
  ADD COLUMN IF NOT EXISTS asset_range text,
  ADD COLUMN IF NOT EXISTS maintenance_team_size text;