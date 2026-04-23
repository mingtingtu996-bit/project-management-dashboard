-- Reconcile live schema for normalized drawing package model
-- Ensures the package/item/version tables exist in environments that adopted
-- baseline migrations before Mainline C drawing routes started relying on them.

CREATE TABLE IF NOT EXISTS public.drawing_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  package_code TEXT NOT NULL,
  package_name TEXT NOT NULL,
  discipline_type TEXT NOT NULL,
  document_purpose TEXT NOT NULL DEFAULT '施工执行',
  status TEXT NOT NULL DEFAULT 'pending',
  requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_mode TEXT NOT NULL DEFAULT 'none',
  review_basis TEXT,
  completeness_ratio NUMERIC(5, 2) NOT NULL DEFAULT 0,
  missing_required_count INT NOT NULL DEFAULT 0,
  current_version_drawing_id UUID,
  has_change BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_impact_flag BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready_for_construction BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready_for_acceptance BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, package_code)
);

CREATE TABLE IF NOT EXISTS public.drawing_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.drawing_packages(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  discipline_type TEXT DEFAULT '其他',
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  current_drawing_id UUID,
  current_version TEXT,
  status TEXT NOT NULL DEFAULT 'missing',
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (package_id, item_code)
);

CREATE TABLE IF NOT EXISTS public.drawing_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.drawing_packages(id) ON DELETE CASCADE,
  drawing_id UUID NOT NULL REFERENCES public.construction_drawings(id) ON DELETE CASCADE,
  version_no TEXT NOT NULL,
  previous_version_id UUID REFERENCES public.drawing_versions(id) ON DELETE SET NULL,
  parent_drawing_id UUID REFERENCES public.construction_drawings(id) ON DELETE SET NULL,
  revision_no TEXT,
  issued_for TEXT,
  effective_date DATE,
  is_current_version BOOLEAN NOT NULL DEFAULT FALSE,
  change_reason TEXT,
  created_by UUID,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (drawing_id, version_no)
);

CREATE TABLE IF NOT EXISTS public.drawing_review_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  package_code TEXT,
  discipline_type TEXT,
  document_purpose TEXT,
  default_review_mode TEXT NOT NULL DEFAULT 'none',
  review_basis TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.drawing_packages
  ADD COLUMN IF NOT EXISTS document_purpose TEXT NOT NULL DEFAULT '施工执行',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_mode TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS review_basis TEXT,
  ADD COLUMN IF NOT EXISTS completeness_ratio NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missing_required_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_version_drawing_id UUID,
  ADD COLUMN IF NOT EXISTS has_change BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS schedule_impact_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_ready_for_construction BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_ready_for_acceptance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.drawing_package_items
  ADD COLUMN IF NOT EXISTS discipline_type TEXT DEFAULT '其他',
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS current_drawing_id UUID,
  ADD COLUMN IF NOT EXISTS current_version TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.drawing_versions
  ADD COLUMN IF NOT EXISTS parent_drawing_id UUID REFERENCES public.construction_drawings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_no TEXT,
  ADD COLUMN IF NOT EXISTS issued_for TEXT,
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS change_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.construction_drawings
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES public.drawing_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_code TEXT,
  ADD COLUMN IF NOT EXISTS package_name TEXT,
  ADD COLUMN IF NOT EXISTS discipline_type TEXT,
  ADD COLUMN IF NOT EXISTS document_purpose TEXT DEFAULT '施工执行',
  ADD COLUMN IF NOT EXISTS drawing_code TEXT,
  ADD COLUMN IF NOT EXISTS version_no TEXT,
  ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_mode TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS review_basis TEXT,
  ADD COLUMN IF NOT EXISTS has_change BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS change_reason TEXT,
  ADD COLUMN IF NOT EXISTS schedule_impact_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_ready_for_construction BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_ready_for_acceptance BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.drawing_packages
  DROP CONSTRAINT IF EXISTS chk_drawing_packages_review_mode;
ALTER TABLE public.drawing_packages
  ADD CONSTRAINT chk_drawing_packages_review_mode
  CHECK (review_mode IN ('mandatory', 'optional', 'none', 'manual_confirm'));

ALTER TABLE public.construction_drawings
  DROP CONSTRAINT IF EXISTS chk_construction_drawings_review_mode;
ALTER TABLE public.construction_drawings
  ADD CONSTRAINT chk_construction_drawings_review_mode
  CHECK (review_mode IN ('mandatory', 'optional', 'none', 'manual_confirm'));

ALTER TABLE public.drawing_review_rules
  DROP CONSTRAINT IF EXISTS chk_drawing_review_rules_default_review_mode;
ALTER TABLE public.drawing_review_rules
  ADD CONSTRAINT chk_drawing_review_rules_default_review_mode
  CHECK (default_review_mode IN ('mandatory', 'optional', 'none', 'manual_confirm'));

CREATE INDEX IF NOT EXISTS idx_drawing_packages_project
  ON public.drawing_packages(project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_packages_code
  ON public.drawing_packages(project_id, package_code);
CREATE INDEX IF NOT EXISTS idx_drawing_package_items_package
  ON public.drawing_package_items(package_id);
CREATE INDEX IF NOT EXISTS idx_drawing_package_items_discipline_type
  ON public.drawing_package_items(package_id, discipline_type);
CREATE INDEX IF NOT EXISTS idx_drawing_versions_package
  ON public.drawing_versions(package_id);
CREATE INDEX IF NOT EXISTS idx_drawing_versions_project
  ON public.drawing_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_versions_parent_drawing_id
  ON public.drawing_versions(parent_drawing_id);
CREATE INDEX IF NOT EXISTS idx_drawing_review_rules_project
  ON public.drawing_review_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_review_rules_active
  ON public.drawing_review_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_construction_drawings_package
  ON public.construction_drawings(project_id, package_code);
CREATE INDEX IF NOT EXISTS idx_construction_drawings_current_version
  ON public.construction_drawings(package_id, is_current_version);

CREATE OR REPLACE FUNCTION public.update_drawing_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_drawing_packages_updated_at ON public.drawing_packages;
CREATE TRIGGER update_drawing_packages_updated_at
  BEFORE UPDATE ON public.drawing_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_drawing_packages_updated_at();

CREATE OR REPLACE FUNCTION public.update_drawing_package_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_drawing_package_items_updated_at ON public.drawing_package_items;
CREATE TRIGGER update_drawing_package_items_updated_at
  BEFORE UPDATE ON public.drawing_package_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_drawing_package_items_updated_at();

CREATE OR REPLACE FUNCTION public.update_drawing_versions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_drawing_versions_updated_at ON public.drawing_versions;
CREATE TRIGGER update_drawing_versions_updated_at
  BEFORE UPDATE ON public.drawing_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_drawing_versions_updated_at();

CREATE OR REPLACE FUNCTION public.update_drawing_review_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_drawing_review_rules_updated_at ON public.drawing_review_rules;
CREATE TRIGGER update_drawing_review_rules_updated_at
  BEFORE UPDATE ON public.drawing_review_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_drawing_review_rules_updated_at();

INSERT INTO public.drawing_review_rules (
  id, project_id, package_code, discipline_type, document_purpose,
  default_review_mode, review_basis, is_active, created_at, updated_at
)
VALUES
  (gen_random_uuid(), NULL, 'fire-review', '消防', '送审报批', 'mandatory', '消防专项包默认必审', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'civil-defense-review', '人防', '送审报批', 'mandatory', '人防专项包默认必审', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'completion-archive', '竣工归档', '竣工归档', 'manual_confirm', '竣工归档包需要人工确认', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'architecture-construction', '建筑', '施工执行', 'none', '常规施工执行包默认不送审', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'structure-construction', '结构', '施工执行', 'none', '常规施工执行包默认不送审', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'water-construction', '给排水', '施工执行', 'none', '常规施工执行包默认不送审', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'hvac-construction', '暖通', '施工执行', 'none', '常规施工执行包默认不送审', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'electrical-construction', '电气', '施工执行', 'none', '常规施工执行包默认不送审', TRUE, NOW(), NOW())
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
