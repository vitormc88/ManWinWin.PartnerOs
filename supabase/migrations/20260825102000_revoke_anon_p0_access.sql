-- Defense in depth: the P0 commercial workspace is authenticated-only.
-- RLS already has no anon policies; revoke inherited table privileges as well.

REVOKE ALL ON TABLE
  public.target_accounts,
  public.target_account_evidence,
  public.target_account_signals,
  public.target_account_people,
  public.target_account_activities,
  public.discovery_records,
  public.discovery_stakeholders,
  public.agreed_next_steps,
  public.stage_gate_overrides
FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.target_accounts,
  public.target_account_evidence,
  public.target_account_signals,
  public.target_account_people,
  public.target_account_activities,
  public.discovery_records,
  public.discovery_stakeholders,
  public.agreed_next_steps
TO authenticated;

GRANT SELECT, INSERT ON TABLE public.stage_gate_overrides TO authenticated;

GRANT ALL ON TABLE
  public.target_accounts,
  public.target_account_evidence,
  public.target_account_signals,
  public.target_account_people,
  public.target_account_activities,
  public.discovery_records,
  public.discovery_stakeholders,
  public.agreed_next_steps,
  public.stage_gate_overrides
TO service_role;
