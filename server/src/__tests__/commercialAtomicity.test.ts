import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  getProject: vi.fn(),
}))

vi.mock('../database.js', () => ({
  getClient: mocks.getClient,
}))

vi.mock('../services/dbService.js', () => ({
  getProject: mocks.getProject,
}))

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'

function result(rows: Array<Record<string, unknown>> = [], rowCount = rows.length) {
  return { rows, rowCount }
}

function commercialRow(overrides: Record<string, unknown> = {}) {
  return {
    company_id: COMPANY_ID,
    plan_tier: 'free',
    commercial_state: 'active',
    active_project_limit: 1,
    billing_enabled: true,
    onboarded_at: '2026-07-11T00:00:00.000Z',
    plan_started_at: null,
    plan_expires_at: null,
    updated_by: null,
    updated_at: '2026-07-11T00:00:00.000Z',
    ...overrides,
  }
}

function buildClient(handler: (sql: string, params?: unknown[]) => Promise<unknown> | unknown) {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => handler(sql, params)),
    release: vi.fn(),
  }
}

describe('commercial atomic operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProject.mockResolvedValue({
      id: PROJECT_ID,
      company_id: COMPANY_ID,
      owner_id: USER_ID,
      name: 'Atomic project',
    })
  })

  it('locks the company commercial row before counting and inserting a project', async () => {
    const client = buildClient((sql) => {
      if (sql.includes('FROM public.company_commercial') && sql.includes('FOR UPDATE')) {
        return result([commercialRow()])
      }
      if (sql.includes('COUNT(*)::int') && sql.includes('FROM public.projects')) return result([{ count: 0 }])
      if (sql.includes('INSERT INTO public.projects')) return result([{ id: PROJECT_ID }])
      return result()
    })
    mocks.getClient.mockResolvedValue(client)

    const { createProjectUnderCommercialGuard } = await import('../services/commercialTransactionService.js')
    const project = await createProjectUnderCommercialGuard({
      project: {
        id: PROJECT_ID,
        name: 'Atomic project',
        company_id: COMPANY_ID,
        owner_id: USER_ID,
        created_by: USER_ID,
      },
      actorUserId: USER_ID,
    })

    expect(project.id).toBe(PROJECT_ID)
    const statements = client.query.mock.calls.map(([sql]) => String(sql))
    const lockIndex = statements.findIndex((sql) => sql.includes('FROM public.company_commercial') && sql.includes('FOR UPDATE'))
    const countIndex = statements.findIndex((sql) => sql.includes('COUNT(*)::int') && sql.includes('FROM public.projects'))
    const insertIndex = statements.findIndex((sql) => sql.includes('INSERT INTO public.projects'))
    expect(lockIndex).toBeGreaterThan(-1)
    expect(countIndex).toBeGreaterThan(lockIndex)
    expect(insertIndex).toBeGreaterThan(countIndex)
    expect(statements).toContain('BEGIN')
    expect(statements).toContain('COMMIT')
    expect(statements).not.toContain('ROLLBACK')
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('executes alternate project writers inside the same commercial guard transaction', async () => {
    const client = buildClient((sql) => {
      if (sql.includes('FROM public.company_commercial') && sql.includes('FOR UPDATE')) {
        return result([commercialRow()])
      }
      if (sql.includes('COUNT(*)::int') && sql.includes('FROM public.projects')) return result([{ count: 0 }])
      if (sql.includes('INSERT INTO public.projects')) return result([{ id: PROJECT_ID }])
      return result()
    })
    mocks.getClient.mockResolvedValue(client)

    const { executeProjectCreationUnderCommercialGuard } = await import('../services/commercialTransactionService.js')
    const projectId = await executeProjectCreationUnderCommercialGuard({
      companyId: COMPANY_ID,
      actorUserId: USER_ID,
      create: async (transactionClient) => {
        const inserted = await transactionClient.query(
          'INSERT INTO public.projects (id, company_id) VALUES ($1, $2) RETURNING id',
          [PROJECT_ID, COMPANY_ID],
        )
        return String(inserted.rows[0]?.id)
      },
    })

    expect(projectId).toBe(PROJECT_ID)
    const statements = client.query.mock.calls.map(([sql]) => String(sql))
    const lockIndex = statements.findIndex((sql) => sql.includes('FROM public.company_commercial') && sql.includes('FOR UPDATE'))
    const countIndex = statements.findIndex((sql) => sql.includes('COUNT(*)::int') && sql.includes('FROM public.projects'))
    const insertIndex = statements.findIndex((sql) => sql.includes('INSERT INTO public.projects'))
    expect(lockIndex).toBeGreaterThan(-1)
    expect(countIndex).toBeGreaterThan(lockIndex)
    expect(insertIndex).toBeGreaterThan(countIndex)
    expect(statements.at(-1)).toBe('COMMIT')
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('does not invoke alternate project writers when the commercial limit is reached', async () => {
    const client = buildClient((sql) => {
      if (sql.includes('FROM public.company_commercial') && sql.includes('FOR UPDATE')) {
        return result([commercialRow({ active_project_limit: 1 })])
      }
      if (sql.includes('COUNT(*)::int') && sql.includes('FROM public.projects')) return result([{ count: 1 }])
      return result()
    })
    mocks.getClient.mockResolvedValue(client)
    const create = vi.fn()

    const { executeProjectCreationUnderCommercialGuard } = await import('../services/commercialTransactionService.js')
    await expect(executeProjectCreationUnderCommercialGuard({
      companyId: COMPANY_ID,
      actorUserId: USER_ID,
      create,
    })).rejects.toMatchObject({
      code: 'COMMERCIAL_PROJECT_LIMIT_REACHED',
      statusCode: 402,
    })

    expect(create).not.toHaveBeenCalled()
    expect(client.query.mock.calls.map(([sql]) => String(sql)).at(-1)).toBe('COMMIT')
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('commits denied-attempt metering but never inserts an over-quota project', async () => {
    const client = buildClient((sql) => {
      if (sql.includes('FROM public.company_commercial') && sql.includes('FOR UPDATE')) {
        return result([commercialRow({ active_project_limit: 1 })])
      }
      if (sql.includes('COUNT(*)::int') && sql.includes('FROM public.projects')) return result([{ count: 1 }])
      return result()
    })
    mocks.getClient.mockResolvedValue(client)

    const { createProjectUnderCommercialGuard } = await import('../services/commercialTransactionService.js')
    await expect(createProjectUnderCommercialGuard({
      project: {
        id: PROJECT_ID,
        name: 'Over quota',
        company_id: COMPANY_ID,
        owner_id: USER_ID,
        created_by: USER_ID,
      },
      actorUserId: USER_ID,
    })).rejects.toMatchObject({
      code: 'COMMERCIAL_PROJECT_LIMIT_REACHED',
      statusCode: 402,
    })

    const statements = client.query.mock.calls.map(([sql]) => String(sql))
    expect(client.query.mock.calls.some(([, params]) => Array.isArray(params) && params.includes('commercial_metering_recorded'))).toBe(true)
    expect(statements.some((sql) => sql.includes('INSERT INTO public.projects'))).toBe(false)
    expect(statements).toContain('COMMIT')
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('rolls back project and membership writes together on failure', async () => {
    const client = buildClient((sql) => {
      if (sql.includes('FROM public.company_commercial') && sql.includes('FOR UPDATE')) return result([commercialRow()])
      if (sql.includes('COUNT(*)::int') && sql.includes('FROM public.projects')) return result([{ count: 0 }])
      if (sql.includes('INSERT INTO public.projects')) return result([{ id: PROJECT_ID }])
      if (sql.includes('INSERT INTO public.project_members')) throw new Error('membership_write_failed')
      return result()
    })
    mocks.getClient.mockResolvedValue(client)

    const { createProjectUnderCommercialGuard } = await import('../services/commercialTransactionService.js')
    await expect(createProjectUnderCommercialGuard({
      project: {
        id: PROJECT_ID,
        name: 'Rollback project',
        company_id: COMPANY_ID,
        owner_id: USER_ID,
        created_by: USER_ID,
      },
      actorUserId: USER_ID,
    })).rejects.toThrow('membership_write_failed')

    const statements = client.query.mock.calls.map(([sql]) => String(sql))
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
    expect(mocks.getProject).not.toHaveBeenCalled()
  })

  it('rejects a provider event collision from another company before applying payment', async () => {
    const client = buildClient((sql) => {
      if (sql.includes('FROM public.company_commercial_orders') && sql.includes('FOR UPDATE')) {
        return result([{
          id: 'order-1',
          company_id: COMPANY_ID,
          plan_tier: 'starter',
          payment_status: 'pending',
          payment_provider: 'manual',
        }])
      }
      if (sql.includes('INSERT INTO public.company_commercial_payment_events')) return result([], 0)
      if (sql.includes('FROM public.company_commercial_payment_events') && sql.includes('FOR UPDATE')) {
        return result([{
          id: 99,
          order_id: 'other-order',
          company_id: '33333333-3333-4333-8333-333333333333',
          payment_provider: 'manual',
          provider_event_id: 'provider-event-1',
          event_status: 'verified',
        }])
      }
      return result()
    })
    mocks.getClient.mockResolvedValue(client)

    const { recordCommercialPaymentEventAtomic } = await import('../services/commercialTransactionService.js')
    await expect(recordCommercialPaymentEventAtomic({
      companyId: COMPANY_ID,
      orderId: 'order-1',
      paymentProvider: 'manual',
      eventType: 'payment_succeeded',
      eventStatus: 'verified',
      providerEventId: 'provider-event-1',
      actorUserId: USER_ID,
    })).rejects.toMatchObject({
      code: 'COMMERCIAL_PAYMENT_EVENT_SCOPE_CONFLICT',
      statusCode: 409,
    })

    const statements = client.query.mock.calls.map(([sql]) => String(sql))
    expect(statements).toContain('ROLLBACK')
    expect(statements.some((sql) => sql.includes('UPDATE public.company_commercial\n'))).toBe(false)
    expect(statements.some((sql) => sql.includes("SET payment_status = 'paid'"))).toBe(false)
  })

  it('applies order, state, audit and event in one transaction', async () => {
    const client = buildClient((sql) => {
      if (sql.includes('FROM public.company_commercial_orders') && sql.includes('FOR UPDATE')) {
        return result([{
          id: 'order-1',
          company_id: COMPANY_ID,
          plan_tier: 'starter',
          amount_cents: 4900,
          payment_status: 'pending',
          payment_provider: 'manual',
        }])
      }
      if (sql.includes('INSERT INTO public.company_commercial_payment_events')) {
        return result([{
          id: 100,
          order_id: 'order-1',
          company_id: COMPANY_ID,
          payment_provider: 'manual',
          event_type: 'payment_succeeded',
          event_status: 'verified',
          provider_event_id: 'provider-event-2',
          payload: {},
        }])
      }
      if (sql.includes('FROM public.company_commercial') && sql.includes('FOR UPDATE')) {
        return result([commercialRow({ plan_tier: 'free' })])
      }
      if (sql.includes('UPDATE public.company_commercial\n')) {
        return result([commercialRow({ plan_tier: 'starter', active_project_limit: 2 })])
      }
      if (sql.includes("SET payment_status = 'paid'")) return result([{ id: 'order-1', payment_status: 'paid' }])
      if (sql.includes("SET event_status = 'applied'")) return result([{ id: 100, event_status: 'applied' }])
      return result()
    })
    mocks.getClient.mockResolvedValue(client)

    const { recordCommercialPaymentEventAtomic } = await import('../services/commercialTransactionService.js')
    const outcome = await recordCommercialPaymentEventAtomic({
      companyId: COMPANY_ID,
      orderId: 'order-1',
      paymentProvider: 'manual',
      eventType: 'payment_succeeded',
      eventStatus: 'verified',
      providerEventId: 'provider-event-2',
      actorUserId: USER_ID,
    })

    expect(outcome).toMatchObject({ applied: true, reason: 'payment_applied' })
    const statements = client.query.mock.calls.map(([sql]) => String(sql))
    expect(statements[0]).toBe('BEGIN')
    expect(statements.at(-1)).toBe('COMMIT')
    expect(statements.some((sql) => sql.includes("SET payment_status = 'paid'"))).toBe(true)
    expect(client.query.mock.calls.some(([, params]) => Array.isArray(params) && params.includes('commercial_payment_event_applied'))).toBe(true)
    expect(statements.some((sql) => sql.includes("SET event_status = 'applied'"))).toBe(true)
    expect(client.release).toHaveBeenCalledOnce()
  })
})
