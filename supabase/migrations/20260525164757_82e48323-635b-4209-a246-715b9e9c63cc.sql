
-- =====================================================================
-- 1. Drop blanket public policies on operational tables
-- =====================================================================
DROP POLICY IF EXISTS "Allow all access to commissions" ON public.commissions;
DROP POLICY IF EXISTS "Allow all access to deal_registrations" ON public.deal_registrations;
DROP POLICY IF EXISTS "Allow all access to licensed_modules" ON public.licensed_modules;
DROP POLICY IF EXISTS "Allow all access to partner_certifications" ON public.partner_certifications;
DROP POLICY IF EXISTS "Allow all access to partner_health_scores" ON public.partner_health_scores;
DROP POLICY IF EXISTS "Allow all access to partner_tiers" ON public.partner_tiers;
DROP POLICY IF EXISTS "Allow all access to payments" ON public.payments;
DROP POLICY IF EXISTS "Allow all access to client_audit_logs" ON public.client_audit_logs;
DROP POLICY IF EXISTS "Allow all access to onboarding_checklist" ON public.onboarding_checklist;
DROP POLICY IF EXISTS "Allow all access to partner_badges" ON public.partner_badges;
DROP POLICY IF EXISTS "Allow all access to partner_missions" ON public.partner_missions;
DROP POLICY IF EXISTS "Allow all access to partner_onboarding" ON public.partner_onboarding;
DROP POLICY IF EXISTS "Allow all access to partner_renewal_settings" ON public.partner_renewal_settings;
DROP POLICY IF EXISTS "Allow all access to renewal_activities" ON public.renewal_activities;

-- Ensure RLS is on (it already is, but be explicit/idempotent)
ALTER TABLE public.commissions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_registrations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licensed_modules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_certifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_health_scores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_tiers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_checklist      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_badges            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_missions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_onboarding        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_renewal_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_activities        ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 2. Partner-id-scoped tables (text partner_id cast to uuid)
--    SELECT  → HQ or can_view_partner (partner members + managers)
--    WRITE   → HQ or own partner
-- =====================================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'commissions',
    'deal_registrations',
    'partner_certifications',
    'partner_health_scores',
    'partner_tiers',
    'partner_badges',
    'partner_missions',
    'partner_onboarding',
    'partner_renewal_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);

    EXECUTE format($f$
      CREATE POLICY %I_select ON public.%I
        FOR SELECT TO authenticated
        USING (
          public.is_hq_user(auth.uid())
          OR (partner_id IS NOT NULL AND public.can_view_partner((partner_id)::uuid))
        )
    $f$, t, t);

    EXECUTE format($f$
      CREATE POLICY %I_insert ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (
          public.is_hq_user(auth.uid())
          OR (partner_id IS NOT NULL AND (partner_id)::uuid = public.get_user_partner_id(auth.uid()))
        )
    $f$, t, t);

    EXECUTE format($f$
      CREATE POLICY %I_update ON public.%I
        FOR UPDATE TO authenticated
        USING (
          public.is_hq_user(auth.uid())
          OR (partner_id IS NOT NULL AND (partner_id)::uuid = public.get_user_partner_id(auth.uid()))
        )
        WITH CHECK (
          public.is_hq_user(auth.uid())
          OR (partner_id IS NOT NULL AND (partner_id)::uuid = public.get_user_partner_id(auth.uid()))
        )
    $f$, t, t);

    EXECUTE format($f$
      CREATE POLICY %I_delete ON public.%I
        FOR DELETE TO authenticated
        USING (
          public.is_hq_user(auth.uid())
          OR (partner_id IS NOT NULL AND (partner_id)::uuid = public.get_user_partner_id(auth.uid()))
        )
    $f$, t, t);
  END LOOP;
END $$;

-- =====================================================================
-- 3. payments  → scoped via client_id
-- =====================================================================
DROP POLICY IF EXISTS payments_select ON public.payments;
DROP POLICY IF EXISTS payments_insert ON public.payments;
DROP POLICY IF EXISTS payments_update ON public.payments;
DROP POLICY IF EXISTS payments_delete ON public.payments;

CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated
  USING (public.is_hq_user(auth.uid()) OR public.can_view_client(client_id));

CREATE POLICY payments_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_hq_user(auth.uid()) OR public.can_manage_client(client_id));

CREATE POLICY payments_update ON public.payments
  FOR UPDATE TO authenticated
  USING (public.is_hq_user(auth.uid()) OR public.can_manage_client(client_id))
  WITH CHECK (public.is_hq_user(auth.uid()) OR public.can_manage_client(client_id));

CREATE POLICY payments_delete ON public.payments
  FOR DELETE TO authenticated
  USING (public.is_hq_user(auth.uid()) OR public.can_manage_client(client_id));

-- =====================================================================
-- 4. client_audit_logs  → SELECT via can_view_client; mutations HQ only
-- =====================================================================
DROP POLICY IF EXISTS client_audit_logs_select ON public.client_audit_logs;
DROP POLICY IF EXISTS client_audit_logs_insert ON public.client_audit_logs;
DROP POLICY IF EXISTS client_audit_logs_update ON public.client_audit_logs;
DROP POLICY IF EXISTS client_audit_logs_delete ON public.client_audit_logs;

CREATE POLICY client_audit_logs_select ON public.client_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_hq_user(auth.uid()) OR public.can_view_client(client_id));

CREATE POLICY client_audit_logs_insert ON public.client_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_hq_user(auth.uid()) OR public.can_manage_client(client_id));

CREATE POLICY client_audit_logs_update ON public.client_audit_logs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'hq_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'hq_admin'::app_role));

CREATE POLICY client_audit_logs_delete ON public.client_audit_logs
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'hq_admin'::app_role));

-- =====================================================================
-- 5. licensed_modules  → license_id → licenses.client_id → clients
-- =====================================================================
DROP POLICY IF EXISTS licensed_modules_select ON public.licensed_modules;
DROP POLICY IF EXISTS licensed_modules_insert ON public.licensed_modules;
DROP POLICY IF EXISTS licensed_modules_update ON public.licensed_modules;
DROP POLICY IF EXISTS licensed_modules_delete ON public.licensed_modules;

CREATE POLICY licensed_modules_select ON public.licensed_modules
  FOR SELECT TO authenticated
  USING (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.licenses l
      WHERE l.id = licensed_modules.license_id
        AND public.can_view_client(l.client_id)
    )
  );

CREATE POLICY licensed_modules_insert ON public.licensed_modules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.licenses l
      WHERE l.id = licensed_modules.license_id
        AND public.can_manage_client(l.client_id)
    )
  );

CREATE POLICY licensed_modules_update ON public.licensed_modules
  FOR UPDATE TO authenticated
  USING (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.licenses l
      WHERE l.id = licensed_modules.license_id
        AND public.can_manage_client(l.client_id)
    )
  )
  WITH CHECK (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.licenses l
      WHERE l.id = licensed_modules.license_id
        AND public.can_manage_client(l.client_id)
    )
  );

CREATE POLICY licensed_modules_delete ON public.licensed_modules
  FOR DELETE TO authenticated
  USING (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.licenses l
      WHERE l.id = licensed_modules.license_id
        AND public.can_manage_client(l.client_id)
    )
  );

-- =====================================================================
-- 6. onboarding_checklist  → onboarding_id → partner_onboarding.partner_id
-- =====================================================================
DROP POLICY IF EXISTS onboarding_checklist_select ON public.onboarding_checklist;
DROP POLICY IF EXISTS onboarding_checklist_insert ON public.onboarding_checklist;
DROP POLICY IF EXISTS onboarding_checklist_update ON public.onboarding_checklist;
DROP POLICY IF EXISTS onboarding_checklist_delete ON public.onboarding_checklist;

CREATE POLICY onboarding_checklist_select ON public.onboarding_checklist
  FOR SELECT TO authenticated
  USING (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.partner_onboarding po
      WHERE po.id = onboarding_checklist.onboarding_id
        AND po.partner_id IS NOT NULL
        AND public.can_view_partner((po.partner_id)::uuid)
    )
  );

CREATE POLICY onboarding_checklist_insert ON public.onboarding_checklist
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.partner_onboarding po
      WHERE po.id = onboarding_checklist.onboarding_id
        AND po.partner_id IS NOT NULL
        AND (po.partner_id)::uuid = public.get_user_partner_id(auth.uid())
    )
  );

CREATE POLICY onboarding_checklist_update ON public.onboarding_checklist
  FOR UPDATE TO authenticated
  USING (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.partner_onboarding po
      WHERE po.id = onboarding_checklist.onboarding_id
        AND po.partner_id IS NOT NULL
        AND (po.partner_id)::uuid = public.get_user_partner_id(auth.uid())
    )
  )
  WITH CHECK (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.partner_onboarding po
      WHERE po.id = onboarding_checklist.onboarding_id
        AND po.partner_id IS NOT NULL
        AND (po.partner_id)::uuid = public.get_user_partner_id(auth.uid())
    )
  );

CREATE POLICY onboarding_checklist_delete ON public.onboarding_checklist
  FOR DELETE TO authenticated
  USING (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.partner_onboarding po
      WHERE po.id = onboarding_checklist.onboarding_id
        AND po.partner_id IS NOT NULL
        AND (po.partner_id)::uuid = public.get_user_partner_id(auth.uid())
    )
  );

-- =====================================================================
-- 7. renewal_activities  → renewal_id → renewals.partner_id
-- =====================================================================
DROP POLICY IF EXISTS renewal_activities_select ON public.renewal_activities;
DROP POLICY IF EXISTS renewal_activities_insert ON public.renewal_activities;
DROP POLICY IF EXISTS renewal_activities_update ON public.renewal_activities;
DROP POLICY IF EXISTS renewal_activities_delete ON public.renewal_activities;

CREATE POLICY renewal_activities_select ON public.renewal_activities
  FOR SELECT TO authenticated
  USING (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.renewals r
      WHERE r.id = renewal_activities.renewal_id
        AND r.partner_id IS NOT NULL
        AND public.can_view_partner((r.partner_id)::uuid)
    )
  );

CREATE POLICY renewal_activities_insert ON public.renewal_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.renewals r
      WHERE r.id = renewal_activities.renewal_id
        AND r.partner_id IS NOT NULL
        AND (r.partner_id)::uuid = public.get_user_partner_id(auth.uid())
    )
  );

CREATE POLICY renewal_activities_update ON public.renewal_activities
  FOR UPDATE TO authenticated
  USING (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.renewals r
      WHERE r.id = renewal_activities.renewal_id
        AND r.partner_id IS NOT NULL
        AND (r.partner_id)::uuid = public.get_user_partner_id(auth.uid())
    )
  )
  WITH CHECK (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.renewals r
      WHERE r.id = renewal_activities.renewal_id
        AND r.partner_id IS NOT NULL
        AND (r.partner_id)::uuid = public.get_user_partner_id(auth.uid())
    )
  );

CREATE POLICY renewal_activities_delete ON public.renewal_activities
  FOR DELETE TO authenticated
  USING (
    public.is_hq_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.renewals r
      WHERE r.id = renewal_activities.renewal_id
        AND r.partner_id IS NOT NULL
        AND (r.partner_id)::uuid = public.get_user_partner_id(auth.uid())
    )
  );

-- =====================================================================
-- 8. profiles: harden INSERT + block partner_id / is_hq self-escalation
-- =====================================================================
DROP POLICY IF EXISTS profiles_insert ON public.profiles;

CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND COALESCE(is_hq, false) = false
    AND partner_id IS NULL
  );

CREATE OR REPLACE FUNCTION public.prevent_profile_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- HQ admins can change anything; allow.
  IF public.has_role(auth.uid(), 'hq_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Anyone else editing their own row cannot change partner_id or is_hq.
  IF NEW.id = auth.uid() THEN
    IF NEW.partner_id IS DISTINCT FROM OLD.partner_id THEN
      RAISE EXCEPTION 'You cannot change your partner assignment';
    END IF;
    IF COALESCE(NEW.is_hq, false) IS DISTINCT FROM COALESCE(OLD.is_hq, false) THEN
      RAISE EXCEPTION 'You cannot change your HQ membership';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_self_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_self_escalation();

-- =====================================================================
-- 9. audit_logs: prevent forged performed_by
-- =====================================================================
DROP POLICY IF EXISTS audit_insert ON public.audit_logs;
CREATE POLICY audit_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (performed_by = auth.uid());
