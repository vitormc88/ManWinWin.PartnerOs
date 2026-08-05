-- Server-side attachment type enforcement for Academy objects
DROP POLICY IF EXISTS academy_assets_admin_insert ON storage.objects;
CREATE POLICY academy_assets_admin_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'training-assets'
  AND (storage.foldername(name))[1] = 'academy'
  AND public.is_academy_admin()
  AND lower(name) ~ '\.(pdf|doc|docx|ppt|pptx|xls|xlsx|csv|md|txt|zip|png|jpg|jpeg|webp|mp4)$'
);

DROP POLICY IF EXISTS academy_assets_admin_update ON storage.objects;
CREATE POLICY academy_assets_admin_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'training-assets'
       AND (storage.foldername(name))[1] = 'academy'
       AND public.is_academy_admin())
WITH CHECK (
  bucket_id = 'training-assets'
  AND (storage.foldername(name))[1] = 'academy'
  AND public.is_academy_admin()
  AND lower(name) ~ '\.(pdf|doc|docx|ppt|pptx|xls|xlsx|csv|md|txt|zip|png|jpg|jpeg|webp|mp4)$'
);