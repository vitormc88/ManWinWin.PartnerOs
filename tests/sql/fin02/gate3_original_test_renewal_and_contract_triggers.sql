-- Gate3: original TEST contract/renewal triggers only. New initial-sale
-- event comes from independently staged SEC-37 review-only migration.
-- Original TEST renewal ledger trigger and contract totals hooks.
CREATE TRIGGER trg_renewal_closure_record_revenue
 BEFORE UPDATE ON public.renewals
 FOR EACH ROW
 WHEN (NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL)
 EXECUTE FUNCTION public.renewal_closure_record_revenue();
CREATE TRIGGER trg_contract_lines_refresh_total
 AFTER INSERT OR DELETE OR UPDATE ON public.contract_lines
 FOR EACH ROW EXECUTE FUNCTION public.contract_lines_refresh_total();
CREATE TRIGGER trg_contracts_refresh_total
 AFTER INSERT OR UPDATE OF manual_adjustment_amount ON public.contracts
 FOR EACH ROW EXECUTE FUNCTION public.contracts_refresh_total();
