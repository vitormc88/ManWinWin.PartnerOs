-- HQ review baseline: normalization differences are not new source changes.
alter table public.customer_explorer_overrides add column source_sector_at_review text;
update public.customer_explorer_overrides o set source_sector_at_review=c.sector
from public.clients c where c.id=o.client_id;

create function private.explorer_capture_sector_source()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.sector is distinct from old.sector
   or new.evidence_status is distinct from old.evidence_status
   or new.evidence_note is distinct from old.evidence_note then
  select c.sector into new.source_sector_at_review from public.clients c where c.id=new.client_id;
 end if;
 return new;
end; $$;
revoke all on function private.explorer_capture_sector_source() from public,anon,authenticated;
create trigger explorer_override_sector_baseline before insert or update
on public.customer_explorer_overrides for each row execute function private.explorer_capture_sector_source();

create function private.explorer_sector_review_data()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.explorer_access(true) then raise exception 'HQ directory administrator required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('source_id',c.id,'source_sector',c.sector,
  'has_sector_override',o.client_id is not null,'source_sector_at_review',o.source_sector_at_review,
  'source_sector_changed',o.client_id is not null and c.sector is distinct from o.source_sector_at_review))
  from public.clients c left join public.customer_explorer_overrides o on o.client_id=c.id
  where c.client_code ~ '^[0-9]+$'), '[]'::jsonb);
end; $$;
create function public.customer_explorer_sector_review_data()
returns jsonb language sql security invoker set search_path='' as $$ select private.explorer_sector_review_data(); $$;
revoke all on function private.explorer_sector_review_data(),public.customer_explorer_sector_review_data() from public,anon;
grant execute on function private.explorer_sector_review_data(),public.customer_explorer_sector_review_data() to authenticated;

-- Explicit acknowledgement, never implied by changing visibility or uploading a logo.
create function private.explorer_keep_sector(p_client_id uuid,p_expected_updated_at timestamptz,p_expected_source text)
returns void language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 if not private.explorer_access(true) then raise exception 'HQ directory administrator required' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('customer-explorer-refresh'));
 update public.customer_explorer_overrides o set source_sector_at_review=c.sector
 from public.clients c where c.id=o.client_id and o.client_id=p_client_id
  and o.updated_at=p_expected_updated_at and c.sector is not distinct from p_expected_source;
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Customer changed. Refresh and review again.' using errcode='PT409';end if;
end; $$;
create function public.customer_explorer_keep_sector(p_client_id uuid,p_expected_updated_at timestamptz,p_expected_source text)
returns void language sql security invoker set search_path='' as $$ select private.explorer_keep_sector(p_client_id,p_expected_updated_at,p_expected_source); $$;
revoke all on function private.explorer_keep_sector(uuid,timestamptz,text),public.customer_explorer_keep_sector(uuid,timestamptz,text) from public,anon;
grant execute on function private.explorer_keep_sector(uuid,timestamptz,text),public.customer_explorer_keep_sector(uuid,timestamptz,text) to authenticated;
