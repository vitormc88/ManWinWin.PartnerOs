-- The Lovable TEST database's Qualification Checklist row was created by the
-- earlier fallback insert and therefore carries a different id than the
-- production row (81ca8468-…). Correct the content-only flag on whichever
-- single checklist resource this environment holds; no row is created here.
UPDATE public.academy_resources
   SET is_downloadable = false
 WHERE resource_type = 'checklist'
   AND file_path IS NULL
   AND external_url IS NULL
   AND coalesce(content, '') <> ''
   AND is_downloadable IS DISTINCT FROM false;