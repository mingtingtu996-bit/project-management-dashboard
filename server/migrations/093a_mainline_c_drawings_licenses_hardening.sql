-- Mainline C hardening: drawings / licenses contract alignment
-- Date: 2026-04-18

ALTER TABLE public.construction_drawings
  ADD COLUMN IF NOT EXISTS parent_drawing_id UUID REFERENCES public.construction_drawings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discipline_type TEXT,
  ADD COLUMN IF NOT EXISTS document_purpose TEXT DEFAULT '施工执行',
  ADD COLUMN IF NOT EXISTS version_no TEXT,
  ADD COLUMN IF NOT EXISTS revision_no TEXT,
  ADD COLUMN IF NOT EXISTS issued_for TEXT,
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS review_mode TEXT NOT NULL DEFAULT 'none';

UPDATE public.construction_drawings
SET version_no = COALESCE(NULLIF(version_no, ''), NULLIF(version, ''))
WHERE version_no IS NULL OR BTRIM(version_no) = '';

UPDATE public.construction_drawings
SET revision_no = COALESCE(NULLIF(revision_no, ''), NULLIF(version_no, ''), NULLIF(version, ''))
WHERE revision_no IS NULL OR BTRIM(revision_no) = '';

UPDATE public.construction_drawings
SET document_purpose = COALESCE(NULLIF(document_purpose, ''), '施工执行')
WHERE document_purpose IS NULL OR BTRIM(document_purpose) = '';

UPDATE public.construction_drawings
SET issued_for = COALESCE(NULLIF(issued_for, ''), NULLIF(document_purpose, ''))
WHERE issued_for IS NULL OR BTRIM(issued_for) = '';

UPDATE public.construction_drawings
SET effective_date = COALESCE(effective_date, actual_pass_date, drawing_date)
WHERE effective_date IS NULL;

UPDATE public.construction_drawings
SET discipline_type = COALESCE(NULLIF(discipline_type, ''), NULLIF(drawing_type, ''), '其他')
WHERE discipline_type IS NULL OR BTRIM(discipline_type) = '';

DO $$
BEGIN
  IF to_regclass('public.drawing_versions') IS NOT NULL THEN
    ALTER TABLE public.drawing_versions
      ADD COLUMN IF NOT EXISTS parent_drawing_id UUID REFERENCES public.construction_drawings(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS revision_no TEXT,
      ADD COLUMN IF NOT EXISTS issued_for TEXT,
      ADD COLUMN IF NOT EXISTS effective_date DATE,
      ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

    UPDATE public.drawing_versions AS dv
    SET parent_drawing_id = COALESCE(dv.parent_drawing_id, cd.parent_drawing_id),
        revision_no = COALESCE(NULLIF(dv.revision_no, ''), NULLIF(cd.revision_no, ''), NULLIF(dv.version_no, '')),
        issued_for = COALESCE(NULLIF(dv.issued_for, ''), NULLIF(cd.issued_for, ''), NULLIF(cd.document_purpose, '')),
        effective_date = COALESCE(dv.effective_date, cd.effective_date, cd.actual_pass_date, cd.drawing_date),
        superseded_at = COALESCE(dv.superseded_at, CASE WHEN COALESCE(dv.is_current_version, FALSE) THEN NULL ELSE dv.updated_at END)
    FROM public.construction_drawings AS cd
    WHERE cd.id = dv.drawing_id;

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_drawing_versions_parent_drawing_id ON public.drawing_versions(parent_drawing_id)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.drawing_package_items') IS NOT NULL THEN
    ALTER TABLE public.drawing_package_items
      ADD COLUMN IF NOT EXISTS discipline_type TEXT;

    UPDATE public.drawing_package_items AS dpi
    SET discipline_type = COALESCE(
      NULLIF(dpi.discipline_type, ''),
      NULLIF((
        SELECT dp.discipline_type
        FROM public.drawing_packages AS dp
        WHERE dp.id = dpi.package_id
      ), ''),
      NULLIF((
        SELECT cd.discipline_type
        FROM public.construction_drawings AS cd
        WHERE cd.id = dpi.current_drawing_id
      ), ''),
      NULLIF((
        SELECT cd.drawing_type
        FROM public.construction_drawings AS cd
        WHERE cd.id = dpi.current_drawing_id
      ), ''),
      '其他'
    )
    WHERE dpi.discipline_type IS NULL OR BTRIM(dpi.discipline_type) = '';

    ALTER TABLE public.drawing_package_items
      ALTER COLUMN discipline_type SET DEFAULT '其他';

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_drawing_package_items_discipline_type ON public.drawing_package_items(package_id, discipline_type)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.drawing_packages') IS NOT NULL THEN
    ALTER TABLE public.drawing_packages
      DROP CONSTRAINT IF EXISTS chk_drawing_packages_review_mode;
    ALTER TABLE public.drawing_packages
      ADD CONSTRAINT chk_drawing_packages_review_mode
      CHECK (review_mode IN ('mandatory', 'optional', 'none', 'manual_confirm'));
  END IF;
END $$;

ALTER TABLE public.construction_drawings
  DROP CONSTRAINT IF EXISTS chk_construction_drawings_review_mode;
ALTER TABLE public.construction_drawings
  ADD CONSTRAINT chk_construction_drawings_review_mode
  CHECK (review_mode IN ('mandatory', 'optional', 'none', 'manual_confirm'));

DO $$
BEGIN
  IF to_regclass('public.drawing_review_rules') IS NOT NULL THEN
    ALTER TABLE public.drawing_review_rules
      DROP CONSTRAINT IF EXISTS chk_drawing_review_rules_default_review_mode;
    ALTER TABLE public.drawing_review_rules
      ADD CONSTRAINT chk_drawing_review_rules_default_review_mode
      CHECK (default_review_mode IN ('mandatory', 'optional', 'none', 'manual_confirm'));
  END IF;
END $$;

ALTER TABLE public.pre_milestones
  ADD COLUMN IF NOT EXISTS certificate_type TEXT,
  ADD COLUMN IF NOT EXISTS certificate_name TEXT,
  ADD COLUMN IF NOT EXISTS certificate_no TEXT,
  ADD COLUMN IF NOT EXISTS document_no TEXT,
  ADD COLUMN IF NOT EXISTS current_stage VARCHAR(32),
  ADD COLUMN IF NOT EXISTS planned_finish_date DATE,
  ADD COLUMN IF NOT EXISTS actual_finish_date DATE,
  ADD COLUMN IF NOT EXISTS approving_authority VARCHAR(100),
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS next_action_due_date DATE,
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS block_reason TEXT,
  ADD COLUMN IF NOT EXISTS latest_record_at TIMESTAMP;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.pre_milestones'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.pre_milestones DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

UPDATE public.pre_milestones
SET status = CASE BTRIM(COALESCE(status, ''))
  WHEN '待申请' THEN 'pending'
  WHEN '办理中' THEN 'preparing_documents'
  WHEN '已取得' THEN 'issued'
  WHEN '已过期' THEN 'expired'
  WHEN '需延期' THEN 'supplement_required'
  ELSE status
END
WHERE status IN ('待申请', '办理中', '已取得', '已过期', '需延期');

UPDATE public.pre_milestones
SET certificate_type = COALESCE(NULLIF(certificate_type, ''), NULLIF(milestone_type, '')),
    certificate_name = COALESCE(NULLIF(certificate_name, ''), NULLIF(milestone_name, '')),
    certificate_no = COALESCE(NULLIF(certificate_no, ''), NULLIF(document_no, '')),
    current_stage = COALESCE(
      NULLIF(current_stage, ''),
      CASE COALESCE(status, 'pending')
        WHEN 'pending' THEN '资料准备'
        WHEN 'preparing_documents' THEN '资料准备'
        WHEN 'internal_review' THEN '内部报审'
        WHEN 'external_submission' THEN '外部报批'
        WHEN 'approved' THEN '外部报批'
        WHEN 'supplement_required' THEN '外部报批'
        ELSE '批复领证'
      END
    ),
    planned_finish_date = COALESCE(planned_finish_date, planned_end_date),
    actual_finish_date = COALESCE(actual_finish_date, issue_date),
    approving_authority = COALESCE(NULLIF(approving_authority, ''), NULLIF(issuing_authority, '')),
    issuing_authority = COALESCE(NULLIF(issuing_authority, ''), NULLIF(approving_authority, '')),
    next_action = COALESCE(NULLIF(next_action, ''), NULLIF(description, '')),
    latest_record_at = COALESCE(latest_record_at, updated_at)
WHERE TRUE;

ALTER TABLE public.pre_milestones
  ADD CONSTRAINT chk_pre_milestones_status_current
  CHECK (status IN (
    'pending',
    'preparing_documents',
    'internal_review',
    'external_submission',
    'supplement_required',
    'approved',
    'issued',
    'expired',
    'voided'
  ));

ALTER TABLE public.pre_milestones
  DROP CONSTRAINT IF EXISTS chk_pre_milestones_current_stage;
ALTER TABLE public.pre_milestones
  ADD CONSTRAINT chk_pre_milestones_current_stage
  CHECK (current_stage IS NULL OR current_stage IN ('资料准备', '内部报审', '外部报批', '批复领证'));

CREATE INDEX IF NOT EXISTS idx_pre_milestones_certificate_type
  ON public.pre_milestones(project_id, certificate_type);

CREATE INDEX IF NOT EXISTS idx_pre_milestones_status_current
  ON public.pre_milestones(project_id, status);
