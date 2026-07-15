import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const mocks = vi.hoisted(() => {
  let reminders: Array<Record<string, unknown>> = []

  const warningServiceInstance = {
    generateReminders: vi.fn(async () => reminders),
  }

  return {
    warningServiceInstance,
    insertNotification: vi.fn(async () => null),
    dismissReminder: vi.fn(async () => undefined),
    upsertReminderPreference: vi.fn(async () => undefined),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    setReminders(list: Array<Record<string, unknown>>) {
      reminders = list
    },
  }
})

vi.mock('../services/warningService.js', () => ({
  WarningService: vi.fn().mockImplementation(() => mocks.warningServiceInstance),
}))

vi.mock('../services/notificationStore.js', () => ({
  insertNotification: mocks.insertNotification,
}))

vi.mock('../services/reminderPreferencesService.js', () => ({
  dismissReminder: mocks.dismissReminder,
  upsertReminderPreference: mocks.upsertReminderPreference,
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'company_admin' }
    next()
  }),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyId: vi.fn(async () => 'company-1'),
  getCurrentCompanyMembership: vi.fn(async () => ({ companyId: 'company-1', role: 'company_admin' })),
  getProjectPermissionLevel: vi.fn(async () => 'editor'),
  getVisibleProjectIds: vi.fn(async () => ['project-1']),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'company-1'),
}))

const { default: remindersRouter } = await import('../routes/reminders.js')
const { errorHandler } = await import('../middleware/errorHandler.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/reminders', remindersRouter)
  app.use(errorHandler)
  return app
}

describe('reminders route hardening', () => {
  beforeEach(() => {
    mocks.setReminders([])
    vi.clearAllMocks()
  })

  it('accepts project_id alias when fetching active reminders', async () => {
    mocks.setReminders([
      { id: 'reminder-1', title: '进行中', is_dismissed: false },
      { id: 'reminder-2', title: '已关闭', is_dismissed: true },
    ])

    const response = await supertest(buildApp())
      .get('/api/reminders/active')
      .query({ project_id: 'project-1' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveLength(1)
    expect(response.body.data[0]).toMatchObject({ id: 'reminder-1' })
    expect(mocks.warningServiceInstance.generateReminders).toHaveBeenCalledWith('project-1')
  })

  it('persists a dismiss record when closing a reminder', async () => {
    const response = await supertest(buildApp())
      .put('/api/reminders/reminder-1/dismiss')
      .send({ dismissed_by: '张工' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.message).toBe('弹窗已关闭')
    expect(mocks.dismissReminder).toHaveBeenCalledWith('user-1', 'reminder-1')
    expect(mocks.insertNotification).not.toHaveBeenCalled()
  })

  it('updates settings with project_id alias and persists the payload', async () => {
    const payload = {
      condition_reminder_days: [3, 1],
      obstacle_reminder_days: [7],
      acceptance_reminder_days: [7, 3, 1],
      enable_popup: true,
      enable_notification: false,
      extra_flag: 'keep-compatible',
    }

    const response = await supertest(buildApp())
      .put('/api/reminders/settings')
      .query({ project_id: 'project-1' })
      .send(payload)
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.message).toBe('提醒设置已更新')
    expect(mocks.upsertReminderPreference).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        companyId: 'company-1',
        reminderDaysBefore: 3,
        popupEnabled: true,
        emailEnabled: false,
      }),
    )
    expect(mocks.insertNotification).not.toHaveBeenCalled()
  })
})
