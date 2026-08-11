DO $cleanup$
DECLARE
  cids uuid[];
  rids uuid[];
  ctids uuid[];
  did uuid;
BEGIN
  SELECT array_agg(id) INTO cids FROM public.clients WHERE client_code LIKE 'ZZV811-%';
  IF cids IS NULL THEN cids := ARRAY[]::uuid[]; END IF;
  SELECT array_agg(id) INTO rids FROM public.renewals WHERE client_id = ANY(cids);
  IF rids IS NULL THEN rids := ARRAY[]::uuid[]; END IF;
  SELECT array_agg(id) INTO ctids FROM public.contracts WHERE client_id = ANY(cids);
  IF ctids IS NULL THEN ctids := ARRAY[]::uuid[]; END IF;
  SELECT id INTO did FROM public.deals WHERE company_name = 'ZZV811 Pipeline Fixture Deal';

  DELETE FROM public.notifications WHERE renewal_id = ANY(rids) OR client_id = ANY(cids);
  DELETE FROM public.manual_tasks WHERE related_entity_id = ANY(rids) OR automation_key = 'zzv811:manual';
  DELETE FROM public.renewal_activities WHERE renewal_id = ANY(rids);
  DELETE FROM public.lifecycle_events WHERE client_id = ANY(cids);
  DELETE FROM public.proposals WHERE client_id = ANY(cids) OR renewal_id = ANY(rids) OR deal_id = did;
  DELETE FROM public.deals WHERE id = did;
  EXECUTE 'ALTER TABLE public.renewals DISABLE TRIGGER USER';
  UPDATE public.renewals SET next_renewal_id = NULL, previous_renewal_id = NULL, closed_proposal_id = NULL
   WHERE id = ANY(rids);
  EXECUTE 'ALTER TABLE public.renewals ENABLE TRIGGER USER';
  DELETE FROM public.renewals WHERE id = ANY(rids);
  DELETE FROM public.contract_lines WHERE contract_id = ANY(ctids) OR client_id = ANY(cids);
  DELETE FROM public.contracts WHERE id = ANY(ctids);
  DELETE FROM public.clients WHERE id = ANY(cids);
  DELETE FROM public.partners WHERE id = 'f0000000-0000-4000-8000-0000000000ff';
END
$cleanup$;

DROP TABLE IF EXISTS public.zz_verify_run;