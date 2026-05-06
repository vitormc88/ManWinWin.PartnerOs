
ALTER TABLE public.partner_notes
  ADD COLUMN IF NOT EXISTS note_type text NOT NULL DEFAULT 'Internal Note',
  ADD COLUMN IF NOT EXISTS next_actions text;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS relationship_status text DEFAULT 'Healthy';
