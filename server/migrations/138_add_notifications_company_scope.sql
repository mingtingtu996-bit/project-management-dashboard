-- v1.4.13 / v1.4.20: notifications must respect company workspace isolation.

ALTER TABLE IF EXISTS public.notifications
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE SET NULL;

UPDATE public.notifications n
   SET company_id = p.company_id
  FROM public.projects p
 WHERE n.company_id IS NULL
   AND n.project_id = p.id
   AND p.company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_notification_company_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.project_id IS NOT NULL THEN
    SELECT p.company_id
      INTO NEW.company_id
      FROM public.projects p
     WHERE p.id = NEW.project_id
     LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_set_company_id ON public.notifications;
CREATE TRIGGER trg_notifications_set_company_id
BEFORE INSERT OR UPDATE OF project_id, company_id ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.set_notification_company_id();

CREATE INDEX IF NOT EXISTS idx_notifications_company_created
  ON public.notifications(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_company_project_status
  ON public.notifications(company_id, project_id, status, created_at DESC);
