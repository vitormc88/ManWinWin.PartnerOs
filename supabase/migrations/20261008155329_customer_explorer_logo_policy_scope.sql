-- Qualify the outer object name: the directory also has a name column.
alter policy explorer_logo_insert on storage.objects with check(
 bucket_id='customer-explorer-logos' and (select private.explorer_access(true))
 and name ~ '^[1-9][0-9]{0,9}/[a-f0-9-]+\.(png|jpg|webp)$'
 and exists(select 1 from public.customer_explorer_directory d
  where d.client_key=split_part(storage.objects.name,'/',1)));
