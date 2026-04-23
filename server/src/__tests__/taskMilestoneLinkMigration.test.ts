import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('task milestone link migration', () => {
  it('reconciles tasks.milestone_id as a first-class runtime column', () => {
    const migration = readServerFile('migrations', '088_reconcile_tasks_milestone_link.sql')

    expect(migration).toContain('ALTER TABLE public.tasks')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS milestone_id UUID')
    expect(migration).toContain('FROM public.task_milestones')
    expect(migration).toContain('ADD CONSTRAINT fk_tasks_milestone_id')
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id')
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
