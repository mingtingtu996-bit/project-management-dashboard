import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

type DeleteBuilder = {
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  then: Promise<{ error: null }>['then']
  catch: Promise<{ error: null }>['catch']
  finally: Promise<{ error: null }>['finally']
}

const mocks = vi.hoisted(() => {
  const builders: DeleteBuilder[] = []

  function createDeleteBuilder(): DeleteBuilder {
    const result = Promise.resolve({ error: null })
    const builder = {} as DeleteBuilder

    builder.delete = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.then = result.then.bind(result)
    builder.catch = result.catch.bind(result)
    builder.finally = result.finally.bind(result)

    builders.push(builder)
    return builder
  }

  return {
    builders,
    from: vi.fn(() => createDeleteBuilder()),
    rpc: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

const { deleteTask } = await import('../services/dbService.js')

describe('dbService.deleteTask fallback', () => {
  beforeEach(() => {
    mocks.builders.length = 0
    mocks.from.mockClear()
    mocks.rpc.mockReset()
    mocks.logger.warn.mockClear()
  })

  it('falls back to direct task deletion when the delete RPC references a missing task_preceding_relations table', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'relation \"public.task_preceding_relations\" does not exist' },
    })

    await deleteTask('task-1')

    expect(mocks.rpc).toHaveBeenCalledWith('delete_task_with_source_backfill_atomic', {
      p_task_id: 'task-1',
    })
    expect(mocks.from).toHaveBeenCalledWith('tasks')
    expect(mocks.builders[0]?.delete).toHaveBeenCalled()
    expect(mocks.builders[0]?.eq).toHaveBeenCalledWith('id', 'task-1')
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'Falling back to direct task delete because task_preceding_relations is missing inside delete RPC',
      { id: 'task-1' },
    )
  })

  it('rethrows unrelated RPC failures', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for function delete_task_with_source_backfill_atomic' },
    })

    await expect(deleteTask('task-2')).rejects.toThrow('permission denied')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
