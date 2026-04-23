import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import { auditDb, AuditActions, getActionDescription, logAction } from '@/lib/auditLog'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const PROJECT_ID = '00000000-0000-4000-8000-000000000002'
const OTHER_PROJECT_ID = '00000000-0000-4000-8000-000000000003'

// Provide a functional in-memory localStorage so auditDb can persist within a test
const store: Record<string, string> = {}
const functionalLocalStorage: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
  get length() { return Object.keys(store).length },
  key: (index: number) => Object.keys(store)[index] ?? null,
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: functionalLocalStorage, configurable: true })
  functionalLocalStorage.clear()
})

afterEach(() => {
  functionalLocalStorage.clear()
})

describe('auditDb.create and getByProject', () => {
  it('creates a log entry with auto-generated id and timestamp', () => {
    const log = auditDb.create({
      project_id: PROJECT_ID,
      user_id: USER_ID,
      user_name: '张三',
      action: AuditActions.TASK_CREATE,
      resource_type: 'task',
      resource_id: '00000000-0000-4000-8000-000000000099',
      resource_name: '测试任务',
    })

    expect(log.id).toBeTruthy()
    expect(log.timestamp).toBeTruthy()
    expect(log.action).toBe(AuditActions.TASK_CREATE)
  })

  it('getByProject returns only logs for the given project', () => {
    auditDb.create({
      project_id: PROJECT_ID,
      user_id: USER_ID,
      user_name: '张三',
      action: AuditActions.TASK_CREATE,
      resource_type: 'task',
    })
    auditDb.create({
      project_id: OTHER_PROJECT_ID,
      user_id: USER_ID,
      user_name: '张三',
      action: AuditActions.RISK_CREATE,
      resource_type: 'risk',
    })

    const logs = auditDb.getByProject(PROJECT_ID, 100)
    expect(logs.every((l) => l.project_id === PROJECT_ID)).toBe(true)
    expect(logs).toHaveLength(1)
    expect(logs[0]?.action).toBe(AuditActions.TASK_CREATE)
  })

  it('respects the limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      auditDb.create({
        project_id: PROJECT_ID,
        user_id: USER_ID,
        user_name: '张三',
        action: AuditActions.TASK_UPDATE,
        resource_type: 'task',
      })
    }

    const logs = auditDb.getByProject(PROJECT_ID, 3)
    expect(logs).toHaveLength(3)
  })
})

describe('Chapter-level (resource_type) specific logging', () => {
  it('creates task logs with resource_type=task', () => {
    const log = auditDb.create({
      project_id: PROJECT_ID,
      user_id: USER_ID,
      user_name: '张三',
      action: AuditActions.TASK_UPDATE,
      resource_type: 'task',
      details: { field: 'progress', from: 0, to: 80 },
    })
    expect(log.resource_type).toBe('task')
    expect(log.details?.field).toBe('progress')
  })

  it('creates risk logs with resource_type=risk', () => {
    const log = auditDb.create({
      project_id: PROJECT_ID,
      user_id: USER_ID,
      user_name: '李四',
      action: AuditActions.RISK_CREATE,
      resource_type: 'risk',
      resource_name: '成本超支风险',
    })
    expect(log.resource_type).toBe('risk')
    expect(log.resource_name).toBe('成本超支风险')
  })

  it('creates milestone logs with resource_type=milestone', () => {
    const log = auditDb.create({
      project_id: PROJECT_ID,
      user_id: USER_ID,
      user_name: '王五',
      action: AuditActions.MILESTONE_CREATE,
      resource_type: 'milestone',
      resource_name: '主体封顶',
    })
    expect(log.resource_type).toBe('milestone')
  })

  it('creates member invite logs with resource_type=member', () => {
    const log = auditDb.create({
      project_id: PROJECT_ID,
      user_id: USER_ID,
      user_name: '张三',
      action: AuditActions.MEMBER_INVITE,
      resource_type: 'member',
      details: { permission: 'editor' },
    })
    expect(log.resource_type).toBe('member')
    expect(log.details?.permission).toBe('editor')
  })
})

describe('logAction helper', () => {
  it('creates a log via logAction', () => {
    logAction(PROJECT_ID, USER_ID, '张三', AuditActions.DATA_EXPORT, 'data', {
      details: { format: 'csv' },
    })

    const logs = auditDb.getByProject(PROJECT_ID, 10)
    expect(logs.some((l) => l.action === AuditActions.DATA_EXPORT)).toBe(true)
  })
})

describe('getActionDescription', () => {
  it('returns Chinese description for known actions', () => {
    expect(getActionDescription(AuditActions.TASK_CREATE)).toBe('创建任务')
    expect(getActionDescription(AuditActions.MEMBER_INVITE)).toBe('邀请成员')
    expect(getActionDescription(AuditActions.DATA_EXPORT)).toBe('导出数据')
  })

  it('returns the raw action string for unknown actions', () => {
    expect(getActionDescription('custom:action')).toBe('custom:action')
  })
})
