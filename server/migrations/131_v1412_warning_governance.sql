-- 131_v1412_warning_governance.sql
-- v1.4.12: Unified business warning lifecycle governance
-- Consolidates warnings into notifications(source_entity_type='warning') as single authority

BEGIN;

-- ============================================================
-- Phase 1: Warning lifecycle status + signature + hash
-- ============================================================
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS warning_signature TEXT,
  ADD COLUMN IF NOT EXISTS source_hash TEXT,
  ADD COLUMN IF NOT EXISTS warning_lifecycle_status TEXT;

-- Backfill existing warning notifications lifecycle status
UPDATE notifications
   SET warning_lifecycle_status = CASE
     WHEN COALESCE(is_escalated, FALSE) = TRUE OR escalated_to_risk_id IS NOT NULL THEN 'escalated'
     WHEN resolved_at IS NOT NULL OR resolved_source IS NOT NULL OR status = 'resolved' THEN 'resolved'
     WHEN muted_until IS NOT NULL AND muted_until > NOW() THEN 'muted'
     WHEN acknowledged_at IS NOT NULL OR status = 'acknowledged' THEN 'acknowledged'
     WHEN first_seen_at IS NOT NULL THEN 'active'
     ELSE 'created'
   END
 WHERE source_entity_type = 'warning'
   AND warning_lifecycle_status IS NULL;

-- Lifecycle status constraint: only warning notifications can have lifecycle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_warning_lifecycle_status_check'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_warning_lifecycle_status_check
      CHECK (
        (
          source_entity_type IS DISTINCT FROM 'warning'
          AND warning_lifecycle_status IS NULL
        )
        OR (
          source_entity_type = 'warning'
          AND warning_lifecycle_status IN ('created','active','acknowledged','muted','resolved','escalated')
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_warning_lifecycle
  ON notifications(project_id, source_entity_type, warning_lifecycle_status, severity, created_at DESC)
  WHERE source_entity_type = 'warning';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_warning_signature_unique
  ON notifications(project_id, warning_signature)
  WHERE source_entity_type = 'warning' AND warning_signature IS NOT NULL;

-- ============================================================
-- Phase 3: Upgrade chain protection + source_deleted rules
-- ============================================================

-- Protect risks that are part of upgrade chain from physical deletion
CREATE OR REPLACE FUNCTION public.protect_upgrade_chain_risk_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type IN ('warning_converted','warning_auto_escalated') THEN
      RAISE EXCEPTION 'UPGRADE_CHAIN_PROTECTED: risk linked to warning upgrade chain, use close instead';
    END IF;
    IF OLD.linked_issue_id IS NOT NULL THEN
      RAISE EXCEPTION 'UPGRADE_CHAIN_PROTECTED: risk has linked issue, use close instead';
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_protect_upgrade_chain_risk ON risks;
CREATE TRIGGER trigger_protect_upgrade_chain_risk
  BEFORE DELETE ON risks
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_upgrade_chain_risk_delete();

-- Protect issues that are part of upgrade chain from physical deletion
CREATE OR REPLACE FUNCTION public.protect_upgrade_chain_issue_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type IN ('risk_converted','risk_auto_escalated','obstacle_escalated','condition_expired') THEN
      RAISE EXCEPTION 'UPGRADE_CHAIN_PROTECTED: issue linked to upgrade chain, use close instead';
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_protect_upgrade_chain_issue ON issues;
CREATE TRIGGER trigger_protect_upgrade_chain_issue
  BEFORE DELETE ON issues
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_upgrade_chain_issue_delete();

-- ============================================================
-- Phase 3: Update atomic escalation RPC for lifecycle sync
-- ============================================================
-- Patch confirm_warning_as_risk_atomic to sync warning_lifecycle_status
CREATE OR REPLACE FUNCTION public.confirm_warning_as_risk_atomic(
  p_warning_id UUID,
  p_source_type VARCHAR DEFAULT 'warning_converted'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_notification public.notifications%ROWTYPE;
  v_existing_risk_id UUID;
  v_risk_id UUID;
  v_chain_id UUID;
  v_warning_token TEXT;
  v_risk_level VARCHAR(20);
  v_risk_category VARCHAR(20);
  v_probability INTEGER;
  v_impact INTEGER;
  v_timestamp TIMESTAMPTZ := NOW();
BEGIN
  SELECT *
  INTO v_notification
  FROM public.notifications
  WHERE id = p_warning_id
    AND source_entity_type = 'warning'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_notification.escalated_to_risk_id IS NOT NULL THEN
    RETURN v_notification.escalated_to_risk_id;
  END IF;

  SELECT id
  INTO v_existing_risk_id
  FROM public.risks
  WHERE source_entity_type = 'warning'
    AND (
      source_id = p_warning_id
      OR source_entity_id = p_warning_id::TEXT
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  v_chain_id := COALESCE(v_notification.chain_id, gen_random_uuid());
  v_warning_token := LOWER(COALESCE(v_notification.category, v_notification.type, ''));

  IF LOWER(COALESCE(v_notification.severity, 'warning')) = 'critical' THEN
    v_risk_level := 'critical';
    v_probability := 90;
    v_impact := 90;
  ELSIF LOWER(COALESCE(v_notification.severity, 'warning')) = 'warning' THEN
    v_risk_level := 'high';
    v_probability := 75;
    v_impact := 75;
  ELSE
    v_risk_level := 'medium';
    v_probability := 60;
    v_impact := 50;
  END IF;

  IF v_existing_risk_id IS NOT NULL THEN
    v_risk_id := v_existing_risk_id;
    UPDATE public.risks
    SET level = v_risk_level,
        probability = v_probability,
        impact = v_impact,
        status = 'identified',
        source_type = p_source_type,
        updated_at = v_timestamp
    WHERE id = v_risk_id;
  ELSE
    v_risk_id := gen_random_uuid();
    INSERT INTO public.risks (
      id, project_id, title, description, level, status,
      source_type, source_id, source_entity_type, source_entity_id,
      chain_id, probability, impact,
      created_at, updated_at
    ) VALUES (
      v_risk_id,
      v_notification.project_id,
      COALESCE(v_notification.title, v_notification.message, '预警升级风险'),
      COALESCE(v_notification.message, ''),
      v_risk_level,
      'identified',
      p_source_type,
      p_warning_id,
      'warning',
      v_notification.source_entity_id,
      v_chain_id,
      v_probability,
      v_impact,
      v_timestamp,
      v_timestamp
    );
  END IF;

  -- v1.4.12: sync warning_lifecycle_status = escalated
  UPDATE public.notifications
  SET escalated_to_risk_id = v_risk_id,
      escalated_at = v_timestamp,
      is_escalated = true,
      warning_lifecycle_status = 'escalated',
      updated_at = v_timestamp
  WHERE id = p_warning_id;

  RETURN v_risk_id;
END;
$$;

-- ============================================================
-- Phase 4: Old object backfill
-- ============================================================

-- risks: null source_type → manual
UPDATE risks SET source_type = 'manual' WHERE source_type IS NULL OR source_type = '';

-- risks: old status occurred → mitigating
UPDATE risks SET status = 'mitigating' WHERE status = 'occurred';

-- risks: null level → medium
UPDATE risks SET level = 'medium' WHERE level IS NULL OR level = '';

-- issues: null source_type → manual
UPDATE issues SET source_type = 'manual' WHERE source_type IS NULL OR source_type = '';

COMMIT;
