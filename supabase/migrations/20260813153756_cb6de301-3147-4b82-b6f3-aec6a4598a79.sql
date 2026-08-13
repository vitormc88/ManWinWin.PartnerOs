ALTER TABLE public.proposal_items DROP CONSTRAINT IF EXISTS proposal_items_change_kind_check;
ALTER TABLE public.proposal_items ADD CONSTRAINT proposal_items_change_kind_check
  CHECK (change_kind IS NULL OR change_kind = ANY (ARRAY['unchanged','plan_change','implementation_delta','access_addition']));