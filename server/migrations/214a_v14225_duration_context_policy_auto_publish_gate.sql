-- v1.4.22.5: duration context policy auto-publish gate metadata.
-- Allows zero-human-review canary registry rows only after the duration-specific gate passes.

BEGIN;

ALTER TABLE public.duration_context_policy_versions
  DROP CONSTRAINT IF EXISTS duration_context_policy_versions_activation_mode_check;

ALTER TABLE public.duration_context_policy_versions
  ADD CONSTRAINT duration_context_policy_versions_activation_mode_check
  CHECK (activation_mode IN ('review_required_canary', 'auto_publish_gate_canary', 'manual_publish'));

COMMENT ON CONSTRAINT duration_context_policy_versions_activation_mode_check
  ON public.duration_context_policy_versions
  IS 'Auto-publish gate canary rows are registry-only and require scope sample, MAE and overcompensation gates.';

COMMENT ON COLUMN public.duration_context_policy_versions.activation_mode
  IS 'review_required_canary=manual approval; auto_publish_gate_canary=zero-human-review gate passed; manual_publish=explicit admin publish.';

NOTIFY pgrst, 'reload schema';

COMMIT;
