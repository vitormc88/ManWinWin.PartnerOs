REVOKE ALL ON FUNCTION public.proposals_status_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renewals_terminal_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proposal_contract_recurring(uuid) FROM PUBLIC, anon, authenticated;