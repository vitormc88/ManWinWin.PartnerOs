ALTER TABLE public.proposal_items
  ADD COLUMN IF NOT EXISTS apply_discount_to_renewal BOOLEAN NOT NULL DEFAULT false;