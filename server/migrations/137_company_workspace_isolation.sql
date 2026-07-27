-- v1.4.20 多公司空间与数据隔离底座
-- 目标：先建立公司空间，再让项目、项目权限、公司级汇总都具备 company_id 边界。

CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  owner_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT companies_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE IF NOT EXISTS public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'regular',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_members_role_check CHECK (role IN ('company_admin', 'regular')),
  CONSTRAINT company_members_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT company_members_unique_user UNIQUE (company_id, user_id)
);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS project_visibility TEXT NOT NULL DEFAULT 'private';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_active_company_id UUID NULL REFERENCES public.companies(id) ON DELETE SET NULL;

DO $$
DECLARE
  default_company_id UUID;
  default_owner_id UUID;
BEGIN
  SELECT id INTO default_owner_id
  FROM public.users
  WHERE COALESCE(global_role, CASE WHEN role IN ('owner', 'admin') THEN 'company_admin' ELSE 'regular' END) = 'company_admin'
  ORDER BY joined_at ASC NULLS LAST, id ASC
  LIMIT 1;

  IF default_owner_id IS NULL THEN
    SELECT id INTO default_owner_id
    FROM public.users
    ORDER BY joined_at ASC NULLS LAST, id ASC
    LIMIT 1;
  END IF;

  SELECT id INTO default_company_id
  FROM public.companies
  WHERE name = '默认公司'
  ORDER BY created_at ASC
  LIMIT 1;

  IF default_company_id IS NULL THEN
    INSERT INTO public.companies (id, name, owner_id)
    VALUES (gen_random_uuid(), '默认公司', default_owner_id)
    RETURNING id INTO default_company_id;
  END IF;

  UPDATE public.projects
  SET company_id = default_company_id
  WHERE company_id IS NULL;

  INSERT INTO public.company_members (company_id, user_id, role, status)
  SELECT DISTINCT
    default_company_id,
    u.id,
    CASE
      WHEN COALESCE(u.global_role, CASE WHEN u.role IN ('owner', 'admin') THEN 'company_admin' ELSE 'regular' END) = 'company_admin'
        THEN 'company_admin'
      ELSE 'regular'
    END,
    'active'
  FROM public.users u
  ON CONFLICT (company_id, user_id)
  DO UPDATE SET
    role = CASE
      WHEN EXCLUDED.role = 'company_admin' THEN 'company_admin'
      ELSE public.company_members.role
    END,
    status = 'active',
    updated_at = NOW();

  UPDATE public.users
  SET last_active_company_id = default_company_id
  WHERE last_active_company_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = default_company_id
        AND cm.user_id = public.users.id
        AND cm.status = 'active'
    );
END $$;

ALTER TABLE public.projects
  ALTER COLUMN company_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_project_visibility_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_project_visibility_check
      CHECK (project_visibility IN ('private', 'company_visible', 'invite_only'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(status);
CREATE INDEX IF NOT EXISTS idx_company_members_user ON public.company_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_company_members_company_role ON public.company_members(company_id, role, status);
CREATE INDEX IF NOT EXISTS idx_projects_company ON public.projects(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_company_visibility ON public.projects(company_id, project_visibility);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select_policy ON public.companies;
CREATE POLICY companies_select_policy ON public.companies
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = public.companies.id
        AND cm.user_id = auth.uid()
        AND cm.status = 'active'
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS companies_write_policy ON public.companies;
CREATE POLICY companies_write_policy ON public.companies
  FOR ALL
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = public.companies.id
        AND cm.user_id = auth.uid()
        AND cm.role = 'company_admin'
        AND cm.status = 'active'
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = public.companies.id
        AND cm.user_id = auth.uid()
        AND cm.role = 'company_admin'
        AND cm.status = 'active'
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS company_members_select_policy ON public.company_members;
CREATE POLICY company_members_select_policy ON public.company_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.company_members viewer
      WHERE viewer.company_id = public.company_members.company_id
        AND viewer.user_id = auth.uid()
        AND viewer.status = 'active'
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS company_members_write_policy ON public.company_members;
CREATE POLICY company_members_write_policy ON public.company_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members admin_member
      WHERE admin_member.company_id = public.company_members.company_id
        AND admin_member.user_id = auth.uid()
        AND admin_member.role = 'company_admin'
        AND admin_member.status = 'active'
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.company_members admin_member
      WHERE admin_member.company_id = public.company_members.company_id
        AND admin_member.user_id = auth.uid()
        AND admin_member.role = 'company_admin'
        AND admin_member.status = 'active'
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );
