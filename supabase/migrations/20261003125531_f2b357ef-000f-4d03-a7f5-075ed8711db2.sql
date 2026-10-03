-- Baseline fingerprint for proposals already past Draft (no status or value changes).
UPDATE public.proposals p
   SET commercial_fingerprint = private.proposal_commercial_fingerprint(p.id, to_jsonb(p))
 WHERE p.status IN ('Ready','Sent','Accepted','Won')
   AND p.commercial_fingerprint IS NULL;