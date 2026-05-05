
-- Partner Management upgrades
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS account_owner_id uuid,
  ADD COLUMN IF NOT EXISTS last_meeting_date date,
  ADD COLUMN IF NOT EXISTS next_meeting_date date,
  ADD COLUMN IF NOT EXISTS uses_own_database boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS uses_manwinwin_database boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS meeting_cadence text;

-- Partner notes (activity timeline)
CREATE TABLE IF NOT EXISTS public.partner_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  content text NOT NULL,
  author_id uuid,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_notes_partner_id ON public.partner_notes(partner_id, created_at DESC);

ALTER TABLE public.partner_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_notes_select ON public.partner_notes;
DROP POLICY IF EXISTS partner_notes_insert ON public.partner_notes;
DROP POLICY IF EXISTS partner_notes_delete ON public.partner_notes;

CREATE POLICY partner_notes_select ON public.partner_notes FOR SELECT TO authenticated
  USING (public.can_view_partner(partner_id));
CREATE POLICY partner_notes_insert ON public.partner_notes FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_partner(partner_id));
CREATE POLICY partner_notes_delete ON public.partner_notes FOR DELETE TO authenticated
  USING (public.can_manage_partner(partner_id) OR public.has_role(auth.uid(), 'hq_admin'));

-- Certification structured fields
ALTER TABLE public.partner_certifications
  ADD COLUMN IF NOT EXISTS certification_type text,
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS file_url text;
