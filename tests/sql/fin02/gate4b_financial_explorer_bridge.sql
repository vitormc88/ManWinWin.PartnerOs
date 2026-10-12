-- Gate4B Cross-domain: original TEST refresh body + wrapper over the
-- existing original-source FIN02 E2E financial catalog (synthetic rows only).
-- Source-required Explorer structures below have exact fields/constraints
-- required by the 2026-10-12 TEST function, but not full 2446-object clone.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.customer_explorer_rollout(
 singleton boolean PRIMARY KEY DEFAULT true,
 mode text NOT NULL DEFAULT 'hq' CHECK(mode IN ('off','hq','pilot','all')),
 pilot_user_ids uuid[] DEFAULT '{}' NOT NULL,
 sync_failed_at timestamptz,
 sync_error_code text,
 changed_at timestamptz DEFAULT now()
);
INSERT INTO private.customer_explorer_rollout(singleton,mode) VALUES(true,'hq');
ALTER TABLE public.partners ADD COLUMN company_name text;
ALTER TABLE public.partners ADD COLUMN primary_contact_name text;
ALTER TABLE public.partners ADD COLUMN primary_contact_email text;
CREATE TABLE public.customer_explorer_overrides (
 client_id uuid PRIMARY KEY,sector text,visible boolean,
 evidence_status text,validated_at timestamptz,validated_by uuid
);
CREATE TABLE public.customer_explorer_hq (
 id uuid PRIMARY KEY,client_id text NOT NULL,client_key text NOT NULL,
 name text NOT NULL,country text,sector text,active boolean NOT NULL DEFAULT true,
 visible boolean NOT NULL DEFAULT true,evidence_status text NOT NULL DEFAULT 'unconfirmed',
 validated_at timestamptz,validated_by uuid
);
CREATE TABLE public.customer_explorer_directory (
 id uuid NOT NULL PRIMARY KEY,client_id text NOT NULL,client_key text NOT NULL UNIQUE,
 name text NOT NULL,country text,sector text,active boolean,partner text NOT NULL,
 contact_name text NOT NULL,contact_email text,
 source_kind text NOT NULL CHECK(source_kind IN ('partner','hq')),
 source_id uuid NOT NULL,visible boolean NOT NULL,evidence_status text NOT NULL,
 evidence_note text,validated_at timestamptz,validated_by uuid,
 synced_at timestamptz DEFAULT now() NOT NULL
);
-- Guarantee at least one independently visible synthetic HQ record even if
-- all financial awards generate nonnumeric client_code (which TEST deliberately
-- excludes from the partner-source directory).
INSERT INTO public.customer_explorer_hq
 (id,client_id,client_key,name,country,sector,active)
VALUES ('00000000-0000-4000-8000-000000000889','889','889',
        'Fictional HQ Explorer Reference','PT','Services',true);
