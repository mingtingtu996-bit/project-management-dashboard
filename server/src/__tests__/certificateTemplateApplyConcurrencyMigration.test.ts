import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(process.cwd(), 'migrations/292_certificate_template_apply_concurrency.sql'),
  'utf8',
)

describe('certificate template apply concurrency migration', () => {
  it('adds a durable project-scoped idempotency key and request fingerprint', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS idempotency_key TEXT')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS request_fingerprint TEXT')
    expect(sql).toContain('ALTER COLUMN idempotency_key SET NOT NULL')
    expect(sql).toContain('ALTER COLUMN request_fingerprint SET NOT NULL')
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*certificate_template_apply_batches\(project_id, idempotency_key\)/)
  })

  it('adds business-key uniqueness for system-created certificates and work items', () => {
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*pre_milestones\(project_id, certificate_type\)/)
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*certificate_work_items\(project_id, upper\(item_code\)\)/)
    expect(sql.match(/notes LIKE 'system_template:%'/g)).toHaveLength(2)
  })

  it('uses one explicit transaction envelope', () => {
    expect((sql.match(/^BEGIN;/gm) ?? [])).toHaveLength(1)
    expect((sql.match(/^COMMIT;/gm) ?? [])).toHaveLength(1)
  })
})
