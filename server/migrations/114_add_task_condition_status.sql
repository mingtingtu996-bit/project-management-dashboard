BEGIN;

ALTER TABLE IF EXISTS public.task_conditions
  ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE public.task_conditions
SET status = CASE
  WHEN COALESCE(is_satisfied, FALSE) THEN '已确认'
  ELSE '未满足'
END
WHERE status IS NULL
   OR status = '';

ALTER TABLE IF EXISTS public.task_conditions
  ALTER COLUMN status SET DEFAULT '未满足';

CREATE OR REPLACE FUNCTION public.sync_task_condition_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NULL OR NEW.status = '' THEN
    NEW.status := CASE
      WHEN COALESCE(NEW.is_satisfied, FALSE) THEN '已确认'
      ELSE '未满足'
    END;
  ELSIF TG_OP = 'UPDATE' AND NEW.is_satisfied IS DISTINCT FROM OLD.is_satisfied THEN
    NEW.status := CASE
      WHEN COALESCE(NEW.is_satisfied, FALSE) THEN '已确认'
      ELSE '未满足'
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_task_condition_status ON public.task_conditions;
CREATE TRIGGER trigger_sync_task_condition_status
  BEFORE INSERT OR UPDATE OF is_satisfied, status
  ON public.task_conditions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_task_condition_status();

NOTIFY pgrst, 'reload schema';

COMMIT;
