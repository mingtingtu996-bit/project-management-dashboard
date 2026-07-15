import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(),
  from: vi.fn(),
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

const { buildAttentionSummary, clearAttentionSummaryCacheForTests } = await import('../services/todoTouchpointService.js')

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

describe('todoTouchpointService attention summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAttentionSummaryCacheForTests()
  })

  it('uses user-state visibility, expiry, and action due dates when aggregating project attention', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-26T02:00:00.000Z'))
    try {
      mocks.rawQuery
        .mockResolvedValueOnce({
          rows: [
            {
              touchpoint_type: 'dashboard_todo',
              total_count: 3,
              unread_count: 0,
              today_todo_count: 2,
              critical_count: 1,
              warning_count: 1,
            },
            {
              touchpoint_type: 'system_record',
              total_count: 5,
              unread_count: 0,
              today_todo_count: 0,
              critical_count: 0,
              warning_count: 0,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: 4 }] })

      const summary = await buildAttentionSummary('project-1', 'company-1', 'user-1')
      const projectQueryCall = mocks.rawQuery.mock.calls.find((call) => String(call[0]).includes('GROUP BY COALESCE(touchpoint_type'))
      const projectSql = String(projectQueryCall?.[0] ?? '')

      expect(projectSql).toContain('LEFT JOIN public.notification_user_states')
      expect(projectSql).toContain('nus.user_id::text = $4::text')
      expect(projectSql).toContain('(n.expires_at IS NULL OR n.expires_at > now())')
      expect(projectSql).toContain('COALESCE(nus.is_hidden, false) = false')
      expect(projectSql).toContain('NOT (COALESCE(nus.is_muted, false) = true')
      expect(projectSql).toContain('COALESCE(nus.is_read, n.is_read, false)')
      expect(projectSql).toContain('n.touchpoint_type = ANY($5::text[])')
      expect(projectSql).toContain('COALESCE(n.action_due_at, n.created_at) >= $2::timestamptz')
      expect(projectSql).toContain('COALESCE(n.action_due_at, n.created_at) < $3::timestamptz')
      expect(projectQueryCall?.[1]).toEqual([
        'project-1',
        '2026-05-25T16:00:00.000Z',
        '2026-05-26T16:00:00.000Z',
        'user-1',
        ['dashboard_todo'],
      ])
      expect(summary.totalAttentionCount).toBe(3)
      expect(summary.todayTodoCount).toBe(2)
      expect(summary.notificationTodayTodoCount).toBe(2)
      expect(summary.warningCount).toBe(2)
      expect(summary.attentionWarningCount).toBe(2)
      expect(summary.workspacePendingCount).toBe(4)
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses the same user-state and expiry contract for workspace pending counts', async () => {
    mocks.rawQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })

    await buildAttentionSummary('project-1', 'company-1', 'user-1')
    const workspaceQueryCall = mocks.rawQuery.mock.calls.find((call) => String(call[0]).includes("scope_type = 'workspace'"))
    const workspaceSql = String(workspaceQueryCall?.[0] ?? '')

    expect(workspaceSql).toContain('LEFT JOIN public.notification_user_states')
    expect(workspaceSql).toContain('nus.user_id::text = $2::text')
    expect(workspaceSql).toContain('(n.expires_at IS NULL OR n.expires_at > now())')
    expect(workspaceSql).toContain('COALESCE(nus.is_hidden, false) = false')
    expect(workspaceSql).toContain('NOT (COALESCE(nus.is_muted, false) = true')
    expect(workspaceSql).toContain('COALESCE(nus.is_read, n.is_read, false) = false')
  })

  it('derives attention and today-todo contribution rules from the touchpoint registry', () => {
    const candidates = [resolve(serverRoot, 'src/services/todoTouchpointService.ts')]
    const servicePath = candidates.find(existsSync)
    if (!servicePath) throw new Error('Unable to read todoTouchpointService.ts')

    const source = readFileSync(servicePath, 'utf8')

    expect(source).toContain('NOTIFICATION_TOUCHPOINT_RULE_REGISTRY')
    expect(source).toContain('isNotificationAttentionTouchpointType')
    expect(source).toContain('isNotificationTodayTodoTouchpointType')
    expect(source).not.toContain("new Set(['persistent', 'dashboard_todo', 'popup', 'page_banner'])")
    expect(source).not.toContain("const TOUCHPOINT_TYPES = ['persistent', 'dashboard_todo', 'popup', 'page_banner', 'system_record']")
  })
})
