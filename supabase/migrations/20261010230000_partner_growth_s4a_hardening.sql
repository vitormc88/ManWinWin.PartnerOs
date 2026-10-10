-- Sprint 4A follow-up: preserve approved commercial model and handoff ownership.
-- Additive migration for TEST; does not grant access, create partners or alter PROD.
BEGIN;

CREATE OR REPLACE FUNCTION public.pg_signed_partner_model_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  -- A signed agreement reflects the model reviewed in the Agreement Pending stage.
  -- Corrections to the signed model require a separate formal amendment workflow.
  IF (
    OLD.recruitment_stage = 'Signed'
    OR (OLD.recruitment_stage = 'Agreement Pending' AND NEW.recruitment_stage = 'Signed')
  ) AND NEW.proposed_partner_type IS DISTINCT FROM OLD.proposed_partner_type THEN
    RAISE EXCEPTION 'Signed partnership model is immutable; use a formal contract amendment'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS pg_signed_partner_model_lock_before ON public.partner_prospects;
CREATE TRIGGER pg_signed_partner_model_lock_before
BEFORE UPDATE ON public.partner_prospects
FOR EACH ROW EXECUTE FUNCTION public.pg_signed_partner_model_lock();

CREATE OR REPLACE FUNCTION public.pg_activation_owner_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  -- Readiness is only valid for the HQ owner who was approved.
  -- Updating the owner after approval must require a separate re-approval process.
  IF OLD.readiness_status = 'ready_for_handoff'
     AND NEW.hq_activation_owner IS DISTINCT FROM OLD.hq_activation_owner THEN
    RAISE EXCEPTION 'Approved handoff owner is immutable; request a formal re-review'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS pg_activation_owner_lock_before ON public.partner_prospect_activation_plans;
CREATE TRIGGER pg_activation_owner_lock_before
BEFORE UPDATE ON public.partner_prospect_activation_plans
FOR EACH ROW EXECUTE FUNCTION public.pg_activation_owner_lock();

REVOKE ALL ON FUNCTION public.pg_signed_partner_model_lock(),
  public.pg_activation_owner_lock() FROM PUBLIC, anon, authenticated;
COMMIT;
