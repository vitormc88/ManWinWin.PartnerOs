ALTER TABLE public.academy_modules ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'beginner';
ALTER TABLE public.academy_resources ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.academy_resources ADD COLUMN IF NOT EXISTS external_url text;
ALTER TABLE public.academy_resources ADD COLUMN IF NOT EXISTS version text;
ALTER TABLE public.academy_mission_progress ADD COLUMN IF NOT EXISTS checklist_state jsonb NOT NULL DEFAULT '{}'::jsonb;