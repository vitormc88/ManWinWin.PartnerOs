-- Partner Growth / Sprint 1 (Recruitment Core)
-- Fresh-install / replayable SQL. Equivalent schema installed and tested in
-- Supabase TEST avxxzmoayxzrykwqzoqn on 2026-10-10.
-- Do NOT apply to PROD without a separate authorized release.
BEGIN;

CREATE OR REPLACE FUNCTION public.partner_growth_access(required_level text DEFAULT 'view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles p
    WHERE p.id=auth.uid() AND p.is_hq IS TRUE AND p.is_active IS TRUE
      AND (
        public.has_role(auth.uid(),'hq_admin'::public.app_role)
        OR (
          public.has_role(auth.uid(),'hq_standard'::public.app_role)
          AND EXISTS(
            SELECT 1 FROM public.user_module_permissions u
            WHERE u.user_id=auth.uid() AND u.module_key='partner_growth'
              AND u.is_override IS TRUE
              AND (
                (required_level='view' AND u.access_level IN ('view','edit','admin'))
                OR (required_level='edit' AND u.access_level IN ('edit','admin'))
              )
          )
        )
      )
  );
$function$;
REVOKE ALL ON FUNCTION public.partner_growth_access(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.partner_growth_access(text) TO authenticated;

INSERT INTO public.role_permission_templates(role,module_key,access_level)
SELECT role,'partner_growth',CASE WHEN role='hq_admin'::public.app_role THEN 'admin' ELSE 'no_access' END
FROM unnest(enum_range(NULL::public.app_role)) role
ON CONFLICT(role,module_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.partner_prospects(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL CHECK(length(btrim(company_name)) BETWEEN 2 AND 250),
  country text NOT NULL CHECK(country ~ '^[A-Z]{2}$'),
  website text,
  recruitment_stage text NOT NULL DEFAULT 'Identified' CHECK(recruitment_stage IN
    ('Identified','Contacted','Engaged','Qualified','Agreement Pending','Signed','On Hold','Not a Fit','No Response')),
  proposed_partner_type text CHECK(proposed_partner_type IN ('CMSC','CMAR','CMAI','Strategic Alliance')),
  hq_owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  description text,
  source text,
  fit_summary text,
  interest_evidence text,
  qualification_decision text CHECK(qualification_decision IN ('Proceed','Hold','Reject')),
  qualified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  qualified_at timestamptz,
  agreement_reference text,
  agreement_signed_on date,
  signed_verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  signed_verified_at timestamptz,
  outcome_reason text,
  converted_partner_id uuid UNIQUE REFERENCES public.partners(id) ON DELETE RESTRICT,
  converted_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.partner_prospect_contacts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.partner_prospects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 200),
  job_title text,
  email text,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.partner_prospect_activities(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.partner_prospects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('note','interaction','meeting','stage_change','owner_change','decision')),
  content text NOT NULL CHECK(length(btrim(content))>0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_prospects_stage_idx ON public.partner_prospects(recruitment_stage) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS partner_prospects_country_idx ON public.partner_prospects(country) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS partner_prospects_owner_idx ON public.partner_prospects(hq_owner_user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS partner_prospects_name_idx ON public.partner_prospects(lower(company_name));
CREATE INDEX IF NOT EXISTS partner_prospect_contacts_prospect_idx ON public.partner_prospect_contacts(prospect_id);
CREATE UNIQUE INDEX IF NOT EXISTS partner_prospect_one_primary_contact_idx ON public.partner_prospect_contacts(prospect_id) WHERE is_primary IS TRUE;
CREATE INDEX IF NOT EXISTS partner_prospect_activities_prospect_time_idx ON public.partner_prospect_activities(prospect_id,occurred_at DESC);

ALTER TABLE public.partner_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_prospect_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_prospect_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.partner_prospects,public.partner_prospect_contacts,public.partner_prospect_activities FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON TABLE public.partner_prospects,public.partner_prospect_contacts TO authenticated;
GRANT SELECT,INSERT ON TABLE public.partner_prospect_activities TO authenticated;
GRANT DELETE ON TABLE public.partner_prospect_contacts TO authenticated;

DROP POLICY IF EXISTS pg_prospects_read ON public.partner_prospects;
DROP POLICY IF EXISTS pg_prospects_create ON public.partner_prospects;
DROP POLICY IF EXISTS pg_prospects_modify ON public.partner_prospects;
CREATE POLICY pg_prospects_read ON public.partner_prospects FOR SELECT TO authenticated USING(public.partner_growth_access('view'));
CREATE POLICY pg_prospects_create ON public.partner_prospects FOR INSERT TO authenticated WITH CHECK(public.partner_growth_access('edit') AND created_by=auth.uid());
CREATE POLICY pg_prospects_modify ON public.partner_prospects FOR UPDATE TO authenticated USING(public.partner_growth_access('edit')) WITH CHECK(public.partner_growth_access('edit'));

DROP POLICY IF EXISTS pg_contacts_read ON public.partner_prospect_contacts;
DROP POLICY IF EXISTS pg_contacts_create ON public.partner_prospect_contacts;
DROP POLICY IF EXISTS pg_contacts_modify ON public.partner_prospect_contacts;
DROP POLICY IF EXISTS pg_contacts_delete ON public.partner_prospect_contacts;
CREATE POLICY pg_contacts_read ON public.partner_prospect_contacts FOR SELECT TO authenticated USING(public.partner_growth_access('view'));
CREATE POLICY pg_contacts_create ON public.partner_prospect_contacts FOR INSERT TO authenticated WITH CHECK(public.partner_growth_access('edit'));
CREATE POLICY pg_contacts_modify ON public.partner_prospect_contacts FOR UPDATE TO authenticated USING(public.partner_growth_access('edit')) WITH CHECK(public.partner_growth_access('edit'));
CREATE POLICY pg_contacts_delete ON public.partner_prospect_contacts FOR DELETE TO authenticated USING(public.partner_growth_access('edit'));

DROP POLICY IF EXISTS pg_activities_read ON public.partner_prospect_activities;
DROP POLICY IF EXISTS pg_activities_create ON public.partner_prospect_activities;
CREATE POLICY pg_activities_read ON public.partner_prospect_activities FOR SELECT TO authenticated USING(public.partner_growth_access('view'));
CREATE POLICY pg_activities_create ON public.partner_prospect_activities FOR INSERT TO authenticated WITH CHECK(public.partner_growth_access('edit') AND created_by=auth.uid() AND kind IN ('note','interaction','meeting'));

CREATE OR REPLACE FUNCTION public.pg_prospect_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE contact_found boolean;
BEGIN
  IF NOT public.partner_growth_access('edit') THEN
    RAISE EXCEPTION 'Partner Growth edit permission required' USING ERRCODE='42501';
  END IF;
  NEW.company_name:=btrim(NEW.company_name);
  NEW.country:=upper(btrim(NEW.country));
  NEW.updated_at:=now();
  IF NEW.hq_owner_user_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.profiles p WHERE p.id=NEW.hq_owner_user_id
    AND p.is_hq IS TRUE AND p.is_active IS TRUE
    AND (
      public.has_role(p.id,'hq_admin'::public.app_role)
      OR (public.has_role(p.id,'hq_standard'::public.app_role) AND EXISTS(
        SELECT 1 FROM public.user_module_permissions u WHERE u.user_id=p.id
        AND u.module_key='partner_growth' AND u.is_override IS TRUE AND u.access_level IN ('view','edit','admin')
      ))
    )
  ) THEN RAISE EXCEPTION 'Owner must be an active, authorized HQ member' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Creator must be authenticated' USING ERRCODE='42501'; END IF;
    IF NEW.recruitment_stage <> 'Identified' THEN
      RAISE EXCEPTION 'New prospects must start in Identified' USING ERRCODE='23514'; END IF;
    IF NEW.qualified_by IS NOT NULL OR NEW.qualified_at IS NOT NULL
       OR NEW.signed_verified_by IS NOT NULL OR NEW.signed_verified_at IS NOT NULL
       OR NEW.converted_partner_id IS NOT NULL OR NEW.converted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Approval and conversion cannot be set at creation' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable prospect identity' USING ERRCODE='23514'; END IF;
  IF NEW.converted_partner_id IS DISTINCT FROM OLD.converted_partner_id
     OR NEW.converted_at IS DISTINCT FROM OLD.converted_at THEN
    RAISE EXCEPTION 'Conversion is reserved for Activation' USING ERRCODE='23514'; END IF;
  IF OLD.recruitment_stage='Signed' THEN
    IF NEW.recruitment_stage <> 'Signed' THEN
      RAISE EXCEPTION 'Signed prospects cannot be reopened' USING ERRCODE='23514';
    END IF;
    IF NEW.agreement_reference IS DISTINCT FROM OLD.agreement_reference
      OR NEW.agreement_signed_on IS DISTINCT FROM OLD.agreement_signed_on THEN
      RAISE EXCEPTION 'Signed agreement references and execution dates are immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.recruitment_stage='Qualified' AND OLD.recruitment_stage IS DISTINCT FROM 'Qualified' THEN
    IF NEW.qualification_decision IS DISTINCT FROM 'Proceed' THEN
      RAISE EXCEPTION 'Qualified requires an explicit Proceed decision' USING ERRCODE='23514'; END IF;
    NEW.qualified_by:=auth.uid(); NEW.qualified_at:=now();
  ELSIF NEW.qualified_by IS DISTINCT FROM OLD.qualified_by OR NEW.qualified_at IS DISTINCT FROM OLD.qualified_at THEN
    RAISE EXCEPTION 'Qualification approval is server managed' USING ERRCODE='23514'; END IF;
  IF NEW.recruitment_stage='Agreement Pending'
     AND OLD.recruitment_stage IS DISTINCT FROM 'Agreement Pending'
     AND (OLD.recruitment_stage <> 'Qualified' OR OLD.qualified_by IS NULL) THEN
    RAISE EXCEPTION 'Agreement Pending requires a Qualified prospect' USING ERRCODE='23514'; END IF;
  IF NEW.recruitment_stage='Signed' AND OLD.recruitment_stage IS DISTINCT FROM 'Signed' THEN
    IF OLD.recruitment_stage <> 'Agreement Pending' THEN
      RAISE EXCEPTION 'Signed requires Agreement Pending' USING ERRCODE='23514'; END IF;
    IF NOT(public.has_role(auth.uid(),'hq_admin'::public.app_role)
      AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_hq IS TRUE AND p.is_active IS TRUE)) THEN
      RAISE EXCEPTION 'Signed requires HQ Admin verification' USING ERRCODE='42501'; END IF;
    IF NEW.agreement_reference IS NULL OR length(btrim(NEW.agreement_reference))<4 OR
       NEW.agreement_signed_on IS NULL OR NEW.agreement_signed_on>current_date THEN
      RAISE EXCEPTION 'Signed requires a valid agreement reference/date' USING ERRCODE='23514'; END IF;
    NEW.signed_verified_by:=auth.uid(); NEW.signed_verified_at:=now();
  ELSIF NEW.signed_verified_by IS DISTINCT FROM OLD.signed_verified_by OR NEW.signed_verified_at IS DISTINCT FROM OLD.signed_verified_at THEN
    RAISE EXCEPTION 'Signature verification is server managed' USING ERRCODE='23514'; END IF;
  IF NEW.recruitment_stage IN ('Qualified','Agreement Pending','Signed') THEN
    IF NEW.qualification_decision IS DISTINCT FROM 'Proceed' OR NEW.qualified_by IS NULL
       OR NEW.qualified_at IS NULL OR NEW.proposed_partner_type IS NULL
       OR NEW.fit_summary IS NULL OR length(btrim(NEW.fit_summary))<5
       OR NEW.interest_evidence IS NULL OR length(btrim(NEW.interest_evidence))<5 THEN
      RAISE EXCEPTION 'Qualified stages require fit, interest, model, and HQ decision' USING ERRCODE='23514'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.partner_prospect_contacts c WHERE c.prospect_id=NEW.id
      AND length(btrim(c.name))>=2) INTO contact_found;
    IF NOT contact_found THEN
      RAISE EXCEPTION 'Qualified requires an identified contact' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.recruitment_stage='Signed' AND (NEW.agreement_reference IS NULL
    OR length(btrim(NEW.agreement_reference))<4 OR NEW.agreement_signed_on IS NULL
    OR NEW.signed_verified_by IS NULL OR NEW.signed_verified_at IS NULL) THEN
    RAISE EXCEPTION 'Signed requires verified agreement' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pg_prospect_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.partner_prospect_activities(prospect_id,kind,content,created_by)
    VALUES(NEW.id,'stage_change','Prospect created as Identified',auth.uid());
  ELSIF OLD.recruitment_stage IS DISTINCT FROM NEW.recruitment_stage THEN
    INSERT INTO public.partner_prospect_activities(prospect_id,kind,content,created_by)
    VALUES(NEW.id,'stage_change','Stage: '||OLD.recruitment_stage||' → '||NEW.recruitment_stage,auth.uid());
  END IF;
  IF TG_OP='UPDATE' AND OLD.hq_owner_user_id IS DISTINCT FROM NEW.hq_owner_user_id THEN
    INSERT INTO public.partner_prospect_activities(prospect_id,kind,content,created_by)
    VALUES(NEW.id,'owner_change','HQ owner assignment changed',auth.uid());
  END IF;
  IF TG_OP='UPDATE' AND NEW.qualified_at IS DISTINCT FROM OLD.qualified_at THEN
    INSERT INTO public.partner_prospect_activities(prospect_id,kind,content,created_by)
    VALUES(NEW.id,'decision','Qualification approved by HQ',auth.uid());
  END IF;
  IF TG_OP='UPDATE' AND NEW.signed_verified_at IS DISTINCT FROM OLD.signed_verified_at THEN
    INSERT INTO public.partner_prospect_activities(prospect_id,kind,content,created_by)
    VALUES(NEW.id,'decision','Agreement signed and verified by HQ Admin',auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pg_contact_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND NEW.prospect_id IS DISTINCT FROM OLD.prospect_id) THEN
    IF EXISTS(SELECT 1 FROM public.partner_prospects p WHERE p.id=OLD.prospect_id
      AND p.recruitment_stage IN ('Qualified','Agreement Pending','Signed'))
      AND (SELECT count(*) FROM public.partner_prospect_contacts c WHERE c.prospect_id=OLD.prospect_id)<=1 THEN
      RAISE EXCEPTION 'Cannot remove the last contact from a qualified prospect' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='UPDATE' THEN NEW.updated_at:=now(); END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

DROP TRIGGER IF EXISTS pg_prospect_guard_before ON public.partner_prospects;
CREATE TRIGGER pg_prospect_guard_before BEFORE INSERT OR UPDATE ON public.partner_prospects
FOR EACH ROW EXECUTE FUNCTION public.pg_prospect_guard();
DROP TRIGGER IF EXISTS pg_prospect_audit_after ON public.partner_prospects;
CREATE TRIGGER pg_prospect_audit_after AFTER INSERT OR UPDATE ON public.partner_prospects
FOR EACH ROW EXECUTE FUNCTION public.pg_prospect_audit();
DROP TRIGGER IF EXISTS pg_contact_guard_before ON public.partner_prospect_contacts;
CREATE TRIGGER pg_contact_guard_before BEFORE UPDATE OR DELETE ON public.partner_prospect_contacts
FOR EACH ROW EXECUTE FUNCTION public.pg_contact_guard();
REVOKE ALL ON FUNCTION public.pg_prospect_guard(),public.pg_prospect_audit(),public.pg_contact_guard()
FROM PUBLIC,anon,authenticated;

-- Reuse manual_tasks and unified_tasks; preserve existing non-prospect policies.
ALTER TABLE public.manual_tasks DROP CONSTRAINT IF EXISTS manual_tasks_related_type_check;
ALTER TABLE public.manual_tasks ADD CONSTRAINT manual_tasks_related_type_check
CHECK(related_type IN ('client','deal','renewal','lead','partner','general','partner_prospect'));

CREATE OR REPLACE FUNCTION public.pg_prospect_task_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE prospect_name text;
BEGIN
  IF NEW.related_type<>'partner_prospect' THEN RETURN NEW; END IF;
  IF NOT public.partner_growth_access('edit') THEN
    RAISE EXCEPTION 'Partner Growth edit permission required for prospect tasks' USING ERRCODE='42501'; END IF;
  IF NEW.related_entity_id IS NULL THEN
    RAISE EXCEPTION 'Prospect task requires prospect UUID' USING ERRCODE='23514'; END IF;
  SELECT company_name INTO prospect_name FROM public.partner_prospects
  WHERE id=NEW.related_entity_id AND archived_at IS NULL;
  IF prospect_name IS NULL THEN RAISE EXCEPTION 'Invalid/archived prospect task reference' USING ERRCODE='23514'; END IF;
  NEW.related_route:='/partner-growth/'||NEW.related_entity_id::text;
  NEW.related_company:=prospect_name;
  NEW.related_source:='partner_prospect';
  IF NEW.owner_user_id IS NULL THEN NEW.owner_user_id:=auth.uid(); END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.profiles p WHERE p.id=NEW.owner_user_id AND p.is_hq IS TRUE AND p.is_active IS TRUE
      AND (
        public.has_role(p.id,'hq_admin'::public.app_role)
        OR (
          public.has_role(p.id,'hq_standard'::public.app_role)
          AND EXISTS(SELECT 1 FROM public.user_module_permissions u WHERE u.user_id=p.id
            AND u.module_key='partner_growth' AND u.is_override IS TRUE AND u.access_level IN ('view','edit','admin'))
        )
      )
  ) THEN RAISE EXCEPTION 'Prospect task requires authorized HQ owner' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS pg_prospect_task_guard_before ON public.manual_tasks;
CREATE TRIGGER pg_prospect_task_guard_before BEFORE INSERT OR UPDATE ON public.manual_tasks
FOR EACH ROW EXECUTE FUNCTION public.pg_prospect_task_guard();
REVOKE ALL ON FUNCTION public.pg_prospect_task_guard() FROM PUBLIC,anon,authenticated;

DROP POLICY IF EXISTS manual_tasks_select ON public.manual_tasks;
CREATE POLICY manual_tasks_select ON public.manual_tasks FOR SELECT TO authenticated
USING(
  (related_type='partner_prospect' AND public.partner_growth_access('view'))
  OR (related_type<>'partner_prospect' AND
    (public.is_hq_user(auth.uid()) OR owner_user_id=auth.uid() OR created_by=auth.uid()))
);
DROP POLICY IF EXISTS manual_tasks_insert ON public.manual_tasks;
CREATE POLICY manual_tasks_insert ON public.manual_tasks FOR INSERT TO authenticated
WITH CHECK(created_by=auth.uid() AND (related_type<>'partner_prospect' OR public.partner_growth_access('edit')));
DROP POLICY IF EXISTS manual_tasks_update ON public.manual_tasks;
CREATE POLICY manual_tasks_update ON public.manual_tasks FOR UPDATE TO authenticated
USING(
  (related_type='partner_prospect' AND public.partner_growth_access('edit'))
  OR (related_type<>'partner_prospect' AND (public.is_hq_user(auth.uid()) OR owner_user_id=auth.uid() OR created_by=auth.uid()))
)
WITH CHECK(
  (related_type='partner_prospect' AND public.partner_growth_access('edit'))
  OR (related_type<>'partner_prospect' AND (public.is_hq_user(auth.uid()) OR owner_user_id=auth.uid() OR created_by=auth.uid()))
);
DROP POLICY IF EXISTS manual_tasks_delete ON public.manual_tasks;
CREATE POLICY manual_tasks_delete ON public.manual_tasks FOR DELETE TO authenticated
USING(
  (related_type='partner_prospect' AND public.partner_growth_access('edit'))
  OR (related_type<>'partner_prospect' AND (public.is_hq_user(auth.uid()) OR created_by=auth.uid()))
);
COMMIT;
