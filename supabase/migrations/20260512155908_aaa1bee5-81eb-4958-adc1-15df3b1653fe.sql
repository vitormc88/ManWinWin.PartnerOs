
-- community_posts
CREATE TABLE public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  category text NOT NULL DEFAULT 'General',
  status text NOT NULL DEFAULT 'open',
  pinned boolean NOT NULL DEFAULT false,
  created_by uuid,
  partner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  closed_at timestamptz,
  CONSTRAINT community_posts_status_chk CHECK (status IN ('open','answered','closed')),
  CONSTRAINT community_posts_category_chk CHECK (category IN ('Sales','Product','Implementation','Integrations','Marketing','Feedback','General'))
);

CREATE INDEX idx_community_posts_status ON public.community_posts(status);
CREATE INDEX idx_community_posts_pinned ON public.community_posts(pinned);
CREATE INDEX idx_community_posts_created_at ON public.community_posts(created_at DESC);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_posts_select ON public.community_posts
FOR SELECT TO authenticated
USING (public.can_view_module(auth.uid(), 'community'));

CREATE POLICY community_posts_insert ON public.community_posts
FOR INSERT TO authenticated
WITH CHECK (
  public.can_edit_module(auth.uid(), 'community')
  AND created_by = auth.uid()
);

CREATE POLICY community_posts_update ON public.community_posts
FOR UPDATE TO authenticated
USING (
  public.is_hq_user(auth.uid())
  OR (created_by = auth.uid() AND public.can_edit_module(auth.uid(), 'community'))
)
WITH CHECK (
  public.is_hq_user(auth.uid())
  OR (created_by = auth.uid() AND public.can_edit_module(auth.uid(), 'community'))
);

CREATE POLICY community_posts_delete ON public.community_posts
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'hq_admin')
  OR created_by = auth.uid()
);

CREATE TRIGGER trg_community_posts_updated
BEFORE UPDATE ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- community_comments
CREATE TABLE public.community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by uuid,
  is_official_hq_reply boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_comments_post ON public.community_comments(post_id);

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_comments_select ON public.community_comments
FOR SELECT TO authenticated
USING (public.can_view_module(auth.uid(), 'community'));

CREATE POLICY community_comments_insert ON public.community_comments
FOR INSERT TO authenticated
WITH CHECK (
  public.can_edit_module(auth.uid(), 'community')
  AND created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = community_comments.post_id
      AND (p.status <> 'closed' OR public.is_hq_user(auth.uid()))
  )
);

CREATE POLICY community_comments_update ON public.community_comments
FOR UPDATE TO authenticated
USING (
  public.is_hq_user(auth.uid())
  OR (created_by = auth.uid() AND public.can_edit_module(auth.uid(), 'community'))
)
WITH CHECK (
  public.is_hq_user(auth.uid())
  OR (created_by = auth.uid() AND public.can_edit_module(auth.uid(), 'community'))
);

CREATE POLICY community_comments_delete ON public.community_comments
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'hq_admin')
  OR created_by = auth.uid()
);

CREATE TRIGGER trg_community_comments_updated
BEFORE UPDATE ON public.community_comments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
