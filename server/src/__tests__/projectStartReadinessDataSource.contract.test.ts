import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readServiceSource() {
  const cwd = process.cwd()
  const root = cwd.split(/[\\/]/).pop()?.toLowerCase() === 'server' ? resolve(cwd, '..') : cwd
  return readFileSync(resolve(root, 'server', 'src', 'services', 'projectStartReadinessService.ts'), 'utf8')
}

describe('projectStartReadinessDataSource contract', () => {
  it('uses structured Supabase reads and canonical responsibility display columns', () => {
    const source = readServiceSource()

    expect(source).toContain("import { supabase } from './dbService.js'")
    expect(source).not.toContain('executeSQL')
    expect(source).toMatch(/\.from\('projects'\)/)
    expect(source).toMatch(/\.from\('task_conditions'\)/)
    expect(source).toMatch(/\.from\('project_entity_links'\)/)
    expect(source).toMatch(/\.from\('users'\)/)
    expect(source).toContain('display_name')
    expect(source).not.toContain('id, username, name, email FROM users')
    expect(source).not.toContain('id, unit_name, name FROM participant_units')
  })
})
