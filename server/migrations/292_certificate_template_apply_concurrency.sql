-- Serialize certificate template application per project and make retries durable.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.certificate_template_apply_batches
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.certificate_template_apply_batches
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

UPDATE public.certificate_template_apply_batches
SET idempotency_key = 'legacy:' || id::TEXT
WHERE idempotency_key IS NULL OR btrim(idempotency_key) = '';

UPDATE public.certificate_template_apply_batches
SET request_fingerprint = encode(
  digest(
    concat_ws(
      ':',
      project_id::TEXT,
      template_code,
      seed_version,
      id::TEXT
    ),
    'sha256'
  ),
  'hex'
)
WHERE request_fingerprint IS NULL OR btrim(request_fingerprint) = '';

ALTER TABLE public.certificate_template_apply_batches
  ALTER COLUMN idempotency_key SET NOT NULL;

ALTER TABLE public.certificate_template_apply_batches
  ALTER COLUMN request_fingerprint SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_certificate_template_apply_batches_idempotency
  ON public.certificate_template_apply_batches(project_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_template_certificate_per_project
  ON public.pre_milestones(project_id, certificate_type)
  WHERE certificate_type IS NOT NULL
    AND notes LIKE 'system_template:%';

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_template_work_item_per_project
  ON public.certificate_work_items(project_id, upper(item_code))
  WHERE item_code IS NOT NULL
    AND notes LIKE 'system_template:%';

COMMIT;
