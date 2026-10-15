-- Additive governance: no customer reclassification, resource approval or deletion.
-- Filename reconciled with the Supabase-applied migration history version.
alter table public.documents add column content_review jsonb not null default '{}'::jsonb
  check (jsonb_typeof(content_review)='object');

create or replace function private.guard_document_review() returns trigger
language plpgsql security invoker set search_path='' as $$
declare r jsonb; s text;
begin
  if (tg_op='INSERT' and new.content_review<>'{}'::jsonb)
     or (tg_op='UPDATE' and new.content_review is distinct from old.content_review) then
    if auth.uid() is null or not coalesce(public.is_hq_user(auth.uid()),false)
       or not coalesce(public.has_role(auth.uid(),'hq_admin'::public.app_role),false)
       or not coalesce(public.has_module_access('knowledge_base','edit'),false) then
      raise exception 'Only authorized HQ administrators can record editorial reviews.' using errcode='42501';
    end if;
    r=new.content_review; s=r->>'status';
    if s is null or s not in ('needs_review','recommended','archived') then raise exception 'Invalid editorial status.'; end if;
    if coalesce(r->>'language','')<>'' and r->>'language' not in ('en','pt','es','fr','multilingual','other') then raise exception 'Invalid editorial language.'; end if;
    if coalesce(r->>'purpose','')<>'' and r->>'purpose' not in ('Brochure','Sales presentation','Demo','User manual','Installation guide','Technical reference','Pricing & licensing','Implementation & services','Business case','Other') then raise exception 'Invalid resource purpose.'; end if;
    if s='recommended' and (nullif(btrim(r->>'display_title'),'') is null or nullif(btrim(r->>'language'),'') is null or nullif(btrim(r->>'product'),'') is null or nullif(btrim(r->>'purpose'),'') is null or nullif(btrim(r->>'version_label'),'') is null) then raise exception 'Recommended resources require all editorial fields.'; end if;
    if length(coalesce(r->>'display_title',''))>240 or length(coalesce(r->>'product',''))>240 or length(coalesce(r->>'version_label',''))>240 then raise exception 'Editorial fields exceed 240 characters.'; end if;
    new.content_review=jsonb_build_object('status',s,'display_title',btrim(coalesce(r->>'display_title','')),'language',coalesce(r->>'language',''),'product',btrim(coalesce(r->>'product','')),'purpose',coalesce(r->>'purpose',''),'version_label',btrim(coalesce(r->>'version_label','')),'reviewed_by',auth.uid(),'reviewed_at',now());
  elsif tg_op='UPDATE' and row(new.title,new.file_url,new.file_name,new.version_number) is distinct from row(old.title,old.file_url,old.file_name,old.version_number) then
    -- Source edits invalidate previous recommendations, including edits by legacy managers.
    new.content_review='{}'::jsonb;
  end if;
  return new;
end $$;
revoke all on function private.guard_document_review() from public,anon,authenticated;
create trigger guard_document_review before insert or update on public.documents
for each row execute function private.guard_document_review();

create or replace function private.guard_sector_catalogue() returns trigger
language plpgsql security invoker set search_path='' as $$
declare allowed text[]:=array[
 'Agriculture & Agribusiness','Automotive','Aviation & Aerospace','Chemicals','Construction & Engineering','Education & Research','Energy & Utilities','Facility Management / Maintenance Services','Financial Services','Fishing & Aquaculture','Food & Beverage','Healthcare & Pharma','Hospitality & Leisure','Infrastructure & Real Estate','Manufacturing','Maritime & Ports','Metalworking','Mining & Materials','Oil & Gas','Optical & Medical Devices','Other','Other Services','Packaging & Paper','Plastics, Paper & Packaging','Public Administration','Retail & Distribution','Security Services','Sport & Recreation','Telecommunications & ICT','Textile','Transport & Logistics','Waste Management & Recycling','Water & Waste Treatment',
 -- Accepted historical source labels. Not silently mapped or offered for new classifications.
 'Energy','Fleet','Food & Beverages','Infrastructures','Maintenance Providers','Metal Manufacturing','Optical','Public Institutions','Textiles'];
begin
 if tg_op='UPDATE' and new.sector is not distinct from old.sector then return new; end if;
 if nullif(btrim(new.sector),'') is not null and not (btrim(new.sector)=any(allowed)) then
   raise exception 'Sector is not in the shared catalogue. Choose an existing sector or request HQ review.' using errcode='22023';
 end if;
 new.sector=nullif(btrim(new.sector),'');
 return new;
end $$;
revoke all on function private.guard_sector_catalogue() from public,anon,authenticated;
create trigger guard_sector_catalogue before insert or update of sector on public.clients for each row execute function private.guard_sector_catalogue();
create trigger guard_sector_catalogue before insert or update of sector on public.customer_explorer_hq for each row execute function private.guard_sector_catalogue();
create trigger guard_sector_catalogue before insert or update of sector on public.customer_explorer_overrides for each row execute function private.guard_sector_catalogue();
