
-- Add status column to incoming_leads
ALTER TABLE public.incoming_leads 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'New';

-- Update RLS: allow partner users to SELECT their own leads
DROP POLICY IF EXISTS "incoming_leads_select" ON public.incoming_leads;
CREATE POLICY "incoming_leads_select" ON public.incoming_leads
FOR SELECT TO authenticated
USING (
  is_hq_user(auth.uid())
  OR (
    linked_partner_id IS NOT NULL
    AND linked_partner_id = get_user_partner_id(auth.uid())
  )
);

-- Allow partner users to UPDATE only their own leads (status + notes)
DROP POLICY IF EXISTS "incoming_leads_update" ON public.incoming_leads;
CREATE POLICY "incoming_leads_update" ON public.incoming_leads
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'hq_admin'::app_role)
  OR has_role(auth.uid(), 'hq_standard'::app_role)
  OR (
    linked_partner_id IS NOT NULL
    AND linked_partner_id = get_user_partner_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'hq_admin'::app_role)
  OR has_role(auth.uid(), 'hq_standard'::app_role)
  OR (
    linked_partner_id IS NOT NULL
    AND linked_partner_id = get_user_partner_id(auth.uid())
  )
);
