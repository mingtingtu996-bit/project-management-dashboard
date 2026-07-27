import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('v1.4.20 legacy closeout backup script', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/scripts/backup-v1420-legacy-closeout.ts'), 'utf8')

  it('captures every relation changed or dropped by migrations 303 and 304', () => {
    for (const relation of [
      'project_members',
      'project_invitations',
      'project_direct_invitations',
      'wbs_structure',
      'wbs_task_links',
      'data_lineage_entity_types',
      'data_lineage_relation_rules',
      'data_lineage_links',
      'project_entity_links',
      'duration_context_policy_learning_checkpoints',
      'duration_asset_baseline_revision_operations',
    ]) {
      expect(source).toContain(`'${relation}'`)
    }
  })

  it('prevents accidental overwrite and writes a SHA256 sidecar without serializing connection config', () => {
    expect(source).toContain("flag: 'wx'")
    expect(source).toContain("createHash('sha256')")
    expect(source).not.toContain('connectionString:')
    expect(source).not.toContain('DATABASE_URL')
  })
})
