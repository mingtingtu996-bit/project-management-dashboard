-- 106: backfill runtime data integrity findings from §7.2 audit
--
-- 1. Legacy risks.status='monitoring' is no longer part of the canonical
--    workflow model; map it to mitigating.
-- 2. Historical obstacle_escalated issues created before independent chain_id
--    backfill should receive their own chain_id so chain-based linkage checks
--    stay complete.

UPDATE public.risks
SET
  status = 'mitigating',
  updated_at = COALESCE(updated_at, NOW())
WHERE status = 'monitoring';

UPDATE public.issues
SET
  chain_id = gen_random_uuid(),
  updated_at = COALESCE(updated_at, NOW())
WHERE source_type = 'obstacle_escalated'
  AND source_id IS NOT NULL
  AND chain_id IS NULL;
