ALTER TABLE public.proposal_items
ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none',
ADD COLUMN discount_value NUMERIC NOT NULL DEFAULT 0;