
-- Sprint F.1 — Task model evolution
-- Extends manual_tasks with: related_type (generic relationship), task_status (new lifecycle),
-- and a controlled task_type taxonomy. Keeps legacy `status` & related_company in sync
-- so the unified_tasks view and existing dashboards/widgets continue to work unchanged.

-- 1. New columns ------------------------------------------------------------
ALTER TABLE public.manual_tasks
  ADD COLUMN IF NOT EXISTS related_type text,
  ADD COLUMN IF NOT EXISTS task_status text NOT NULL DEFAULT 'Open';

-- 2. Backfill ---------------------------------------------------------------
-- related_type from legacy related_source (best-effort); table is currently empty
-- so this is a no-op in practice but keeps the migration idempotent.
UPDATE public.manual_tasks
   SET related_type = CASE
     WHEN related_source IN ('client','clients','customer','customers') THEN 'client'
     WHEN related_source IN ('deal','deals','pipeline','opportunity') THEN 'deal'
     WHEN related_source IN ('renewal','renewals') THEN 'renewal'
     WHEN related_source IN ('lead','leads','incoming_lead') THEN 'lead'
     WHEN related_source IN ('partner','partners') THEN 'partner'
     ELSE NULL
   END
 WHERE related_type IS NULL;

-- Companies that match a known client become client relationships.
UPDATE public.manual_tasks mt
   SET related_type = 'client',
       related_entity_id = c.id,
       related_route = COALESCE(mt.related_route, '/clients/' || c.id::text)
  FROM public.clients c
 WHERE mt.related_type IS NULL
   AND mt.related_company IS NOT NULL
   AND lower(btrim(mt.related_company)) = lower(btrim(c.commercial_name));

UPDATE public.manual_tasks
   SET related_type = 'general'
 WHERE related_type IS NULL;

-- task_status from legacy status
UPDATE public.manual_tasks
   SET task_status = CASE
     WHEN status = 'Done'         THEN 'Completed'
     WHEN status = 'In Progress'  THEN 'In Progress'
     WHEN status = 'Waiting'      THEN 'Waiting'
     ELSE 'Open'
   END;

-- 3. Constraints ------------------------------------------------------------
ALTER TABLE public.manual_tasks
  ALTER COLUMN related_type SET DEFAULT 'general',
  ALTER COLUMN related_type SET NOT NULL;

ALTER TABLE public.manual_tasks
  DROP CONSTRAINT IF EXISTS manual_tasks_related_type_check;
ALTER TABLE public.manual_tasks
  ADD CONSTRAINT manual_tasks_related_type_check
  CHECK (related_type IN ('client','deal','renewal','lead','partner','general'));

ALTER TABLE public.manual_tasks
  DROP CONSTRAINT IF EXISTS manual_tasks_task_status_check;
ALTER TABLE public.manual_tasks
  ADD CONSTRAINT manual_tasks_task_status_check
  CHECK (task_status IN ('Open','In Progress','Waiting','Completed'));

ALTER TABLE public.manual_tasks
  DROP CONSTRAINT IF EXISTS manual_tasks_task_type_check;
ALTER TABLE public.manual_tasks
  ADD CONSTRAINT manual_tasks_task_type_check
  CHECK (task_type IN ('call','email','meeting','proposal','renewal','follow_up','internal','other','manual'));

-- 4. Sync trigger -----------------------------------------------------------
-- Keep legacy `status` in lock-step with `task_status` so the unified_tasks view
-- (which still reads `status`) and any older dashboards keep working.
CREATE OR REPLACE FUNCTION public.manual_tasks_sync_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- task_status is the source of truth on insert / when it changes.
  IF TG_OP = 'INSERT' OR NEW.task_status IS DISTINCT FROM OLD.task_status THEN
    NEW.status := CASE NEW.task_status
      WHEN 'Completed'   THEN 'Done'
      WHEN 'In Progress' THEN 'In Progress'
      WHEN 'Waiting'     THEN 'Waiting'
      ELSE 'To Do'
    END;
  -- Otherwise, if legacy `status` was updated directly, mirror it back.
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.task_status := CASE NEW.status
      WHEN 'Done'        THEN 'Completed'
      WHEN 'In Progress' THEN 'In Progress'
      WHEN 'Waiting'     THEN 'Waiting'
      WHEN 'Pending'     THEN 'Open'
      WHEN 'To Do'       THEN 'Open'
      ELSE 'Open'
    END;
  END IF;

  IF NEW.task_status = 'Completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  ELSIF NEW.task_status <> 'Completed' THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_manual_tasks_sync_status ON public.manual_tasks;
CREATE TRIGGER trg_manual_tasks_sync_status
  BEFORE INSERT OR UPDATE ON public.manual_tasks
  FOR EACH ROW EXECUTE FUNCTION public.manual_tasks_sync_status();

-- 5. Helpful index ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_manual_tasks_related
  ON public.manual_tasks(related_type, related_entity_id);
