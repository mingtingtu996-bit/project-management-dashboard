-- v1.4.23.2-B: commercial foundation for tenant admission and project quota.
--
-- Scope:
-- - Keep commercial fields out of companies/projects.
-- - Default billing_enabled=false so cold-start users are not blocked.
-- - Record onboarded_at and active-project metering from day one.
-- - Give existing companies a one-time safe quota at least equal to current
--   active project count so enabling billing will not silently lock old users.

BEGIN;

CREATE TABLE IF NOT EXISTS public.company_commercial (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  commercial_state TEXT NOT NULL DEFAULT 'trial',
  active_project_limit INTEGER NOT NULL DEFAULT 1,
  billing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  onboarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  plan_started_at TIMESTAMPTZ NULL,
  plan_expires_at TIMESTAMPTZ NULL,
  updated_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_commercial_plan_tier_check
    CHECK (plan_tier IN ('free', 'pro', 'enterprise')),
  CONSTRAINT company_commercial_state_check
    CHECK (commercial_state IN ('trial', 'active', 'suspended', 'expired', 'archived')),
  CONSTRAINT company_commercial_active_project_limit_check
    CHECK (active_project_limit >= 0)
);

CREATE TABLE IF NOT EXISTS public.company_commercial_audit (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  from_state TEXT NULL,
  to_state TEXT NULL,
  from_tier TEXT NULL,
  to_tier TEXT NULL,
  reason TEXT NULL,
  actor_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_commercial_audit_action_check
    CHECK (action IN ('commercial_state_created', 'commercial_metering_recorded', 'commercial_state_changed', 'commercial_payment_event_recorded', 'commercial_payment_event_applied')),
  CONSTRAINT company_commercial_audit_from_state_check
    CHECK (from_state IS NULL OR from_state IN ('trial', 'active', 'suspended', 'expired', 'archived')),
  CONSTRAINT company_commercial_audit_to_state_check
    CHECK (to_state IS NULL OR to_state IN ('trial', 'active', 'suspended', 'expired', 'archived')),
  CONSTRAINT company_commercial_audit_from_tier_check
    CHECK (from_tier IS NULL OR from_tier IN ('free', 'pro', 'enterprise')),
  CONSTRAINT company_commercial_audit_to_tier_check
    CHECK (to_tier IS NULL OR to_tier IN ('free', 'pro', 'enterprise'))
);

CREATE TABLE IF NOT EXISTS public.company_commercial_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  payment_provider TEXT NOT NULL DEFAULT 'manual',
  payment_status TEXT NOT NULL DEFAULT 'draft',
  provider_order_id TEXT NULL,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_commercial_orders_plan_tier_check
    CHECK (plan_tier IN ('free', 'pro', 'enterprise')),
  CONSTRAINT company_commercial_orders_amount_cents_check
    CHECK (amount_cents >= 0),
  CONSTRAINT company_commercial_orders_status_check
    CHECK (payment_status IN ('draft', 'pending', 'paid', 'failed', 'cancelled', 'refunded'))
);

CREATE TABLE IF NOT EXISTS public.company_commercial_payment_events (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.company_commercial_orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_status TEXT NOT NULL DEFAULT 'received',
  provider_event_id TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_commercial_payment_events_status_check
    CHECK (event_status IN ('received', 'verified', 'rejected', 'applied'))
);

WITH active_counts AS (
  SELECT
    c.id AS company_id,
    GREATEST(
      1,
      COUNT(p.id) FILTER (
        WHERE COALESCE(p.status, '') <> ALL(
          ARRAY['已暂停', '已完成', 'archived', 'deleted', 'inactive', 'cancelled', 'canceled']::text[]
        )
      )::int
    ) AS active_project_limit
  FROM public.companies c
  LEFT JOIN public.projects p ON p.company_id = c.id
  GROUP BY c.id
)
INSERT INTO public.company_commercial (
  company_id,
  plan_tier,
  commercial_state,
  active_project_limit,
  billing_enabled,
  onboarded_at
)
SELECT
  active_counts.company_id,
  'free',
  'trial',
  active_counts.active_project_limit,
  FALSE,
  NOW()
FROM active_counts
ON CONFLICT (company_id) DO NOTHING;

INSERT INTO public.company_commercial_audit (
  company_id,
  action,
  to_state,
  to_tier,
  reason,
  payload
)
SELECT
  cc.company_id,
  'commercial_state_created',
  cc.commercial_state,
  cc.plan_tier,
  'v14232_commercial_foundation_backfill',
  jsonb_build_object(
    'billingEnabled', cc.billing_enabled,
    'activeProjectLimit', cc.active_project_limit,
    'boundary', 'billing_default_off_existing_company_safe_quota'
  )
FROM public.company_commercial cc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.company_commercial_audit audit
  WHERE audit.company_id = cc.company_id
    AND audit.action = 'commercial_state_created'
);

CREATE INDEX IF NOT EXISTS idx_company_commercial_state
  ON public.company_commercial(commercial_state, billing_enabled);
CREATE INDEX IF NOT EXISTS idx_company_commercial_audit_company_created
  ON public.company_commercial_audit(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_commercial_orders_company_created
  ON public.company_commercial_orders(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_commercial_payment_events_order_created
  ON public.company_commercial_payment_events(order_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_commercial_payment_provider_event
  ON public.company_commercial_payment_events(payment_provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

ALTER TABLE public.company_commercial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_commercial FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_commercial_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_commercial_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_commercial_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_commercial_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_commercial_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_commercial_payment_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_commercial_select_policy ON public.company_commercial;
CREATE POLICY company_commercial_select_policy ON public.company_commercial
  FOR SELECT
  USING (
    public.is_active_company_member(public.company_commercial.company_id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS company_commercial_write_policy ON public.company_commercial;
CREATE POLICY company_commercial_write_policy ON public.company_commercial
  FOR ALL
  USING (
    public.is_active_company_member(public.company_commercial.company_id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    public.is_active_company_member(public.company_commercial.company_id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS company_commercial_audit_select_policy ON public.company_commercial_audit;
CREATE POLICY company_commercial_audit_select_policy ON public.company_commercial_audit
  FOR SELECT
  USING (
    public.is_active_company_member(public.company_commercial_audit.company_id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS company_commercial_audit_insert_policy ON public.company_commercial_audit;
CREATE POLICY company_commercial_audit_insert_policy ON public.company_commercial_audit
  FOR INSERT
  WITH CHECK (
    public.is_active_company_member(public.company_commercial_audit.company_id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS company_commercial_orders_policy ON public.company_commercial_orders;
CREATE POLICY company_commercial_orders_policy ON public.company_commercial_orders
  FOR ALL
  USING (
    public.is_active_company_member(public.company_commercial_orders.company_id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    public.is_active_company_member(public.company_commercial_orders.company_id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS company_commercial_payment_events_policy ON public.company_commercial_payment_events;
CREATE POLICY company_commercial_payment_events_policy ON public.company_commercial_payment_events
  FOR ALL
  USING (
    public.is_active_company_member(public.company_commercial_payment_events.company_id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    public.is_active_company_member(public.company_commercial_payment_events.company_id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_commercial TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_commercial_audit TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_commercial_orders TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_commercial_payment_events TO workbuddy_runtime';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.company_commercial_audit_id_seq TO workbuddy_runtime';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.company_commercial_payment_events_id_seq TO workbuddy_runtime';
  END IF;
END $$;

DROP POLICY IF EXISTS company_commercial_backend_runtime_policy ON public.company_commercial;
CREATE POLICY company_commercial_backend_runtime_policy ON public.company_commercial
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS company_commercial_audit_backend_runtime_policy ON public.company_commercial_audit;
CREATE POLICY company_commercial_audit_backend_runtime_policy ON public.company_commercial_audit
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS company_commercial_orders_backend_runtime_policy ON public.company_commercial_orders;
CREATE POLICY company_commercial_orders_backend_runtime_policy ON public.company_commercial_orders
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS company_commercial_payment_events_backend_runtime_policy ON public.company_commercial_payment_events;
CREATE POLICY company_commercial_payment_events_backend_runtime_policy ON public.company_commercial_payment_events
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMIT;
