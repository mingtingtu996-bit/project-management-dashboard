-- v1.4.23.1 company root isolation.
--
-- companies and company_members are the tenant boundary roots. They need RLS
-- on live databases as well as fresh installs.

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
