ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS superseded_by_renewal_id uuid REFERENCES public.renewals(id);
COMMENT ON COLUMN public.renewals.superseded_by_renewal_id IS 'Reconciled duplicate: retained for audit, excluded from commercial pipeline and loss counts.';
DO $migration$
DECLARE f record; old_guard text; new_guard text; changed text;
BEGIN
old_guard := 'CONTINUE WHEN EXISTS (SELECT 1 FROM public.renewals
                             WHERE client_id = c.client_id AND renewal_date = _target);';
new_guard := 'CONTINUE WHEN EXISTS (SELECT 1 FROM public.renewals rr
        WHERE rr.client_id = c.client_id
          AND (rr.renewal_date = _target OR (
            rr.closed_at IS NOT NULL
            AND (rr.contract_id = c.id OR rr.contract_id IS NULL)
            AND rr.renewal_date BETWEEN _target - 1 AND _target + 1)));';
FOR f IN SELECT oid,pg_get_functiondef(oid) def FROM pg_proc
 WHERE pronamespace='public'::regnamespace AND proname='renewal_automation_run'
LOOP
 IF position(old_guard in f.def)=0 THEN
   IF position(new_guard in f.def)=0 THEN RAISE EXCEPTION 'Unexpected renewal automation definition %',f.oid; END IF;
 ELSE
   changed:=replace(f.def,old_guard,new_guard);
   EXECUTE changed;
 END IF;
END LOOP;
END $migration$;
