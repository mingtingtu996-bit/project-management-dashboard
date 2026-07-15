-- v1.4.23.2-B hardening: authoritative tiers, platform operator boundary,
-- registration-time commercial state and durable project metering.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'none';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_platform_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_platform_role_check
  CHECK (platform_role IN ('none', 'commercial_operator'));

ALTER TABLE public.company_commercial
  DROP CONSTRAINT IF EXISTS company_commercial_plan_tier_check;
ALTER TABLE public.company_commercial_orders
  DROP CONSTRAINT IF EXISTS company_commercial_orders_plan_tier_check;
ALTER TABLE public.company_commercial_audit
  DROP CONSTRAINT IF EXISTS company_commercial_audit_from_tier_check;
ALTER TABLE public.company_commercial_audit
  DROP CONSTRAINT IF EXISTS company_commercial_audit_to_tier_check;

UPDATE public.company_commercial
SET plan_tier = CASE WHEN plan_tier = 'enterprise' THEN 'group' ELSE plan_tier END;
UPDATE public.company_commercial_orders
SET plan_tier = CASE WHEN plan_tier = 'enterprise' THEN 'group' ELSE plan_tier END;
UPDATE public.company_commercial_audit
SET from_tier = CASE WHEN from_tier = 'enterprise' THEN 'group' ELSE from_tier END,
    to_tier = CASE WHEN to_tier = 'enterprise' THEN 'group' ELSE to_tier END;

ALTER TABLE public.company_commercial
  ADD CONSTRAINT company_commercial_plan_tier_check
  CHECK (plan_tier IN ('free', 'starter', 'pro', 'group'));
ALTER TABLE public.company_commercial_orders
  ADD CONSTRAINT company_commercial_orders_plan_tier_check
  CHECK (plan_tier IN ('free', 'starter', 'pro', 'group'));
ALTER TABLE public.company_commercial_audit
  ADD CONSTRAINT company_commercial_audit_from_tier_check
  CHECK (from_tier IS NULL OR from_tier IN ('free', 'starter', 'pro', 'group'));
ALTER TABLE public.company_commercial_audit
  ADD CONSTRAINT company_commercial_audit_to_tier_check
  CHECK (to_tier IS NULL OR to_tier IN ('free', 'starter', 'pro', 'group'));

ALTER TABLE public.company_commercial_audit
  DROP CONSTRAINT IF EXISTS company_commercial_audit_action_check;
ALTER TABLE public.company_commercial_audit
  ADD CONSTRAINT company_commercial_audit_action_check
  CHECK (action IN (
    'commercial_state_created',
    'commercial_metering_recorded',
    'commercial_state_changed',
    'commercial_payment_event_recorded',
    'commercial_payment_event_applied'
  ));

WITH active_counts AS (
  SELECT
    company_id,
    COUNT(*) FILTER (
      WHERE COALESCE(status, '') <> ALL(
        ARRAY['已暂停', '已完成', 'archived', 'deleted', 'inactive', 'cancelled', 'canceled']::TEXT[]
      )
    )::INT AS active_count
  FROM public.projects
  WHERE company_id IS NOT NULL
  GROUP BY company_id
)
UPDATE public.company_commercial commercial
SET active_project_limit = GREATEST(
  commercial.active_project_limit,
  COALESCE(active_counts.active_count, 0),
  CASE commercial.plan_tier
    WHEN 'starter' THEN 2
    WHEN 'pro' THEN 5
    WHEN 'free' THEN 1
    ELSE 0
  END
)
FROM active_counts
WHERE active_counts.company_id = commercial.company_id;

CREATE TABLE IF NOT EXISTS public.company_commercial_metering (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  measured_on DATE NOT NULL DEFAULT CURRENT_DATE,
  active_project_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'project_table_trigger',
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, measured_on),
  CONSTRAINT company_commercial_metering_count_check CHECK (active_project_count >= 0)
);

CREATE OR REPLACE FUNCTION public.workbuddy_initialize_company_commercial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_commercial (
    company_id, plan_tier, commercial_state, active_project_limit,
    billing_enabled, onboarded_at
  ) VALUES (
    NEW.id, 'free', 'trial', 1, FALSE, COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (company_id) DO NOTHING;

  INSERT INTO public.company_commercial_audit (
    company_id, action, to_state, to_tier, reason, payload
  ) VALUES (
    NEW.id,
    'commercial_state_created',
    'trial',
    'free',
    'company_created',
    jsonb_build_object('billingEnabled', FALSE, 'activeProjectLimit', 1)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workbuddy_initialize_company_commercial ON public.companies;
CREATE TRIGGER trg_workbuddy_initialize_company_commercial
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.workbuddy_initialize_company_commercial();

CREATE OR REPLACE FUNCTION public.workbuddy_meter_company_projects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_company_id UUID;
  active_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_company_id := OLD.company_id;
  ELSE
    affected_company_id := NEW.company_id;
  END IF;

  IF affected_company_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INT
  INTO active_count
  FROM public.projects
  WHERE company_id = affected_company_id
    AND COALESCE(status, '') <> ALL(
      ARRAY['已暂停', '已完成', 'archived', 'deleted', 'inactive', 'cancelled', 'canceled']::TEXT[]
    );

  INSERT INTO public.company_commercial_metering (
    company_id, measured_on, active_project_count, source, measured_at
  ) VALUES (
    affected_company_id, CURRENT_DATE, active_count, 'project_table_trigger', NOW()
  )
  ON CONFLICT (company_id, measured_on)
  DO UPDATE SET
    active_project_count = EXCLUDED.active_project_count,
    source = EXCLUDED.source,
    measured_at = EXCLUDED.measured_at;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workbuddy_meter_company_projects ON public.projects;
CREATE TRIGGER trg_workbuddy_meter_company_projects
AFTER INSERT OR UPDATE OR DELETE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.workbuddy_meter_company_projects();

ALTER TABLE public.company_commercial_metering ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_commercial_metering FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_commercial_metering_select_policy ON public.company_commercial_metering;
CREATE POLICY company_commercial_metering_select_policy
ON public.company_commercial_metering
FOR SELECT
USING (
  public.is_active_company_member(company_id, ARRAY['company_admin']::TEXT[])
  OR current_user = 'workbuddy_runtime'
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_commercial_metering TO workbuddy_runtime;
    GRANT EXECUTE ON FUNCTION public.workbuddy_initialize_company_commercial() TO workbuddy_runtime;
    GRANT EXECUTE ON FUNCTION public.workbuddy_meter_company_projects() TO workbuddy_runtime;
  END IF;
END $$;

COMMIT;
