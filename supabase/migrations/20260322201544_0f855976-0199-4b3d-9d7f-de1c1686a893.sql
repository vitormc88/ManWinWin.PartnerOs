-- Ensure HQ admins can delete profiles (for cleanup)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_delete_admin'
  ) THEN
    CREATE POLICY profiles_delete_admin ON public.profiles FOR DELETE TO authenticated
    USING (has_role(auth.uid(), 'hq_admin'::app_role));
  END IF;
END $$;

-- Add UPDATE/DELETE policies for training_modules (currently missing)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'training_modules' AND policyname = 'modules_update'
  ) THEN
    CREATE POLICY modules_update ON public.training_modules FOR UPDATE TO authenticated
    USING (has_role(auth.uid(), 'hq_admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'hq_admin'::app_role));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'training_modules' AND policyname = 'modules_delete'
  ) THEN
    CREATE POLICY modules_delete ON public.training_modules FOR DELETE TO authenticated
    USING (has_role(auth.uid(), 'hq_admin'::app_role));
  END IF;
END $$;