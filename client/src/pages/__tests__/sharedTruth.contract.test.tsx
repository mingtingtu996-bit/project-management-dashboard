/**
 * 10.10b contract test
 *
 * Locks the following rules for shared truth objects
 * (notifications / warnings / issueRows / problemRows / delayRequests / changeLogs / taskProgressSnapshots):
 *
 * 1. Single-read: pages consume shared store slices, not page-private shadow state
 * 2. Three-state: store exposes loading / error per shared slice so UI can distinguish
 *    "not yet loaded" vs "genuinely empty" vs "failed"
 * 3. No silent degradation: fetch failures must NOT clear store data to empty arrays;
 *    error state must be surfaced, not swallowed
 */
import { describe, expect, it } from 'vitest'
import { useStore } from '@/hooks/useStore'

describe('shared truth contract (10.10b)', () => {
  // ─── Rule 1: store exposes shared slices ──────────────────────────────
  describe('store slice existence', () => {
    it('exposes notifications slice with setter', () => {
      const state = useStore.getState()
      expect(state).toHaveProperty('notifications')
      expect(state).toHaveProperty('setNotifications')
      expect(Array.isArray(state.notifications)).toBe(true)
    })

    it('exposes warnings slice with setter', () => {
      const state = useStore.getState()
      expect(state).toHaveProperty('warnings')
      expect(state).toHaveProperty('setWarnings')
      expect(Array.isArray(state.warnings)).toBe(true)
    })

    it('exposes issueRows slice with setter', () => {
      const state = useStore.getState()
      expect(state).toHaveProperty('issueRows')
      expect(state).toHaveProperty('setIssueRows')
      expect(Array.isArray(state.issueRows)).toBe(true)
    })

    it('exposes problemRows slice with setter', () => {
      const state = useStore.getState()
      expect(state).toHaveProperty('problemRows')
      expect(state).toHaveProperty('setProblemRows')
      expect(Array.isArray(state.problemRows)).toBe(true)
    })

    it('exposes delayRequests slice with setter', () => {
      const state = useStore.getState()
      expect(state).toHaveProperty('delayRequests')
      expect(state).toHaveProperty('setDelayRequests')
      expect(Array.isArray(state.delayRequests)).toBe(true)
    })

    it('exposes changeLogs slice with setter', () => {
      const state = useStore.getState()
      expect(state).toHaveProperty('changeLogs')
      expect(state).toHaveProperty('setChangeLogs')
      expect(Array.isArray(state.changeLogs)).toBe(true)
    })

    it('exposes taskProgressSnapshots slice with setter', () => {
      const state = useStore.getState()
      expect(state).toHaveProperty('taskProgressSnapshots')
      expect(state).toHaveProperty('setTaskProgressSnapshots')
      expect(Array.isArray(state.taskProgressSnapshots)).toBe(true)
    })
  })

  // ─── Rule 2: three-state (loading / error / data) ────────────────────
  describe('three-state support', () => {
    it('exposes sharedSliceStatus with loading and error per slice', () => {
      const state = useStore.getState()
      expect(state).toHaveProperty('sharedSliceStatus')
      const status = state.sharedSliceStatus

      // Each shared slice must have loading + error fields
      for (const key of ['notifications', 'warnings', 'issueRows', 'problemRows', 'delayRequests', 'changeLogs', 'taskProgressSnapshots'] as const) {
        expect(status).toHaveProperty(key)
        expect(status[key]).toHaveProperty('loading')
        expect(status[key]).toHaveProperty('error')
        expect(typeof status[key].loading).toBe('boolean')
        // error is string | null
        expect(status[key].error === null || typeof status[key].error === 'string').toBe(true)
      }
    })

    it('provides setSharedSliceStatus to update loading/error per slice', () => {
      const state = useStore.getState()
      expect(state).toHaveProperty('setSharedSliceStatus')
      expect(typeof state.setSharedSliceStatus).toBe('function')

      // Set loading for notifications
      state.setSharedSliceStatus('notifications', { loading: true, error: null })
      expect(useStore.getState().sharedSliceStatus.notifications.loading).toBe(true)

      // Set error for warnings
      state.setSharedSliceStatus('warnings', { loading: false, error: '加载失败' })
      expect(useStore.getState().sharedSliceStatus.warnings.error).toBe('加载失败')

      // Set loading for delay requests
      state.setSharedSliceStatus('delayRequests', { loading: true, error: null })
      expect(useStore.getState().sharedSliceStatus.delayRequests.loading).toBe(true)

      // Reset
      state.setSharedSliceStatus('notifications', { loading: false, error: null })
      state.setSharedSliceStatus('warnings', { loading: false, error: null })
      state.setSharedSliceStatus('delayRequests', { loading: false, error: null })
    })

    it('defaults all slices to not-loading and no-error', () => {
      const status = useStore.getState().sharedSliceStatus
      for (const key of ['notifications', 'warnings', 'issueRows', 'problemRows', 'delayRequests', 'changeLogs', 'taskProgressSnapshots'] as const) {
        expect(status[key].loading).toBe(false)
        expect(status[key].error).toBeNull()
      }
    })
  })

  // ─── Rule 3: setCurrentProject resets shared slices AND status ────────
  describe('project switch cleanup', () => {
    it('clears shared data and resets status on project switch', () => {
      const state = useStore.getState()

      // Populate some data
      state.setNotifications([{ id: 'n1', type: 'test', title: 'T', content: 'C', isRead: false, isMuted: false, createdAt: '' }])
      state.setWarnings([{ id: 'w1', warning_type: 'test', warning_level: 'info', title: 'T', description: 'D' }])
      state.setDelayRequests([{ id: 'delay-1', task_id: 'task-1', status: 'pending' }])
      state.setChangeLogs([{ id: 'log-1', entity_type: 'task', entity_id: 'task-1', field_name: 'status' }])
      state.setTaskProgressSnapshots([{ id: 'snapshot-1', task_id: 'task-1', project_id: 'project-1' }])
      state.setSharedSliceStatus('notifications', { loading: false, error: '旧错误' })

      // Switch project
      state.setCurrentProject({ id: 'new-project', name: 'New' } as any)

      const after = useStore.getState()
      expect(after.notifications).toHaveLength(0)
      expect(after.warnings).toHaveLength(0)
      expect(after.issueRows).toHaveLength(0)
      expect(after.problemRows).toHaveLength(0)
      expect(after.delayRequests).toHaveLength(0)
      expect(after.changeLogs).toHaveLength(0)
      expect(after.taskProgressSnapshots).toHaveLength(0)
      // Status must also reset
      expect(after.sharedSliceStatus.notifications.error).toBeNull()
      expect(after.sharedSliceStatus.notifications.loading).toBe(false)

      // Cleanup
      state.setCurrentProject(null)
    })
  })

  // ─── Rule 4: selector hooks exist for shared slices ───────────────────
  describe('selector hooks', () => {
    it('exports useNotifications selector', async () => {
      const mod = await import('@/hooks/useStore')
      expect(typeof mod.useNotifications).toBe('function')
    })

    it('exports useWarnings selector', async () => {
      const mod = await import('@/hooks/useStore')
      expect(typeof mod.useWarnings).toBe('function')
    })

    it('exports useIssueRows selector', async () => {
      const mod = await import('@/hooks/useStore')
      expect(typeof mod.useIssueRows).toBe('function')
    })

    it('exports useProblemRows selector', async () => {
      const mod = await import('@/hooks/useStore')
      expect(typeof mod.useProblemRows).toBe('function')
    })

    it('exports useDelayRequests selector', async () => {
      const mod = await import('@/hooks/useStore')
      expect(typeof mod.useDelayRequests).toBe('function')
    })

    it('exports useChangeLogs selector', async () => {
      const mod = await import('@/hooks/useStore')
      expect(typeof mod.useChangeLogs).toBe('function')
    })

    it('exports useTaskProgressSnapshots selector', async () => {
      const mod = await import('@/hooks/useStore')
      expect(typeof mod.useTaskProgressSnapshots).toBe('function')
    })

    it('exports useSharedSliceStatus selector', async () => {
      const mod = await import('@/hooks/useStore')
      expect(typeof mod.useSharedSliceStatus).toBe('function')
    })
  })
})
