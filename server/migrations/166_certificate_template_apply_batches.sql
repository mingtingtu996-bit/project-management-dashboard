-- v1.4.22.2 前期证照系统模板应用批次审计表
-- 只记录模板应用行为，不把系统 seed 本身当作项目事实存储。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS certificate_template_apply_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_code VARCHAR(100) NOT NULL,
  seed_version VARCHAR(40) NOT NULL,
  applied_by UUID,
  apply_mode VARCHAR(40) NOT NULL DEFAULT 'system_preview_apply',
  duplicate_policy VARCHAR(40) NOT NULL DEFAULT 'skip_existing',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_certificate_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_work_item_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_dependency_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  skipped_existing JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificate_template_apply_batches_project
  ON certificate_template_apply_batches(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_certificate_template_apply_batches_template
  ON certificate_template_apply_batches(template_code, seed_version);

COMMENT ON TABLE certificate_template_apply_batches IS
  '前期证照系统模板应用批次审计表，记录 templateCode、seedVersion、创建数量与跳过项。';
