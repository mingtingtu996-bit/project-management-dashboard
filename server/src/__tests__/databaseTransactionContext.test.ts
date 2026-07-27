import { describe, expect, it, vi } from 'vitest'

import {
  getClient,
  isDatabaseTransactionActive,
  query,
  registerDatabasePostCommitEffect,
  runWithDatabaseTransactionClient,
} from '../database.js'
import { runWithJobLeaseFenceContext } from '../services/jobLeaseFenceContext.js'

function createClient(events: string[]) {
  return {
    query: vi.fn(async (sql: string) => {
      events.push(String(sql).trim())
      return { rows: [], rowCount: 0 }
    }),
    release: vi.fn(() => events.push('RELEASE')),
  }
}

describe('database transaction context', () => {
  it('reuses one client for nested services and runs effects only after the outer commit', async () => {
    const events: string[] = []
    const client = createClient(events)
    const controller = new AbortController()

    await runWithDatabaseTransactionClient(client, async () => {
      expect(isDatabaseTransactionActive()).toBe(true)
      const nestedClient = await getClient()
      await nestedClient.query('BEGIN')
      await nestedClient.query('INSERT INTO tasks (id) VALUES ($1)', ['task-1'])
      await nestedClient.query('COMMIT')
      nestedClient.release()
      await query('SELECT 1')
      await registerDatabasePostCommitEffect('notify', async () => {
        events.push('POST_COMMIT_EFFECT')
      })
    }, { signal: controller.signal })

    expect(events).toEqual([
      'BEGIN',
      'INSERT INTO tasks (id) VALUES ($1)',
      'SELECT 1',
      'COMMIT',
      'RELEASE',
      'POST_COMMIT_EFFECT',
    ])
  })

  it('rolls back instead of committing when the attempt aborts after deferred work returns', async () => {
    const events: string[] = []
    const client = createClient(events)
    const controller = new AbortController()
    const timeoutError = Object.assign(new Error('transaction attempt timed out'), {
      code: 'JOB_ATTEMPT_TIMEOUT',
    })
    let releaseWork!: () => void
    const workStarted = new Promise<void>((resolveStarted) => {
      releaseWork = resolveStarted
    })
    let markWorkStarted!: () => void
    const workEntered = new Promise<void>((resolveEntered) => {
      markWorkStarted = resolveEntered
    })

    const transaction = runWithDatabaseTransactionClient(client, async () => {
      markWorkStarted()
      await workStarted
      events.push('WORK_SETTLED')
      queueMicrotask(() => controller.abort(timeoutError))
      return 'late-result'
    }, { signal: controller.signal })

    await workEntered
    releaseWork()

    await expect(transaction).rejects.toBe(timeoutError)
    expect(events).toEqual([
      'BEGIN',
      'WORK_SETTLED',
      'ROLLBACK',
      'RELEASE',
    ])
    expect(events).not.toContain('COMMIT')
  })

  it('does not enter nested transaction work when its attempt signal is already aborted', async () => {
    const events: string[] = []
    const client = createClient(events)
    const controller = new AbortController()
    const timeoutError = Object.assign(new Error('nested transaction attempt timed out'), {
      code: 'JOB_ATTEMPT_TIMEOUT',
    })
    controller.abort(timeoutError)

    await expect(runWithDatabaseTransactionClient(client, async () => {
      await runWithDatabaseTransactionClient(client, async () => {
        events.push('NESTED_WORK')
      }, { signal: controller.signal })
    })).rejects.toBe(timeoutError)

    expect(events).toEqual([
      'BEGIN',
      'ROLLBACK',
      'RELEASE',
    ])
    expect(events).not.toContain('NESTED_WORK')
    expect(events).not.toContain('COMMIT')
  })

  it('marks the outer transaction rollback-only when a nested service rolls back', async () => {
    const events: string[] = []
    const client = createClient(events)

    await expect(runWithDatabaseTransactionClient(client, async () => {
      const nestedClient = await getClient()
      await nestedClient.query('INSERT INTO tasks (id) VALUES ($1)', ['task-1'])
      await nestedClient.query('ROLLBACK')
    })).rejects.toMatchObject({ code: 'TRANSACTION_MARKED_ROLLBACK_ONLY' })

    expect(events).toEqual([
      'BEGIN',
      'INSERT INTO tasks (id) VALUES ($1)',
      'ROLLBACK',
      'RELEASE',
    ])
  })

  it('sets transaction-local lease headers before direct SQL inside an active job lease', async () => {
    const events: string[] = []
    const client = createClient(events)

    await runWithJobLeaseFenceContext({
      jobName: 'conditionAlertJob',
      fenceToken: '11111111-1111-4111-8111-111111111111',
      generation: 7,
    }, async () => {
      await runWithDatabaseTransactionClient(client, async () => {
        await query('UPDATE notifications SET is_read = TRUE WHERE id = $1', ['notification-1'])
      })
    })

    expect(events).toEqual([
      'BEGIN',
      "SELECT set_config('request.headers', $1, TRUE)",
      'UPDATE notifications SET is_read = TRUE WHERE id = $1',
      'COMMIT',
      'RELEASE',
    ])
    expect(client.query).toHaveBeenNthCalledWith(2, "SELECT set_config('request.headers', $1, TRUE)", [JSON.stringify({
      'x-workbuddy-job-name': 'conditionAlertJob',
      'x-workbuddy-job-fence-token': '11111111-1111-4111-8111-111111111111',
      'x-workbuddy-job-fence-generation': '7',
    })])
  })
})
