
-- Normalize legacy deal.stage values to canonical pipeline stages
UPDATE public.deals SET stage = 'Open Lead' WHERE stage = 'Lead';
UPDATE public.deals SET stage = 'Price Negotiation' WHERE stage = 'Negotiation';
UPDATE public.deals SET stage = 'Meeting 2' WHERE stage = 'Follow-up';
UPDATE public.deals SET stage = 'Demo' WHERE stage = 'Meeting';
-- Default for new deals
ALTER TABLE public.deals ALTER COLUMN stage SET DEFAULT 'Open Lead';
