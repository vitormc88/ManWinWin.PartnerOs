-- Tighten RLS on notifications and gate by module permission
DROP POLICY IF EXISTS "Allow all access to notifications" ON public.notifications;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view permitted notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (
  public.can_view_module(auth.uid(), 'notifications')
  AND (
    target_user_id = auth.uid()::text
    OR (
      partner_id IS NOT NULL
      AND partner_id = public.get_user_partner_id(auth.uid())::text
    )
    OR (
      target_role IS NOT NULL
      AND public.has_role(auth.uid(), target_role::public.app_role)
    )
    OR (
      target_user_id IS NULL
      AND partner_id IS NULL
      AND target_role IS NULL
      AND public.is_hq_user(auth.uid())
    )
  )
);

CREATE POLICY "Users can mark own notifications read"
ON public.notifications
FOR UPDATE
TO authenticated
USING (
  public.can_view_module(auth.uid(), 'notifications')
  AND (
    target_user_id = auth.uid()::text
    OR (
      partner_id IS NOT NULL
      AND partner_id = public.get_user_partner_id(auth.uid())::text
    )
    OR (
      target_role IS NOT NULL
      AND public.has_role(auth.uid(), target_role::public.app_role)
    )
    OR (
      target_user_id IS NULL
      AND partner_id IS NULL
      AND target_role IS NULL
      AND public.is_hq_user(auth.uid())
    )
  )
)
WITH CHECK (true);

CREATE POLICY "HQ admins can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'hq_admin'::public.app_role));

CREATE POLICY "HQ admins can delete notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'hq_admin'::public.app_role));