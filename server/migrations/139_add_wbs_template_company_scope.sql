-- v1.4.7.2 / v1.4.18 / v1.4.20: WBS templates need explicit company scope.

ALTER TABLE public.wbs_templates
  ADD COLUMN IF NOT EXISTS project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_scope TEXT NOT NULL DEFAULT 'project';

UPDATE public.wbs_templates wt
   SET company_id = p.company_id
  FROM public.projects p
 WHERE wt.company_id IS NULL
   AND wt.project_id = p.id
   AND p.company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_wbs_template_company_id()
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

DROP TRIGGER IF EXISTS trg_wbs_templates_set_company_id ON public.wbs_templates;
CREATE TRIGGER trg_wbs_templates_set_company_id
BEFORE INSERT OR UPDATE OF project_id, company_id ON public.wbs_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_wbs_template_company_id();

CREATE INDEX IF NOT EXISTS idx_wbs_templates_company_scope
  ON public.wbs_templates(company_id, catalog_scope, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wbs_templates_company_project
  ON public.wbs_templates(company_id, project_id, deleted_at);
