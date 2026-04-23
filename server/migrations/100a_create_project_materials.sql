CREATE TABLE IF NOT EXISTS public.project_materials (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  participant_unit_id UUID NULL REFERENCES public.participant_units(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL,
  specialty_type TEXT NULL,
  requires_sample_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  sample_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  expected_arrival_date DATE NOT NULL,
  actual_arrival_date DATE NULL,
  requires_inspection BOOLEAN NOT NULL DEFAULT FALSE,
  inspection_done BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_materials_project_id
  ON public.project_materials(project_id);

CREATE INDEX IF NOT EXISTS idx_project_materials_participant_unit_id
  ON public.project_materials(participant_unit_id);

CREATE INDEX IF NOT EXISTS idx_project_materials_expected_arrival_date
  ON public.project_materials(expected_arrival_date);

CREATE INDEX IF NOT EXISTS idx_project_materials_specialty_type
  ON public.project_materials(specialty_type);

CREATE INDEX IF NOT EXISTS idx_project_materials_project_expected_date
  ON public.project_materials(project_id, expected_arrival_date);

NOTIFY pgrst, 'reload schema';
