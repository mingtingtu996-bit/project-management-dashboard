import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('\\server') ? process.cwd() : resolve(process.cwd(), 'server')
const migrationPath = resolve(serverRoot, 'migrations/184_create_company_project_templates.sql')

describe('company project templates migration', () => {
  it('uses a partial unique index instead of invalid table constraint syntax', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).not.toMatch(/UNIQUE\s*\(\s*company_id\s*,\s*name\s*\)\s*WHERE\s+deleted_at\s+IS\s+NULL/i)
    expect(sql).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_company_project_templates_active_name\s+ON\s+(?:public\.)?company_project_templates\s*\(\s*company_id\s*,\s*name\s*\)\s+WHERE\s+deleted_at\s+IS\s+NULL/i,
    )
  })
})
