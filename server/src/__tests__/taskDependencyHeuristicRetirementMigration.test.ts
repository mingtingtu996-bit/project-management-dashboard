import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const migrationName = '324_task_dependency_heuristic_retirement.sql'

function readOptional(...segments: string[]) {
  const path = resolve(serverRoot, ...segments)
  return existsSync(path) ? readFileSync(path, 'utf8').toLowerCase() : ''
}

describe('task dependency heuristic retirement migration', () => {
  it('inactivates only unpublished heuristic dependency rows without deleting evidence', () => {
    const sql = readOptional('migrations', migrationName)

    expect(sql).toContain('update public.task_dependencies')
    expect(sql).toContain("set status = 'inactive'")
    expect(sql).toContain("'heuristic_stagger'")
    expect(sql).toContain("'heuristic_fallback_l0'")
    expect(sql).toContain("'fallback_not_published_dependency_rule'")
    expect(sql).toContain("'candidate_only_until_dependency_rule_replay_publication'")
    expect(sql).toContain("'324_task_dependency_heuristic_retirement'")
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\.task_dependencies\b/)
  })

  it('reactivates only rows tagged by this migration during rollback', () => {
    const sql = readOptional('migrations', 'rollback', migrationName)

    expect(sql).toContain('update public.task_dependencies')
    expect(sql).toContain("set status = 'active'")
    expect(sql).toContain("'324_task_dependency_heuristic_retirement'")
    expect(sql).toContain("metadata - 'formaldependencyretirement'")
  })
})
