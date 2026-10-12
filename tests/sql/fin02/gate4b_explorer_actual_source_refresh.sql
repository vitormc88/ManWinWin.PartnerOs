-- Gate4B: selected source-required columns in a disposable PostgreSQL 17.
-- The refresh() function and trigger wrapper below are EXACT from TEST PGDMP.
-- Table fixtures are synthetic, not a full restored Supabase database.
CREATE SCHEMA private;
CREATE TABLE private.customer_explorer_rollout (
 singleton boolean DEFAULT true NOT NULL PRIMARY KEY,
 mode text DEFAULT 'hq' NOT NULL CHECK (mode IN ('off','hq','pilot','all')),
 pilot_user_ids uuid[] DEFAULT '{}' NOT NULL,
 changed_at timestamptz DEFAULT now() NOT NULL,
 sync_failed_at timestamptz,
 sync_error_code text, CHECK(singleton));
INSERT INTO private.customer_explorer_rollout(singleton,mode) VALUES(true,'hq');
CREATE TABLE public.partners (id uuid PRIMARY KEY,company_name text,primary_contact_name text,primary_contact_email text);
CREATE TABLE public.clients (
 id uuid PRIMARY KEY, client_code text NOT NULL UNIQUE, commercial_name text,short_name text,
 country text,sector text,status text NOT NULL DEFAULT 'Active',
 is_inactive boolean NOT NULL DEFAULT false,is_hq_direct boolean NOT NULL DEFAULT false,
 partner_uuid uuid REFERENCES public.partners(id));
CREATE TABLE public.customer_explorer_overrides(
 client_id uuid PRIMARY KEY,sector text,visible boolean,evidence_status text,
 validated_at timestamptz,validated_by uuid);
CREATE TABLE public.customer_explorer_hq(
 id uuid PRIMARY KEY,client_id text NOT NULL,client_key text NOT NULL,
 name text NOT NULL,country text,sector text,active boolean NOT NULL DEFAULT true,
 visible boolean NOT NULL DEFAULT true,evidence_status text NOT NULL DEFAULT 'unconfirmed',
 validated_at timestamptz,validated_by uuid);
CREATE TABLE public.customer_explorer_directory (
 id uuid NOT NULL PRIMARY KEY,client_id text NOT NULL,client_key text NOT NULL UNIQUE,
 name text NOT NULL,country text,sector text,active boolean,partner text NOT NULL,
 contact_name text NOT NULL,contact_email text,
 source_kind text NOT NULL CHECK(source_kind IN ('partner','hq')),
 source_id uuid NOT NULL,visible boolean NOT NULL,evidence_status text NOT NULL,
 evidence_note text,validated_at timestamptz,validated_by uuid,
 synced_at timestamptz DEFAULT now() NOT NULL);

-- BEGIN EXACT ORIGINAL TEST REFRESH; body from PGDMP FUNCTION entry 783.
CREATE FUNCTION private.refresh_customer_explorer() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('customer-explorer-refresh'));
 delete from public.customer_explorer_directory where id is not null;
 insert into public.customer_explorer_directory
 (id,client_id,client_key,name,country,sector,active,partner,contact_name,contact_email,source_kind,source_id,visible,evidence_status,evidence_note,validated_at,validated_by)
 select c.id,c.client_code,coalesce(nullif(ltrim(c.client_code,'0'),''),'0'),
   coalesce(nullif(c.commercial_name,''),c.short_name),c.country,
   case when o.client_id is not null then o.sector else c.sector end,
   (c.status='Active' and not coalesce(c.is_inactive,false)),
   case when c.is_hq_direct then 'ManWinWin' else coalesce(p.company_name,'ManWinWin') end,
   case when c.is_hq_direct then 'Customer Care' else coalesce(nullif(p.primary_contact_name,''),'Customer Care') end,
   case when c.is_hq_direct then 'customercare@manwinwin.com' else nullif(p.primary_contact_email,'') end,
   'partner',c.id,coalesce(o.visible,true),coalesce(o.evidence_status,'unconfirmed'),null,o.validated_at,o.validated_by
 from public.clients c left join public.partners p on p.id=c.partner_uuid
 left join public.customer_explorer_overrides o on o.client_id=c.id
 where c.status is distinct from 'Archived' and c.client_code ~ '^[0-9]+$'
   and coalesce(nullif(ltrim(c.client_code,'0'),''),'0') not in ('0','9998');
 insert into public.customer_explorer_directory
 (id,client_id,client_key,name,country,sector,active,partner,contact_name,contact_email,source_kind,source_id,visible,evidence_status,evidence_note,validated_at,validated_by)
 select h.id,h.client_id,h.client_key,h.name,h.country,h.sector,h.active,'ManWinWin','Customer Care','customercare@manwinwin.com',
   'hq',h.id,h.visible,h.evidence_status,null,h.validated_at,h.validated_by
 from public.customer_explorer_hq h
 where not exists(select 1 from public.clients c where c.client_code ~ '^[0-9]+$' and coalesce(nullif(ltrim(c.client_code,'0'),''),'0')=h.client_key);
end; $_$;
-- END EXACT ORIGINAL REFRESH.
-- BEGIN EXACT ORIGINAL TEST SYNC WRAPPER; PGDMP FUNCTION entry 784.
CREATE FUNCTION private.sync_customer_explorer_directory() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if tg_table_schema='public' and tg_table_name in ('clients','partners') then
  if exists(select 1 from private.customer_explorer_rollout where singleton and mode='off') then return null;end if;
  begin
   if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('customer-explorer-refresh')) then
    raise exception 'Explorer refresh busy' using errcode='55P03';
   end if;
   perform private.refresh_customer_explorer();
  exception when others then
   -- Retain only SQLSTATE, never client details or internal error messages.
   update private.customer_explorer_rollout set mode='off',sync_failed_at=now(),
    sync_error_code=sqlstate,changed_at=now() where singleton;
  end;
 else
  perform private.refresh_customer_explorer();
 end if;
 return null;
end; $$;
CREATE TRIGGER customer_explorer_clients_sync
 AFTER INSERT OR DELETE OR UPDATE ON public.clients FOR EACH STATEMENT
 EXECUTE FUNCTION private.sync_customer_explorer_directory();
CREATE TRIGGER customer_explorer_partners_sync
 AFTER INSERT OR DELETE OR UPDATE ON public.partners FOR EACH STATEMENT
 EXECUTE FUNCTION private.sync_customer_explorer_directory();
-- END EXACT ORIGINAL SYNC WRAPPER.
