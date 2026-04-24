
-- Extend pricing_rules with Business-ready fields without breaking existing logic.
-- All new columns are nullable / defaulted so current Professional flow keeps working.

ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS product_family text NOT NULL DEFAULT 'Professional',
  ADD COLUMN IF NOT EXISTS license_model text,                 -- 'KeepIT' | 'UseIT' | null for Professional
  ADD COLUMN IF NOT EXISTS applicable_plan text,               -- '1' | '2' | '3' | 'all' | null
  ADD COLUMN IF NOT EXISTS billing_frequency text,             -- 'one-time' | 'monthly' | 'yearly' | etc.
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'Global',
  ADD COLUMN IF NOT EXISTS optional boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS included_by_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_override boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS support_calculation_type text,      -- 'percentage' | 'fixed' | 'included' | null
  ADD COLUMN IF NOT EXISTS support_percentage numeric,         -- e.g. 18 for 18%
  ADD COLUMN IF NOT EXISTS applies_to_license_total boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description text;

-- Backfill billing_frequency from existing unit_type for consistency
UPDATE public.pricing_rules
SET billing_frequency = unit_type
WHERE billing_frequency IS NULL;

-- Helpful index for admin filtering
CREATE INDEX IF NOT EXISTS idx_pricing_rules_family_active
  ON public.pricing_rules (product_family, active);
