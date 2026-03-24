
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS job_role text,
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS num_assets integer,
  ADD COLUMN IF NOT EXISTS num_maintenance_team integer,
  ADD COLUMN IF NOT EXISTS register_date date DEFAULT CURRENT_DATE;
