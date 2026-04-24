ALTER TABLE public.proposals
ADD COLUMN software_discount_pct NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN services_discount_pct NUMERIC NOT NULL DEFAULT 0;