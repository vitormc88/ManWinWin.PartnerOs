
-- 1. Storage: documents bucket - partner-scoped read via documents RLS
DROP POLICY IF EXISTS auth_read_documents ON storage.objects;
CREATE POLICY auth_read_documents ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.is_active = true
      AND (
        d.file_url = storage.objects.name
        OR replace(d.file_url, '%20', ' ') = storage.objects.name
      )
  )
);

-- Restrict document uploads to HQ users (KB is HQ-managed)
DROP POLICY IF EXISTS auth_upload_documents ON storage.objects;
CREATE POLICY hq_upload_documents ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND public.is_hq_user(auth.uid())
);
CREATE POLICY hq_update_documents ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'documents' AND public.is_hq_user(auth.uid()))
WITH CHECK (bucket_id = 'documents' AND public.is_hq_user(auth.uid()));
CREATE POLICY hq_delete_documents ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND public.is_hq_user(auth.uid()));

-- 2. Storage: proposals bucket - scope by lead_id (first folder segment) using can_view_deal/can_manage_deal
DROP POLICY IF EXISTS proposals_storage_select ON storage.objects;
DROP POLICY IF EXISTS proposals_storage_insert ON storage.objects;
DROP POLICY IF EXISTS proposals_storage_update ON storage.objects;
DROP POLICY IF EXISTS proposals_storage_delete ON storage.objects;

CREATE POLICY proposals_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'proposals'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.can_view_deal(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY proposals_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'proposals'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.can_manage_deal(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY proposals_storage_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'proposals'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.can_manage_deal(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'proposals'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.can_manage_deal(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY proposals_storage_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'proposals'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.can_manage_deal(((storage.foldername(name))[1])::uuid)
);

-- 3. training-assets: HQ-only upload
DROP POLICY IF EXISTS hq_upload_training ON storage.objects;
CREATE POLICY hq_upload_training ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'training-assets'
  AND public.has_role(auth.uid(), 'hq_admin'::app_role)
);

-- 4. avatars: require folder = uid for INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS auth_upload_avatars ON storage.objects;
CREATE POLICY auth_upload_avatars ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY auth_update_avatars ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY auth_delete_avatars ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. profiles: block self-escalation through partner_id / is_hq / is_active in WITH CHECK
--    (trigger prevent_profile_self_escalation already exists; this adds defence-in-depth at policy level)
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND partner_id IS NOT DISTINCT FROM public.get_user_partner_id(auth.uid())
  AND COALESCE(is_hq, false) = COALESCE(
    (SELECT p.is_hq FROM public.profiles p WHERE p.id = auth.uid()),
    false
  )
);

-- 6. Convert remaining views to security_invoker
ALTER VIEW public.v_deal_ownership_status SET (security_invoker = on);
ALTER VIEW public.v_analytics_deal_reconciliation SET (security_invoker = on);
ALTER VIEW public.v_analytics_sales_by_user SET (security_invoker = on);

-- 7. Set search_path on email queue functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

-- 8. Revoke public access on legacy backup tables (RLS enabled but no policies = deny all already;
--    revoke grants for clarity)
REVOKE ALL ON public._backup_partners_v1 FROM anon, authenticated;
REVOKE ALL ON public._backup_profiles_v1 FROM anon, authenticated;
REVOKE ALL ON public._backup_user_roles_v1 FROM anon, authenticated;
REVOKE ALL ON public._backup_user_module_permissions_v1 FROM anon, authenticated;
