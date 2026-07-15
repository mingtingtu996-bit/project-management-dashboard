-- Durable wall-clock job slots. A unique slot is claimed atomically so a
-- restarted or horizontally scaled scheduler can catch up without duplicates.

BEGIN;

CREATE TABLE IF NOT EXISTS public.scheduled_job_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  claim_owner TEXT NOT NULL,
  claim_token UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scheduled_job_slots_job_name_nonempty
    CHECK (btrim(job_name) <> ''),
  CONSTRAINT scheduled_job_slots_claim_owner_nonempty
    CHECK (btrim(claim_owner) <> ''),
  CONSTRAINT scheduled_job_slots_attempt_count_positive
    CHECK (attempt_count > 0),
  CONSTRAINT scheduled_job_slots_status_check
    CHECK (status IN ('running', 'succeeded', 'failed')),
  UNIQUE (job_name, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_slots_recovery
  ON public.scheduled_job_slots(status, claimed_at)
  WHERE status IN ('running', 'failed');

CREATE INDEX IF NOT EXISTS idx_scheduled_job_slots_job_history
  ON public.scheduled_job_slots(job_name, scheduled_for DESC);

CREATE TABLE IF NOT EXISTS public.job_lease_fences (
  job_name TEXT PRIMARY KEY,
  generation BIGINT NOT NULL DEFAULT 1,
  active_token UUID NULL,
  lease_backend_pid INTEGER NULL,
  lease_backend_started_at TIMESTAMPTZ NULL,
  activated_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_lease_fences_job_name_nonempty
    CHECK (btrim(job_name) <> ''),
  CONSTRAINT job_lease_fences_generation_positive
    CHECK (generation > 0),
  CONSTRAINT job_lease_fences_active_identity_complete
    CHECK (
      (active_token IS NULL AND lease_backend_pid IS NULL AND lease_backend_started_at IS NULL)
      OR
      (active_token IS NOT NULL AND lease_backend_pid IS NOT NULL AND lease_backend_started_at IS NOT NULL)
    )
);

ALTER TABLE public.scheduled_job_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_job_slots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.job_lease_fences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_lease_fences FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.scheduled_job_slots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.job_lease_fences FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS scheduled_job_slots_runtime_policy ON public.scheduled_job_slots;
CREATE POLICY scheduled_job_slots_runtime_policy
ON public.scheduled_job_slots
FOR ALL
USING (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
)
WITH CHECK (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
);

DROP POLICY IF EXISTS job_lease_fences_runtime_policy ON public.job_lease_fences;
CREATE POLICY job_lease_fences_runtime_policy
ON public.job_lease_fences
FOR ALL
USING (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
)
WITH CHECK (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
);

CREATE OR REPLACE FUNCTION public.assert_job_lease_fence(
  p_job_name TEXT,
  p_fence_token UUID,
  p_generation BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fence public.job_lease_fences%ROWTYPE;
  v_namespace_hash BIGINT;
  v_job_hash BIGINT;
  v_lock_held BOOLEAN;
BEGIN
  SELECT *
    INTO v_fence
    FROM public.job_lease_fences
   WHERE job_name = p_job_name;

  IF NOT FOUND
     OR v_fence.active_token IS DISTINCT FROM p_fence_token
     OR v_fence.generation IS DISTINCT FROM p_generation
     OR v_fence.lease_backend_pid IS NULL
     OR v_fence.lease_backend_started_at IS NULL THEN
    RAISE EXCEPTION 'job lease fence rejected for %: stale token or generation', p_job_name
      USING ERRCODE = '55000';
  END IF;

  v_namespace_hash := hashtext('workbuddy_job_lease')::BIGINT;
  IF v_namespace_hash < 0 THEN
    v_namespace_hash := v_namespace_hash + 4294967296;
  END IF;
  v_job_hash := hashtext(p_job_name)::BIGINT;
  IF v_job_hash < 0 THEN
    v_job_hash := v_job_hash + 4294967296;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_locks AS locks
      JOIN pg_catalog.pg_stat_activity AS activity
        ON activity.pid = locks.pid
     WHERE locks.locktype = 'advisory'
       AND locks.granted IS TRUE
       AND locks.pid = v_fence.lease_backend_pid
       AND activity.backend_start = v_fence.lease_backend_started_at
       AND locks.classid::BIGINT = v_namespace_hash
       AND locks.objid::BIGINT = v_job_hash
       AND locks.objsubid = 2
  ) INTO v_lock_held;

  IF NOT v_lock_held THEN
    RAISE EXCEPTION 'job lease fence rejected for %: advisory lock is no longer held', p_job_name
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_job_lease_fence_from_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_headers_text TEXT;
  v_headers JSONB;
  v_job_name TEXT;
  v_token_text TEXT;
  v_generation_text TEXT;
BEGIN
  v_headers_text := current_setting('request.headers', TRUE);
  IF v_headers_text IS NULL OR btrim(v_headers_text) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_headers := v_headers_text::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  v_job_name := NULLIF(btrim(v_headers ->> 'x-workbuddy-job-name'), '');
  v_token_text := NULLIF(btrim(v_headers ->> 'x-workbuddy-job-fence-token'), '');
  v_generation_text := NULLIF(btrim(v_headers ->> 'x-workbuddy-job-fence-generation'), '');

  IF v_job_name IS NULL AND v_token_text IS NULL AND v_generation_text IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_job_name IS NULL OR v_token_text IS NULL OR v_generation_text IS NULL THEN
    RAISE EXCEPTION 'job lease fence rejected: incomplete request identity'
      USING ERRCODE = '55000';
  END IF;

  BEGIN
    PERFORM public.assert_job_lease_fence(
      v_job_name,
      v_token_text::UUID,
      v_generation_text::BIGINT
    );
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'job lease fence rejected: malformed request identity'
      USING ERRCODE = '55000';
  END;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_job_lease_fence(TEXT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_job_lease_fence_from_request() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_job_lease_fence ON public.notifications';
    EXECUTE 'CREATE TRIGGER enforce_job_lease_fence BEFORE INSERT OR UPDATE OR DELETE ON public.notifications FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_job_lease_fence_from_request()';
  END IF;
  IF to_regclass('public.notification_user_states') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_job_lease_fence ON public.notification_user_states';
    EXECUTE 'CREATE TRIGGER enforce_job_lease_fence BEFORE INSERT OR UPDATE OR DELETE ON public.notification_user_states FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_job_lease_fence_from_request()';
  END IF;
  IF to_regclass('public.risks') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_job_lease_fence ON public.risks';
    EXECUTE 'CREATE TRIGGER enforce_job_lease_fence BEFORE INSERT OR UPDATE OR DELETE ON public.risks FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_job_lease_fence_from_request()';
  END IF;
  IF to_regclass('public.issues') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_job_lease_fence ON public.issues';
    EXECUTE 'CREATE TRIGGER enforce_job_lease_fence BEFORE INSERT OR UPDATE OR DELETE ON public.issues FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_job_lease_fence_from_request()';
  END IF;
  IF to_regclass('public.warning_acknowledgments') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_job_lease_fence ON public.warning_acknowledgments';
    EXECUTE 'CREATE TRIGGER enforce_job_lease_fence BEFORE INSERT OR UPDATE OR DELETE ON public.warning_acknowledgments FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_job_lease_fence_from_request()';
  END IF;
  IF to_regclass('public.change_logs') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_job_lease_fence ON public.change_logs';
    EXECUTE 'CREATE TRIGGER enforce_job_lease_fence BEFORE INSERT OR UPDATE OR DELETE ON public.change_logs FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_job_lease_fence_from_request()';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scheduled_job_slots TO workbuddy_runtime;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.job_lease_fences TO workbuddy_runtime;
  END IF;
END $$;

COMMENT ON TABLE public.scheduled_job_slots IS
  'System scheduler ledger for persistent catch-up, retry, and multi-instance slot claims.';
COMMENT ON COLUMN public.scheduled_job_slots.claim_token IS
  'Write fence used to reject completion from an owner that no longer holds the slot.';
COMMENT ON TABLE public.job_lease_fences IS
  'Generation and PostgreSQL backend identity for rejecting stale distributed-job writes.';

COMMIT;
