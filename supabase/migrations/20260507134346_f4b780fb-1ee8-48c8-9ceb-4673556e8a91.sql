-- Fix renewals.billing_frequency missing, add initial vs recurring contract values to licenses
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS billing_frequency text;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS initial_contract_value numeric;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS recurring_contract_value numeric;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS source_proposal_id uuid;
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS source_proposal_id uuid;