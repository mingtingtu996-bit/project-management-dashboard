CREATE TABLE IF NOT EXISTS public.project_data_quality_settings (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  weights_json JSONB NOT NULL DEFAULT '{"timeliness":0.3,"anomaly":0.25,"consistency":0.2,"jumpiness":0.1,"coverage":0.15}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_project_data_quality_settings_updated_at
  ON public.project_data_quality_settings(updated_at DESC);

ALTER TABLE public.project_data_quality_settings ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
