-- FIN02: exact live TEST helper function bodies, read-only captured 11 Oct 2026.
-- Synthetic role, profile & module config ONLY; no actual user records, secrets.
-- The helpers preserve their SQL SECURITY DEFINER attributes and logic.
-- Do not install outside disposable CI / never apply to live TEST or PROD.

CREATE OR REPLACE FUNCTION public.access_level_rank(_lvl text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _lvl
    WHEN 'admin' THEN 3
    WHEN 'edit' THEN 2
    WHEN 'view' THEN 1
    ELSE 0
  END
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$function$;

CREATE OR REPLACE FUNCTION public.is_hq_user(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('hq_admin', 'hq_standard')
      AND coalesce(p.is_hq, false) = true
  )
$function$;

CREATE OR REPLACE FUNCTION public.get_user_partner_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT partner_id FROM public.profiles WHERE id = _user_id
$function$;

CREATE OR REPLACE FUNCTION public.get_effective_permissions(_user_id uuid)
 RETURNS TABLE(module_key text, access_level text, is_override boolean, template_level text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH user_roles_x AS (
    SELECT role FROM user_roles WHERE user_id = _user_id
  ),
  template AS (
    SELECT rpt.module_key,
           (SELECT level FROM (
             SELECT access_level AS level, access_level_rank(access_level) AS r
             FROM role_permission_templates rpt2
             WHERE rpt2.module_key = rpt.module_key
               AND rpt2.role IN (SELECT role FROM user_roles_x)
             ORDER BY r DESC LIMIT 1
           ) t) AS template_level
    FROM role_permission_templates rpt
    GROUP BY rpt.module_key
  ),
  override AS (
    SELECT module_key, access_level
    FROM user_module_permissions
    WHERE user_id = _user_id AND is_override = true
  )
  SELECT
    t.module_key,
    COALESCE(o.access_level, t.template_level, 'no_access') AS access_level,
    (o.access_level IS NOT NULL) AS is_override,
    COALESCE(t.template_level, 'no_access') AS template_level
  FROM template t
  LEFT JOIN override o ON o.module_key = t.module_key;
$function$;

CREATE OR REPLACE FUNCTION public.has_module_access(_module_key text, _required_level text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.get_effective_permissions((select auth.uid())) p
      where p.module_key = _module_key
        and public.access_level_rank(p.access_level) >= public.access_level_rank(_required_level)
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_partner_manager_for_partner(_user_id uuid, _partner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.partners p
    where p.id = _partner_id
      and p.assigned_manager_id = _user_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_view_partner(_partner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (
    public.is_hq_user(auth.uid())
    or _partner_id = public.get_user_partner_id(auth.uid())
    or public.is_partner_manager_for_partner(auth.uid(), _partner_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_deal(_deal_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.deals d
    where d.id = _deal_id
      and (
        public.is_hq_user(auth.uid())
        or (
          d.partner_id is not null
          and d.partner_id::uuid = public.get_user_partner_id(auth.uid())
        )
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_view_deal(_deal_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.deals d
    where d.id = _deal_id
      and (
        public.is_hq_user(auth.uid())
        or (
          d.partner_id is not null
          and public.can_view_partner(d.partner_id::uuid)
        )
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_view_client(_client_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
SELECT public.has_module_access('clients', 'view')
AND EXISTS (
 SELECT 1 FROM public.clients c WHERE c.id = _client_id AND (
 public.is_hq_user((SELECT auth.uid()))
 OR c.partner_uuid = public.get_user_partner_id((SELECT auth.uid()))
 OR (c.partner_uuid IS NULL
 AND c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 AND c.partner_id::uuid = public.get_user_partner_id((SELECT auth.uid())))
 )
);
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_client(_client_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_module_access('clients', 'edit')
    and exists (
      select 1
      from public.clients c
      where c.id = _client_id
        and (
          public.is_hq_user((select auth.uid()))
          or c.partner_uuid = public.get_user_partner_id((select auth.uid()))
          or (
            c.partner_uuid is null
            and c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and c.partner_id::uuid = public.get_user_partner_id((select auth.uid()))
          )
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_client_proposal(_client_id uuid, _partner_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = _client_id
      AND (
        public.is_hq_user(auth.uid())
        OR (
          c.partner_id IS NOT NULL
          AND c.partner_id::uuid = public.get_user_partner_id(auth.uid())
          -- a partner user may never label the proposal with another partner
          AND (_partner_uuid IS NULL OR _partner_uuid = c.partner_id::uuid)
        )
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_access_renewal_proposal(_renewal_id uuid, _client_id uuid, _partner_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.renewals r
    LEFT JOIN public.clients c ON c.id = r.client_id
    WHERE r.id = _renewal_id
      AND r.client_id = _client_id
      AND (
        public.is_hq_user(auth.uid())
        OR (
          COALESCE(r.partner_uuid, c.partner_uuid) IS NOT NULL
          AND COALESCE(r.partner_uuid, c.partner_uuid) = _partner_uuid
          AND COALESCE(r.partner_uuid, c.partner_uuid) = public.get_user_partner_id(auth.uid())
        )
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_proposal_source(_source_type text, _deal_id uuid, _renewal_id uuid, _client_id uuid, _partner_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE COALESCE(_source_type,'deal')
    WHEN 'deal'   THEN _deal_id IS NOT NULL AND public.can_manage_deal(_deal_id)
    WHEN 'client' THEN _client_id IS NOT NULL AND public.can_access_client_proposal(_client_id, _partner_uuid)
    ELSE public.can_access_renewal_proposal(_renewal_id, _client_id, _partner_uuid)
  END
$function$;

CREATE OR REPLACE FUNCTION public.can_view_proposal_source(_source_type text, _deal_id uuid, _renewal_id uuid, _client_id uuid, _partner_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE COALESCE(_source_type,'deal')
    WHEN 'deal'   THEN _deal_id IS NOT NULL AND public.can_view_deal(_deal_id)
    WHEN 'client' THEN _client_id IS NOT NULL AND public.can_view_client(_client_id)
    ELSE public.can_access_renewal_proposal(_renewal_id, _client_id, _partner_uuid)
  END
$function$;

CREATE OR REPLACE FUNCTION public.pg_is_probationary_partner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid()
  AND r.role::text IN ('partner_connector','partner_reseller_trainee','partner_implementer_trainee'));
$function$;
