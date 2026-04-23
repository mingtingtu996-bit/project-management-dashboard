-- Workflow 2 cleanup: governance notifications / certificate / acceptance field contracts
-- Date: 2026-04-19

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pre_milestones'
      AND column_name = 'document_no'
  ) THEN
    UPDATE public.pre_milestones
    SET certificate_no = COALESCE(NULLIF(certificate_no, ''), NULLIF(document_no, ''));
    ALTER TABLE public.pre_milestones DROP COLUMN document_no;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acceptance_dependencies'
      AND column_name = 'dependency_kind'
  ) THEN
    UPDATE public.acceptance_dependencies
    SET dependency_kind = CASE LOWER(BTRIM(COALESCE(dependency_kind, '')))
      WHEN 'soft' THEN 'soft'
      WHEN 'weak' THEN 'soft'
      ELSE 'hard'
    END;
  ELSE
    ALTER TABLE public.acceptance_dependencies
      ADD COLUMN dependency_kind TEXT;

    UPDATE public.acceptance_dependencies
    SET dependency_kind = CASE LOWER(BTRIM(COALESCE(dependency_type, '')))
      WHEN 'soft' THEN 'soft'
      WHEN 'weak' THEN 'soft'
      ELSE 'hard'
    END;
  END IF;

  ALTER TABLE public.acceptance_dependencies
    ALTER COLUMN dependency_kind SET DEFAULT 'hard';
  ALTER TABLE public.acceptance_dependencies
    ALTER COLUMN dependency_kind SET NOT NULL;

  ALTER TABLE public.acceptance_dependencies
    DROP CONSTRAINT IF EXISTS chk_acceptance_dependencies_kind;
  ALTER TABLE public.acceptance_dependencies
    ADD CONSTRAINT chk_acceptance_dependencies_kind
    CHECK (dependency_kind IN ('hard', 'soft'));

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acceptance_dependencies'
      AND column_name = 'dependency_type'
  ) THEN
    ALTER TABLE public.acceptance_dependencies DROP COLUMN dependency_type;
  END IF;
END $$;

ALTER TABLE public.acceptance_requirements
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_satisfied BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.acceptance_requirements
SET
  is_required = CASE LOWER(BTRIM(COALESCE(status, 'open')))
    WHEN 'closed' THEN FALSE
    ELSE TRUE
  END,
  is_satisfied = CASE LOWER(BTRIM(COALESCE(status, 'open')))
    WHEN 'met' THEN TRUE
    ELSE FALSE
  END;
