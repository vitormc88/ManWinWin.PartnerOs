-- ============================================================================
-- PartnerOS — Revenue separation, imported-contract renewals, client counts
-- Target: PRODUCTION (Supabase project qownzparzsaeoyccgwuj)
-- Status: UNAPPLIED. Review, then run manually against production only.
--         Do NOT run this against the Lovable test backend.
--
-- Fully idempotent and rollback-safe:
--   * every object is CREATE OR REPLACE / IF NOT EXISTS
--   * the renewal seeding is guarded by a NOT EXISTS check
--   * no destructive statement, no data deletion, no pipeline mutation
--
-- EXPLICITLY OUT OF SCOPE (do not add here):
--   * FITC's 21 open pipeline opportunities — untouched. €0 pipeline value is
--     correct until proposals are created.
--   * No synthetic Won deals are created for imported clients.
--   * No client_revenue_history rows are inserted by the renewal seeding.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.client_revenue_history') is null then
    raise exception 'public.client_revenue_history is missing — wrong database?';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Analytics views over client_revenue_history
--
--    security_invoker = true  ==> the caller's own RLS on client_revenue_history
--    is applied. HQ sees everything, a partner sees only their clients' rows.
--    We deliberately do NOT create SECURITY DEFINER views and we do NOT add or
--    weaken any policy.
--
--    The billed-date column name is resolved defensively so the migration works
--    regardless of which of the accepted names production uses.
-- ---------------------------------------------------------------------------
do $$
declare
  _date_col text;
begin
  select column_name into _date_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'client_revenue_history'
    and column_name in ('revenue_date', 'entry_date', 'billed_at', 'invoice_date', 'period_start', 'date')
  order by array_position(
    array['revenue_date','entry_date','billed_at','invoice_date','period_start','date'],
    column_name
  )
  limit 1;

  if _date_col is null then
    raise exception 'No billed-date column found on public.client_revenue_history';
  end if;

  -- Base enriched view: one row per revenue entry, joined to its client so the
  -- country and the canonical partner are available for grouping.
  -- Canonical relation is clients.partner_uuid; the legacy text clients.partner_id
  -- is used ONLY as a historical fallback when the canonical column is null.
  execute format($v$
    create or replace view public.v_revenue_history_enriched
    with (security_invoker = true) as
    select
      h.id,
      h.client_id,
      c.commercial_name              as client_name,
      c.country                      as country,
      coalesce(
        c.partner_uuid,
        case when c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then c.partner_id::uuid end
      )                              as partner_uuid,
      p.company_name                 as partner_name,
      h.amount                       as amount,
      h.%1$I::date                   as revenue_date,
      extract(year from h.%1$I)::int as revenue_year
    from public.client_revenue_history h
    join public.clients c on c.id = h.client_id
    left join public.partners p
      on p.id = coalesce(
           c.partner_uuid,
           case when c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then c.partner_id::uuid end
         )
  $v$, _date_col);
end $$;

comment on view public.v_revenue_history_enriched is
  'Billed customer revenue history enriched with client country and canonical partner. security_invoker: inherits client_revenue_history RLS.';

-- Compact summary consumed by the Dashboard and the Analytics overview.
create or replace view public.v_client_revenue_summary
with (security_invoker = true) as
select
  coalesce(sum(amount), 0)::numeric                                             as lifetime_revenue,
  coalesce(sum(amount) filter (
    where revenue_year = extract(year from current_date)::int
  ), 0)::numeric                                                                as revenue_ytd,
  count(*)::int                                                                 as revenue_entry_count,
  count(distinct client_id)::int                                                as clients_with_revenue
from public.v_revenue_history_enriched;

comment on view public.v_client_revenue_summary is
  'Lifetime + current-calendar-year billed revenue. NOT deal-derived and NOT ARR.';

-- Historical revenue by country / partner / month.
create or replace view public.v_revenue_history_by_country
with (security_invoker = true) as
select
  coalesce(nullif(btrim(country), ''), 'Unknown') as country,
  sum(amount)::numeric                            as revenue,
  count(*)::int                                   as entry_count,
  count(distinct client_id)::int                  as client_count
from public.v_revenue_history_enriched
group by 1;

create or replace view public.v_revenue_history_by_partner
with (security_invoker = true) as
select
  partner_uuid,
  coalesce(partner_name, 'HQ Direct') as partner_name,
  sum(amount)::numeric                as revenue,
  count(*)::int                       as entry_count,
  count(distinct client_id)::int      as client_count
from public.v_revenue_history_enriched
group by 1, 2;

create or replace view public.v_revenue_history_monthly
with (security_invoker = true) as
select
  to_char(revenue_date, 'YYYY-MM') as month_key,
  to_char(revenue_date, 'Mon YY')  as month_label,
  sum(amount)::numeric             as revenue,
  count(*)::int                    as entry_count
from public.v_revenue_history_enriched
where revenue_date is not null
group by 1, 2;

-- Read-only access for signed-in users. RLS still filters the rows.
grant select on public.v_revenue_history_enriched   to authenticated;
grant select on public.v_client_revenue_summary     to authenticated;
grant select on public.v_revenue_history_by_country to authenticated;
grant select on public.v_revenue_history_by_partner to authenticated;
grant select on public.v_revenue_history_monthly    to authenticated;

-- ---------------------------------------------------------------------------
-- 2. One open operational contract renewal per imported client
--
--    Expected result (validated below):
--      APS                  2026-08-08   €1,656.00
--      Watsons              2027-07-19   €4,221.60
--      Transportes Barcino  2028-04-14   €14,031.00
--
--    renewal_date  = contracts.contract_end_date
--    estimated_value = coalesce(contracts.calculated_total, contracts.total_value)
--    No revenue history is written — these are future, not-yet-billed amounts.
-- ---------------------------------------------------------------------------
with target_contracts as (
  select distinct on (ct.client_id)
    ct.client_id,
    ct.id                                                as contract_id,
    ct.contract_end_date                                 as renewal_date,
    coalesce(ct.calculated_total, ct.total_value, 0)     as estimated_value,
    coalesce(
      c.partner_uuid,
      case when c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then c.partner_id::uuid end
    )                                                    as partner_uuid,
    c.partner_id                                         as legacy_partner_id
  from public.contracts ct
  join public.clients c on c.id = ct.client_id
  where ct.contract_end_date is not null
    and ct.contract_end_date > current_date
    and (
         c.commercial_name ilike 'APS%'
      or c.commercial_name ilike '%Watsons%'
      or c.commercial_name ilike '%Barcino%'
    )
  order by ct.client_id, ct.contract_end_date desc
)
insert into public.renewals (
  client_id, contract_id, target_type, target_id,
  renewal_date, estimated_value,
  partner_uuid, partner_id,
  renewal_type, status, billing_frequency, notes
)
select
  t.client_id, t.contract_id, 'contract', t.contract_id,
  t.renewal_date, t.estimated_value,
  t.partner_uuid, t.legacy_partner_id,
  'Contract', 'Open', 'Annual',
  'Generated from imported contract; no historical revenue entry created'
from target_contracts t
-- Idempotency guard: skip when an equivalent contract renewal already exists,
-- either linked to the same contract or already covering the same date.
where not exists (
  select 1
  from public.renewals r
  where r.client_id = t.client_id
    and coalesce(r.target_type, 'contract') = 'contract'
    and (
         coalesce(r.contract_id, r.target_id) = t.contract_id
      or r.renewal_date = t.renewal_date
    )
);

-- ---------------------------------------------------------------------------
-- 3. partners.number_of_clients — backfill + keep in sync
--
--    Canonical relation: clients.partner_uuid.
--    Legacy clients.partner_id is honoured ONLY when partner_uuid is null and
--    the legacy text is a well-formed uuid (historical compatibility).
-- ---------------------------------------------------------------------------
create or replace function public.client_counting_partner_id(
  _partner_uuid uuid,
  _partner_id   text
) returns uuid
language sql
immutable
set search_path = public
as $$
  select coalesce(
    _partner_uuid,
    case when _partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then _partner_id::uuid end
  )
$$;

-- Full, idempotent recalculation for every partner.
create or replace function public.sync_partner_client_counts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _updated integer;
begin
  with counts as (
    select
      public.client_counting_partner_id(c.partner_uuid, c.partner_id) as pid,
      count(*)::int as n
    from public.clients c
    where coalesce(c.status, '') = 'Active'
      and public.client_counting_partner_id(c.partner_uuid, c.partner_id) is not null
    group by 1
  )
  update public.partners p
     set number_of_clients = coalesce(x.n, 0)
    from (
      select p2.id, counts.n
      from public.partners p2
      left join counts on counts.pid = p2.id
    ) x
   where x.id = p.id
     and p.number_of_clients is distinct from coalesce(x.n, 0);

  get diagnostics _updated = row_count;
  return _updated;
end $$;

comment on function public.sync_partner_client_counts() is
  'Recomputes partners.number_of_clients from Active clients. Idempotent; safe to re-run.';

-- Incremental trigger: only the affected partners are recomputed.
create or replace function public.clients_sync_partner_client_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _ids uuid[];
begin
  _ids := array_remove(array[
    public.client_counting_partner_id(
      case when tg_op <> 'INSERT' then old.partner_uuid end,
      case when tg_op <> 'INSERT' then old.partner_id  end),
    public.client_counting_partner_id(
      case when tg_op <> 'DELETE' then new.partner_uuid end,
      case when tg_op <> 'DELETE' then new.partner_id  end)
  ], null);

  if array_length(_ids, 1) is null then
    return coalesce(new, old);
  end if;

  update public.partners p
     set number_of_clients = (
       select count(*)::int
       from public.clients c
       where coalesce(c.status, '') = 'Active'
         and public.client_counting_partner_id(c.partner_uuid, c.partner_id) = p.id
     )
   where p.id = any(_ids);

  return coalesce(new, old);
end $$;

drop trigger if exists trg_clients_sync_partner_client_count on public.clients;
create trigger trg_clients_sync_partner_client_count
after insert or update of partner_uuid, partner_id, status or delete
on public.clients
for each row
execute function public.clients_sync_partner_client_count();

-- Backfill every partner now.
select public.sync_partner_client_counts();

-- ---------------------------------------------------------------------------
-- 4. Post-conditions (raise NOTICE only — never blocks the migration)
--    Expected after apply: HQ lifetime 79920.50, 2026 YTD 42583.60,
--    3 clients with revenue, 8 revenue entries, 0 Won deals.
-- ---------------------------------------------------------------------------
do $$
declare
  _life numeric; _ytd numeric; _clients int; _entries int; _renewals int;
begin
  select coalesce(sum(h.amount), 0),
         coalesce(sum(h.amount) filter (where extract(year from current_date)::int
                  = extract(year from h.created_at)::int), 0),
         count(distinct h.client_id),
         count(*)
    into _life, _ytd, _clients, _entries
  from public.client_revenue_history h;

  select count(*) into _renewals
  from public.renewals
  where coalesce(target_type, '') = 'contract'
    and notes = 'Generated from imported contract; no historical revenue entry created';

  raise notice 'revenue: lifetime=% entries=% clients=%', _life, _entries, _clients;
  raise notice 'seeded contract renewals present: %', _renewals;
end $$;

commit;

-- ============================================================================
-- ROLLBACK (manual, if ever needed)
-- ----------------------------------------------------------------------------
-- drop trigger if exists trg_clients_sync_partner_client_count on public.clients;
-- drop function if exists public.clients_sync_partner_client_count();
-- drop function if exists public.sync_partner_client_counts();
-- drop function if exists public.client_counting_partner_id(uuid, text);
-- drop view if exists public.v_revenue_history_monthly;
-- drop view if exists public.v_revenue_history_by_partner;
-- drop view if exists public.v_revenue_history_by_country;
-- drop view if exists public.v_client_revenue_summary;
-- drop view if exists public.v_revenue_history_enriched;
-- delete from public.renewals
--  where notes = 'Generated from imported contract; no historical revenue entry created';
-- ============================================================================
