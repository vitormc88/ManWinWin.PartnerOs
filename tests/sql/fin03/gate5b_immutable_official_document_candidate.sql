-- FIN03 Gate5B — LAB-ONLY immutable official document ledger proof.
-- NOT a Supabase migration, does not upload real DOCX/PDF, no live storage.
-- PostgreSQL 17 synthetic fixture models trusted object bytes + archived
-- snapshot metadata. Actual auth/Storage RLS and crash recovery remain untested.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $roles$;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
 SET search_path TO '' AS $$
 SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.proposals(
 id uuid PRIMARY KEY,source_anchor_id uuid NOT NULL,owner_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>=1),
 status text NOT NULL CHECK(status IN ('Draft','Ready','Sent','Accepted','Won')),
 commercial_fingerprint text NOT NULL,
 product_family text NOT NULL DEFAULT 'Business'
);
-- In real TEST this fingerprint comes from approved commercial lifecycle logic,
-- NOT a request-supplied field. Here seeded by a trusted synthetic fixture.
INSERT INTO public.proposals(id,source_anchor_id,owner_id,version,status,commercial_fingerprint)
VALUES
 ('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000301',1,'Ready','synthetic-commercial-v1-fingerprint'),
 ('00000000-0000-4000-8000-000000000502','00000000-0000-4000-8000-000000000402','00000000-0000-4000-8000-000000000302',1,'Ready','other-partner-v1');
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.proposals TO authenticated;
CREATE POLICY proposal_owner_read ON public.proposals FOR SELECT TO authenticated
 USING(owner_id=auth.uid());

-- Pretends an upload completed successfully; no real Supabase Storage bytes.
-- Only privileged/test runner can insert files. Browser roles get NO access.
CREATE TABLE private.fictional_uploaded_objects(
 object_key text PRIMARY KEY,
 bytes bytea NOT NULL,
 uploaded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION private.gate5b_write_once() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
 RAISE EXCEPTION 'FIN03_IMMUTABLE_OBJECT_OR_RECORD' USING ERRCODE='42501';
END $$;
CREATE TRIGGER prevent_object_overwrite
 BEFORE UPDATE OR DELETE ON private.fictional_uploaded_objects
 FOR EACH ROW EXECUTE FUNCTION private.gate5b_write_once();

CREATE TABLE public.proposal_document_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 proposal_id uuid NOT NULL REFERENCES public.proposals(id),
 proposal_version integer NOT NULL CHECK(proposal_version>=1),
 kind text NOT NULL CHECK(kind IN ('docx','pdf')),
 commercial_fingerprint text NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 object_key text NOT NULL UNIQUE,
 mime_type text NOT NULL,
 byte_count bigint NOT NULL CHECK(byte_count>0),
 published_by uuid NOT NULL,
 published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT fin03_one_official_artifact_per_version_kind
  UNIQUE(proposal_id,proposal_version,kind)
);
ALTER TABLE public.proposal_document_snapshots ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER prevent_official_snapshot_mutation
 BEFORE UPDATE OR DELETE ON public.proposal_document_snapshots
 FOR EACH ROW EXECUTE FUNCTION private.gate5b_write_once();
REVOKE ALL ON public.proposal_document_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.proposal_document_snapshots TO authenticated;
CREATE POLICY doc_owner_read ON public.proposal_document_snapshots
 FOR SELECT TO authenticated
 USING(EXISTS (SELECT 1 FROM public.proposals p WHERE p.id=proposal_id
  AND p.owner_id=auth.uid()));
-- Browser users cannot write snapshot table. Only an approved publication
-- function with explicit authorization and file-content checks may append.
CREATE FUNCTION public.publish_official_proposal_document_lab(
 _proposal_id uuid,_expected_version integer,_kind text,
 _expected_commercial_fingerprint text,_object_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 _proposal public.proposals%ROWTYPE;
 _object private.fictional_uploaded_objects%ROWTYPE;
 _actor uuid;
 _sha text;
 _mime text;
 _canonical_key text;
 _existing public.proposal_document_snapshots%ROWTYPE;
 _new uuid;
BEGIN
 _actor:=auth.uid();
 IF _actor IS NULL THEN RAISE EXCEPTION 'FIN03_ACTOR_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO _proposal FROM public.proposals WHERE id=_proposal_id FOR SHARE;
 IF NOT FOUND OR _proposal.owner_id IS DISTINCT FROM _actor
  THEN RAISE EXCEPTION 'FIN03_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF _proposal.status NOT IN ('Ready','Sent','Accepted','Won')
  OR _proposal.version IS DISTINCT FROM _expected_version
  OR _proposal.commercial_fingerprint IS DISTINCT FROM _expected_commercial_fingerprint
  OR _kind NOT IN ('docx','pdf') OR _kind IS NULL
  THEN RAISE EXCEPTION 'FIN03_UNAPPROVED_OR_STALE_VERSION' USING ERRCODE='23514'; END IF;
 SELECT * INTO _object FROM private.fictional_uploaded_objects
 WHERE object_key=_object_key;
 IF NOT FOUND OR length(_object.bytes)=0
  THEN RAISE EXCEPTION 'FIN03_FILE_MISSING_OR_EMPTY' USING ERRCODE='23514'; END IF;
 _sha:=pg_catalog.encode(public.digest(_object.bytes,'sha256'),'hex');
 _mime:=CASE _kind WHEN 'docx'
  THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ELSE 'application/pdf' END;
 _canonical_key:=_proposal.source_anchor_id::text||'/'||_proposal.id::text
   ||'/official/v'||_expected_version::text||'/'||_kind||'/'||_sha||'.'||_kind;
 IF _object_key IS DISTINCT FROM _canonical_key
  THEN RAISE EXCEPTION 'FIN03_WRONG_PATH_OR_CONTENT_HASH' USING ERRCODE='23514'; END IF;
 SELECT * INTO _existing FROM public.proposal_document_snapshots
 WHERE proposal_id=_proposal_id AND proposal_version=_expected_version AND kind=_kind
 FOR SHARE;
 IF FOUND THEN
  IF _existing.object_key IS DISTINCT FROM _object_key
    OR _existing.sha256 IS DISTINCT FROM _sha
    OR _existing.commercial_fingerprint IS DISTINCT FROM _expected_commercial_fingerprint
    THEN RAISE EXCEPTION 'FIN03_OFFICIAL_REVISION_ALREADY_PUBLISHED' USING ERRCODE='23505'; END IF;
  RETURN _existing.id; -- lost HTTP response retry: exact same bytes/metadata
 END IF;
 INSERT INTO public.proposal_document_snapshots(
   proposal_id,proposal_version,kind,commercial_fingerprint,
   sha256,object_key,mime_type,byte_count,published_by)
 VALUES(_proposal_id,_expected_version,_kind,_proposal.commercial_fingerprint,
        _sha,_object_key,_mime,length(_object.bytes),_actor)
 RETURNING id INTO _new;
 RETURN _new;
END $fn$;
REVOKE ALL ON FUNCTION public.publish_official_proposal_document_lab(uuid,integer,text,text,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_official_proposal_document_lab(uuid,integer,text,text,text)
 TO authenticated;
