-- FIN03 Gate5B — fictional immutable DOCX/PDF metadata and object-byte tests.
\set ON_ERROR_STOP on
-- Synthetic bytes (NOT actual Office/PDF files) used only to prove lifecycle,
-- hashing, storage-object identity and RLS. Rendering/output not verified.
INSERT INTO private.fictional_uploaded_objects(object_key,bytes)
SELECT
 '00000000-0000-4000-8000-000000000401/00000000-0000-4000-8000-000000000501/official/v1/docx/'
 || encode(digest(convert_to('FICTITIOUS DOCX A V1','UTF8'),'sha256'),'hex') || '.docx',
 convert_to('FICTITIOUS DOCX A V1','UTF8')
UNION ALL
SELECT
 '00000000-0000-4000-8000-000000000401/00000000-0000-4000-8000-000000000501/official/v1/pdf/'
 || encode(digest(convert_to('FICTITIOUS PDF A V1','UTF8'),'sha256'),'hex') || '.pdf',
 convert_to('FICTITIOUS PDF A V1','UTF8')
UNION ALL
SELECT
 '00000000-0000-4000-8000-000000000401/00000000-0000-4000-8000-000000000501/official/v2/docx/'
 || encode(digest(convert_to('FICTITIOUS DOCX A V2','UTF8'),'sha256'),'hex') || '.docx',
 convert_to('FICTITIOUS DOCX A V2','UTF8')
UNION ALL
SELECT
 '00000000-0000-4000-8000-000000000401/00000000-0000-4000-8000-000000000501/official/v1/docx/'
 || encode(digest(convert_to('FICTITIOUS INTRUDER DIFFERENT BYTES','UTF8'),'sha256'),'hex') || '.docx',
 convert_to('FICTITIOUS INTRUDER DIFFERENT BYTES','UTF8');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',false);
-- Named arguments kept explicit to emphasize no opaque client-side uploads.
SELECT public.publish_official_proposal_document_lab(
 '00000000-0000-4000-8000-000000000501',1,'docx',
 'synthetic-commercial-v1-fingerprint',
 '00000000-0000-4000-8000-000000000401/00000000-0000-4000-8000-000000000501/official/v1/docx/' ||
 encode(digest(convert_to('FICTITIOUS DOCX A V1','UTF8'),'sha256'),'hex') || '.docx');
SELECT public.publish_official_proposal_document_lab(
 '00000000-0000-4000-8000-000000000501',1,'pdf',
 'synthetic-commercial-v1-fingerprint',
 '00000000-0000-4000-8000-000000000401/00000000-0000-4000-8000-000000000501/official/v1/pdf/' ||
 encode(digest(convert_to('FICTITIOUS PDF A V1','UTF8'),'sha256'),'hex') || '.pdf');
DO $$
DECLARE
 _id uuid;
 _again uuid;
 _blocked boolean:=false;
BEGIN
 SELECT id INTO _id FROM public.proposal_document_snapshots
 WHERE proposal_id='00000000-0000-4000-8000-000000000501'
   AND proposal_version=1 AND kind='docx';
 -- A lost HTTP response followed by same exact publish returns ORIGINAL ID.
 _again:=public.publish_official_proposal_document_lab(
  '00000000-0000-4000-8000-000000000501',1,'docx',
  'synthetic-commercial-v1-fingerprint',
  '00000000-0000-4000-8000-000000000401/00000000-0000-4000-8000-000000000501/official/v1/docx/' ||
  encode(digest(convert_to('FICTITIOUS DOCX A V1','UTF8'),'sha256'),'hex') || '.docx');
 IF _again IS DISTINCT FROM _id
 OR (SELECT count(*) FROM public.proposal_document_snapshots
  WHERE proposal_id='00000000-0000-4000-8000-000000000501')<>2
 THEN RAISE EXCEPTION 'FIN03_IDENTICAL_RETRY_DUPLICATED_OFFICIAL_DOCUMENT'; END IF;

 -- Same proposal/version/type with other bytes must NEVER overwrite original.
 BEGIN
  PERFORM public.publish_official_proposal_document_lab(
   '00000000-0000-4000-8000-000000000501',1,'docx',
   'synthetic-commercial-v1-fingerprint',
   '00000000-0000-4000-8000-000000000401/00000000-0000-4000-8000-000000000501/official/v1/docx/' ||
   encode(digest(convert_to('FICTITIOUS INTRUDER DIFFERENT BYTES','UTF8'),'sha256'),'hex') || '.docx');
 EXCEPTION WHEN unique_violation THEN _blocked:=true;
 END;
 IF NOT _blocked THEN RAISE EXCEPTION 'FIN03_SAME_OFFICIAL_VERSION_OVERWRITTEN'; END IF;
 _blocked:=false;
 -- Source revision/fingerprint must be the approved persisted one.
 BEGIN
  PERFORM public.publish_official_proposal_document_lab(
   '00000000-0000-4000-8000-000000000501',1,'pdf',
   'forged-commercial-fingerprint',
   '00000000-0000-4000-8000-000000000401/00000000-0000-4000-8000-000000000501/official/v1/pdf/' ||
   encode(digest(convert_to('FICTITIOUS PDF A V1','UTF8'),'sha256'),'hex') || '.pdf');
 EXCEPTION WHEN check_violation THEN _blocked:=true; END;
 IF NOT _blocked THEN RAISE EXCEPTION 'FIN03_FORGED_COMMERCIAL_FINGERPRINT_ACCEPTED'; END IF;
END $$;
RESET ROLE;

-- A prior official document may not be rewritten, including by table owner.
DO $$
DECLARE _blocked boolean:=false;
BEGIN
 BEGIN
  UPDATE public.proposal_document_snapshots
    SET commercial_fingerprint='forged'
   WHERE proposal_id='00000000-0000-4000-8000-000000000501';
 EXCEPTION WHEN insufficient_privilege THEN _blocked:=true; END;
 IF NOT _blocked THEN RAISE EXCEPTION 'FIN03_UPDATE_WAS_NOT_IMMUTABLE'; END IF;
 _blocked:=false;
 BEGIN
  DELETE FROM public.proposal_document_snapshots
   WHERE proposal_id='00000000-0000-4000-8000-000000000501';
 EXCEPTION WHEN insufficient_privilege THEN _blocked:=true; END;
 IF NOT _blocked THEN RAISE EXCEPTION 'FIN03_DELETE_WAS_NOT_IMMUTABLE'; END IF;
 _blocked:=false;
 BEGIN
  UPDATE private.fictional_uploaded_objects SET bytes=convert_to('overwritten','UTF8');
 EXCEPTION WHEN insufficient_privilege THEN _blocked:=true; END;
 IF NOT _blocked THEN RAISE EXCEPTION 'FIN03_STORAGE_BYTES_MUTATED'; END IF;
END $$;

-- One partner must neither READ nor publish another partner's official file.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',false);
DO $$
DECLARE _blocked boolean:=false;
BEGIN
 IF EXISTS(SELECT 1 FROM public.proposal_document_snapshots
  WHERE proposal_id='00000000-0000-4000-8000-000000000501')
 THEN RAISE EXCEPTION 'FIN03_CROSS_PARTNER_DOCUMENT_METADATA_VISIBLE'; END IF;
 BEGIN
  PERFORM public.publish_official_proposal_document_lab(
   '00000000-0000-4000-8000-000000000501',1,'docx',
   'synthetic-commercial-v1-fingerprint','forged/path');
 EXCEPTION WHEN insufficient_privilege THEN _blocked:=true; END;
 IF NOT _blocked THEN RAISE EXCEPTION 'FIN03_CROSS_PARTNER_PUBLICATION_ALLOWED'; END IF;
END $$;
RESET ROLE;

-- New commercial revision gets NEW object path and NEW official ledger entry;
-- the old v1 DOCX+PDF stay archived and accessible to same authorized owner.
UPDATE public.proposals SET version=2,status='Ready',
 commercial_fingerprint='synthetic-commercial-v2-fingerprint'
 WHERE id='00000000-0000-4000-8000-000000000501';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',false);
SELECT public.publish_official_proposal_document_lab(
 '00000000-0000-4000-8000-000000000501',2,'docx',
 'synthetic-commercial-v2-fingerprint',
 '00000000-0000-4000-8000-000000000401/00000000-0000-4000-8000-000000000501/official/v2/docx/' ||
 encode(digest(convert_to('FICTITIOUS DOCX A V2','UTF8'),'sha256'),'hex') || '.docx');
DO $$
BEGIN
 IF (SELECT count(*) FROM public.proposal_document_snapshots WHERE
  proposal_id='00000000-0000-4000-8000-000000000501')<>3
 OR (SELECT count(*) FROM public.proposal_document_snapshots
  WHERE proposal_id='00000000-0000-4000-8000-000000000501'
    AND proposal_version=1 AND commercial_fingerprint='synthetic-commercial-v1-fingerprint')<>2
 OR (SELECT count(*) FROM public.proposal_document_snapshots
  WHERE proposal_id='00000000-0000-4000-8000-000000000501'
    AND proposal_version=2 AND commercial_fingerprint='synthetic-commercial-v2-fingerprint')<>1
 THEN RAISE EXCEPTION 'FIN03_COMMERCIAL_REVISION_DESTROYED_PRIOR_OFFICIAL_DOCS'; END IF;
END $$;
RESET ROLE;
SELECT 'FIN03 Gate5B LAB PASS — immutable verified-byte paths, docx+pdf per revision, no overwrite, exact retry, scope, append-only v2' AS outcome;
