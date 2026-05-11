ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invitation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS invitation_accepted_at timestamptz;

UPDATE public.profiles
SET invitation_accepted_at = COALESCE(invitation_accepted_at, created_at)
WHERE invitation_status = 'active' AND invitation_accepted_at IS NULL;