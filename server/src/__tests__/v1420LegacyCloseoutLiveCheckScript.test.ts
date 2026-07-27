import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('v1.4.20 live legacy closeout verifier', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/scripts/check-v1420-legacy-closeout.ts'), 'utf8')

  it('checks physical objects, canonical roles, runtime RLS, lineage, audit and retained dependencies', () => {
    for (const anchor of [
      'retired_physical_tables_absent',
      'retired_columns_absent',
      'project_member_roles_canonical',
      'migration_303_runtime_policies_present',
      'migration_303_runtime_acl_and_rls_present',
      'legacy_semantic_lineage_remapped',
      'migration_304_before_images_recorded',
      'canonical_task_preceding_relations_retained',
    ]) {
      expect(source).toContain(anchor)
    }
  })

  it('fails the process when any live check fails', () => {
    expect(source).toContain("if (failedChecks.length > 0) process.exitCode = 1")
  })
})
