import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ValidationService } from '../services/validationService.js'
import { parseAcceptanceStatus } from '../utils/acceptanceStatus.js'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function collectSourceFiles(root: string): string[] {
  const results: string[] = []
  const entries = readdirSync(root)
  for (const entry of entries) {
    const fullPath = resolve(root, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      results.push(...collectSourceFiles(fullPath))
      continue
    }
    if (fullPath.endsWith('.ts')) {
      results.push(fullPath)
    }
  }
  return results
}

describe('P7 compatibility cleanup', () => {
  it('rejects legacy acceptance statuses from the canonical parser and validator', () => {
    expect(parseAcceptanceStatus('in_acceptance')).toBe('inspecting')
    expect(parseAcceptanceStatus('rectification')).toBe('rectifying')
    expect(parseAcceptanceStatus('recorded')).toBe('archived')

    for (const legacyStatus of ['in_progress', 'failed', 'needs_revision', '待验收', '未通过']) {
      expect(parseAcceptanceStatus(legacyStatus)).toBeNull()
    }

    const validation = ValidationService.validateAcceptanceStatusUpdate('inspecting', '整改中')
    expect(validation.valid).toBe(true)
  })

  it('rejects unknown acceptance statuses from the canonical parser and validator', () => {
    const validation = ValidationService.validateAcceptanceStatusUpdate('inspecting', 'needs_revision')
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('验收状态无效，必须使用标准状态枚举')
  })

  it('removes the legacy certificate approvals route and deprecated adapters from runtime entrypoints', () => {
    expect(existsSync(resolve(serverRoot, 'src', 'routes', 'certificate-approvals.ts'))).toBe(false)
    expect(existsSync(resolve(serverRoot, 'src', 'services', 'autoAlertService.ts'))).toBe(false)
    expect(existsSync(resolve(serverRoot, 'src', 'utils', 'riskDetector.ts'))).toBe(false)
    expect(existsSync(resolve(serverRoot, 'src', 'utils', 'notificationService.ts'))).toBe(false)

    const indexSource = readFileSync(resolve(serverRoot, 'src', 'index.ts'), 'utf8')
    expect(indexSource).not.toContain('certificateApprovalsRoutes')
    expect(indexSource).not.toContain('/api/certificate-approvals')
  })

  it('keeps runtime sources free from removed compatibility bridges', () => {
    const runtimeRoots = [
      resolve(serverRoot, 'src', 'routes'),
      resolve(serverRoot, 'src', 'services'),
      resolve(serverRoot, 'src', 'middleware'),
    ]
    const runtimeFiles = runtimeRoots.flatMap(collectSourceFiles)

    const bannedTokens = [
      'depends_on',
      'OBSTACLE_STATUS_UNRESOLVABLE',
      'legacy is_critical compatibility',
      "status = 'occurred'",
      "occurred: 1",
    ]

    for (const file of runtimeFiles) {
      const source = readFileSync(file, 'utf8')
      for (const token of bannedTokens) {
        expect(source).not.toContain(token)
      }
    }
  })

  it('keeps live migration and full snapshots aligned with the cleaned acceptance model', () => {
    const migrationFiles = [
      '091a_remove_legacy_compatibility_bridges.sql',
      'FULL_MIGRATION_ALL_IN_ONE.sql',
      'FULL_MIGRATION_ALL_IN_ONE_FIXED.sql',
      'CLEAN_MIGRATION.sql',
      'CLEAN_MIGRATION_V2.sql',
      'CLEAN_MIGRATION_V3.sql',
      'CLEAN_MIGRATION_V4.sql',
    ]

    for (const filename of migrationFiles) {
      const migration = readFileSync(resolve(serverRoot, 'migrations', filename), 'utf8')
      expect(migration).toContain('DROP COLUMN IF EXISTS depends_on')
      expect(migration).toContain('acceptance_plans_status_check_p7')
      expect(migration).toContain('acceptance_nodes_status_check_p7')
      expect(migration).toContain('task_obstacles_status_check_p7')
      expect(migration).toContain('migrated from legacy is_critical flag')
    }
  })
})
