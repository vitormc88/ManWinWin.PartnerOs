-- One immutable annual reference per proposal family, one revision counter per reference.
-- Existing commercial payloads and their acceptance fingerprints are left intact.
lock table public.proposals in share row exclusive mode;
create temporary table proposal_numbering_before on commit drop as
select id,to_jsonb(p) as original from public.proposals p;

create table private.proposal_reference_counters (
  reference_year integer primary key check (reference_year between 1000 and 9999),
  last_value bigint not null check (last_value > 0)
);
alter table private.proposal_reference_counters enable row level security;
revoke all on private.proposal_reference_counters from public,anon,authenticated;

alter table public.proposals
  add column commercial_reference text,
  add column commercial_revision integer,
  add column commercial_root_id uuid,
  add column legacy_reference text;

create or replace function private.assign_proposal_commercial_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent_hint text;
  parent_row public.proposals%rowtype;
  ref_year integer;
  next_number bigint;
begin
  if tg_op='UPDATE' and old.commercial_reference is not null then
    -- Browser payloads cannot renumber a saved proposal, even when cloning metadata.
    new.commercial_reference:=old.commercial_reference;
    new.commercial_revision:=old.commercial_revision;
    new.commercial_root_id:=old.commercial_root_id;
    new.legacy_reference:=old.legacy_reference;
    return new;
  end if;

  parent_hint:=coalesce(nullif(new.business_config#>>'{commercial_journey,revisionOf}',''),new.parent_proposal_id::text);
  if parent_hint is null and nullif(new.business_config#>>'{commercial_journey,rootId}','') is not null
     and new.business_config#>>'{commercial_journey,rootId}'<>new.id::text then
    parent_hint:=new.business_config#>>'{commercial_journey,rootId}';
  end if;
  if parent_hint is not null then
    if parent_hint !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'INVALID_REVISION: invalid source proposal' using errcode='22023';
    end if;
    select * into parent_row from public.proposals where id=parent_hint::uuid;
    if not found or parent_row.id=new.id or parent_row.commercial_reference is null
       or parent_row.source_type is distinct from new.source_type
       or (new.source_type='client' and parent_row.client_id is distinct from new.client_id)
       or (new.source_type='deal' and parent_row.deal_id is distinct from new.deal_id)
       or (new.source_type='renewal' and parent_row.renewal_id is distinct from new.renewal_id) then
      raise exception 'INVALID_REVISION: source must belong to the same client, opportunity or renewal' using errcode='22023';
    end if;
    -- Serialise sibling revisions, including simultaneous revisions of an older version.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('proposal-reference:'||parent_row.commercial_root_id::text,0));
    new.commercial_reference:=parent_row.commercial_reference;
    new.commercial_root_id:=parent_row.commercial_root_id;
    select coalesce(max(p.commercial_revision),0)+1 into new.commercial_revision
      from public.proposals p where p.commercial_root_id=new.commercial_root_id;
  else
    -- Historical rows retain their creation year; new proposals use the database year.
    ref_year:=case when tg_op='UPDATE' then extract(year from coalesce(new.created_at,now()) at time zone 'UTC')::int
      else extract(year from current_timestamp at time zone 'UTC')::int end;
    insert into private.proposal_reference_counters(reference_year,last_value) values(ref_year,1)
      on conflict(reference_year) do update set last_value=private.proposal_reference_counters.last_value+1
      returning last_value into next_number;
    new.commercial_reference:='MWW-'||ref_year||'-'||lpad(next_number::text,greatest(4,length(next_number::text)),'0');
    new.commercial_revision:=1;
    new.commercial_root_id:=new.id;
  end if;
  new.legacy_reference:=case when tg_op='UPDATE' then
    'MWW-'||upper(left(replace(coalesce(nullif(new.business_config#>>'{commercial_journey,rootId}',''),new.id::text),'-',''),8))
    ||' · r'||coalesce(nullif(new.business_config#>>'{commercial_journey,revision}',''),'1')||' · v'||coalesce(new.version,1)
    else null end;
  return new;
end;
$$;
revoke all on function private.assign_proposal_commercial_reference() from public,anon,authenticated;
create trigger trg_c_proposal_commercial_reference before insert or update on public.proposals
for each row execute function private.assign_proposal_commercial_reference();

-- Preserve the original edit timestamps and fingerprint metadata after existing triggers.
-- Financial/status guards stay enabled; the exclusive writer lock scopes this to backfill.
create function pg_temp.preserve_proposal_numbering_metadata() returns trigger
language plpgsql set search_path='' as $$
begin
  new.updated_at:=old.updated_at;
  new.commercial_fingerprint:=old.commercial_fingerprint;
  return new;
end;
$$;
create trigger zzz_proposal_numbering_backfill before update of commercial_reference on public.proposals
for each row execute function pg_temp.preserve_proposal_numbering_metadata();
do $$
declare p record; processed integer;
begin
  loop
    processed:=0;
    for p in
      select candidate.id from public.proposals candidate
      cross join lateral (select coalesce(nullif(candidate.business_config#>>'{commercial_journey,revisionOf}',''),
        candidate.parent_proposal_id::text,
        nullif(nullif(candidate.business_config#>>'{commercial_journey,rootId}',''),candidate.id::text)) as parent_id) link
      where candidate.commercial_reference is null and (link.parent_id is null or exists
        (select 1 from public.proposals parent where parent.id::text=link.parent_id and parent.commercial_reference is not null))
      order by candidate.created_at,candidate.id
    loop
      update public.proposals set commercial_reference=null where id=p.id;
      processed:=processed+1;
    end loop;
    exit when not exists(select 1 from public.proposals where commercial_reference is null);
    if processed=0 then raise exception 'INVALID_REVISION: unresolved or cyclic proposal history'; end if;
  end loop;
end;
$$;
drop trigger zzz_proposal_numbering_backfill on public.proposals;
drop function pg_temp.preserve_proposal_numbering_metadata();

alter table public.proposals
  alter column commercial_reference set not null,
  alter column commercial_revision set not null,
  alter column commercial_root_id set not null,
  add constraint proposals_commercial_revision_positive check(commercial_revision>0),
  add constraint proposals_commercial_reference_format check(commercial_reference ~ '^MWW-[0-9]{4}-[0-9]{4,}$'),
  add constraint proposals_commercial_reference_revision_key unique(commercial_reference,commercial_revision);
create index proposals_commercial_root_idx on public.proposals(commercial_root_id);
comment on column public.proposals.commercial_reference is 'Immutable server-issued annual proposal reference, shared by explicit revisions.';
comment on column public.proposals.commercial_revision is 'Single customer-visible revision, independent of the legacy per-entity version.';
comment on column public.proposals.legacy_reference is 'Original reference retained for matching previously issued documents.';

do $$
begin
  if exists(select 1 from public.proposals p join proposal_numbering_before b using(id)
    where to_jsonb(p)-array['commercial_reference','commercial_revision','commercial_root_id','legacy_reference'] is distinct from b.original) then
    raise exception 'Numbering migration must not change existing proposal content, status or timestamps';
  end if;
end;
$$;
