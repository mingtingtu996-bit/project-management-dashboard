CREATE TABLE IF NOT EXISTS public.warning_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  warning_type VARCHAR(50) NOT NULL,
  warning_signature VARCHAR(255) NOT NULL,
  acked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_warning_acknowledgments_user_signature
  ON public.warning_acknowledgments(user_id, warning_signature);

CREATE INDEX IF NOT EXISTS idx_warning_acknowledgments_project
  ON public.warning_acknowledgments(project_id, user_id);
