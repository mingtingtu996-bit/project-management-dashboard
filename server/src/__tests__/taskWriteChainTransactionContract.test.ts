import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server')

describe('task write chain transaction contract', () => {
  it('defers post-commit side effects when a request transaction is active', () => {
    const source = readFileSync(resolve(serverRoot, 'src/services/taskWriteChainService.ts'), 'utf8')
    const helper = source.slice(
      source.indexOf('async function runPostCommitTaskSideEffect'),
      source.indexOf('async function resolveActiveParticipantUnit'),
    )

    expect(source).toContain('registerDatabasePostCommitEffect')
    expect(helper).toContain('isDatabaseTransactionActive()')
    expect(helper).toContain('registerDatabasePostCommitEffect')
  })

  it('keeps delete link mutation on the PostgreSQL transaction path', () => {
    const source = readFileSync(resolve(serverRoot, 'src/services/taskWriteChainService.ts'), 'utf8')
    const deleteChain = source.slice(
      source.indexOf('export async function deleteTaskInMainChain'),
      source.indexOf('async function refreshTaskWbsFlags'),
    )

    expect(deleteChain).toContain("UPDATE project_entity_links SET status = 'inactive'")
    expect(deleteChain).not.toContain("supabase\n    .from('project_entity_links')")
    expect(deleteChain).toContain("runPostCommitTaskSideEffect('finalize_task_delete'")
  })
})
