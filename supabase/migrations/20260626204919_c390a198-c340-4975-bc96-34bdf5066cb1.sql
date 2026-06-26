
-- Sprint: Legacy Client Onboarding Fix (critical path)
-- Additive columns only.

-- 1) Primary contact flag
ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_client_contacts_primary
  ON public.client_contacts (client_id)
  WHERE is_primary = true;

-- 2) S&AT start date on licenses
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS sat_start_date date;

-- 3) Contract mode discriminator
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_mode text;

UPDATE public.contracts
  SET contract_mode = CASE
    WHEN source_proposal_id IS NOT NULL THEN 'generated_from_proposal'
    WHEN is_imported = true THEN 'imported_legacy'
    ELSE 'manual_legacy'
  END
  WHERE contract_mode IS NULL;

ALTER TABLE public.contracts
  ALTER COLUMN contract_mode SET DEFAULT 'manual_legacy';

-- 4) Renewal dedup flags
ALTER TABLE public.renewals
  ADD COLUMN IF NOT EXISTS is_covered_by_contract boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS covered_by_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_renewals_covered_by_contract
  ON public.renewals (covered_by_contract_id);

-- 5) Backfill: mark existing license renewals as covered when an active
--    contract renewal exists for the same client and renewal_date with a value.
UPDATE public.renewals r
   SET is_covered_by_contract = true,
       covered_by_contract_id = c.id
  FROM public.contracts c
  JOIN public.renewals cr ON cr.contract_id = c.id
 WHERE r.license_id IS NOT NULL
   AND r.contract_id IS NULL
   AND r.client_id = cr.client_id
   AND r.renewal_date IS NOT NULL
   AND cr.renewal_date IS NOT NULL
   AND r.renewal_date = cr.renewal_date
   AND coalesce(cr.estimated_value, 0) > 0
   AND coalesce(r.estimated_value, 0) = 0
   AND cr.status NOT IN ('Completed','Cancelled','Lost')
   AND r.is_covered_by_contract = false;
