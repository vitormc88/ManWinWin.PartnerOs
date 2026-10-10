-- Additive metadata only. Existing rollout, module permissions and RLS remain unchanged.
alter table public.customer_explorer_media
 add column website_url text,
 add column website_source text,
 add column website_reviewed_at date,
 add constraint explorer_website_reviewed check (
  (website_url is null and website_source is null and website_reviewed_at is null)
  or (website_url is not null and website_source is not null and website_reviewed_at is not null
   and length(website_url) between 10 and 2000 and length(website_source) between 10 and 2000
   and website_url ~ '^https://([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}([/?#][^[:space:]\\]*)?$'
   and website_source ~ '^https://([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}([/?#][^[:space:]\\]*)?$'
   and website_reviewed_at <= current_date));
comment on column public.customer_explorer_media.website_url is 'Reviewed public company website. HQ writes, existing Explorer RLS reads.';
comment on column public.customer_explorer_media.website_source is 'Public identity evidence for name and country; never private customer data.';
