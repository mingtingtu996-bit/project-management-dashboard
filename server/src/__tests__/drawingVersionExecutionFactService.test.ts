import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  recordChangedExecutionFacts: vi.fn(async () => []),
}))

vi.mock('../services/executionFactGovernanceService.js', () => ({
  recordChangedExecutionFacts: state.recordChangedExecutionFacts,
}))

import { recordDrawingVersionCurrentFactChanges } from '../services/drawingVersionExecutionFactService.js'

describe('drawingVersionExecutionFactService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records demotion, promotion, and a forced initial fact while skipping unchanged versions', async () => {
    await recordDrawingVersionCurrentFactChanges({
      projectId: '11111111-1111-4111-8111-111111111111',
      sourceMutationId: 'drawing-package:pkg-1:set-current:mutation-1',
      sourceModule: 'drawing-packages',
      actorUserId: '22222222-2222-4222-8222-222222222222',
      observedAt: '2026-07-24T00:00:00.000Z',
      before: [
        { id: 'version-1', is_current_version: true },
        { id: 'version-2', is_current_version: false },
        { id: 'version-unchanged', is_current_version: false },
      ],
      after: [
        { id: 'version-1', is_current_version: false },
        { id: 'version-2', is_current_version: true },
        { id: 'version-3', is_current_version: false },
        { id: 'version-unchanged', is_current_version: false },
      ],
    })

    expect(state.recordChangedExecutionFacts).toHaveBeenCalledTimes(3)
    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'drawing_version',
      entityId: 'version-1',
      sourceMutationId: 'drawing-package:pkg-1:set-current:mutation-1:drawing_version:version-1',
      changes: [expect.objectContaining({
        factType: 'drawing_version.current',
        previousValue: true,
        nextValue: false,
        force: false,
      })],
    }))
    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      entityId: 'version-2',
      changes: [expect.objectContaining({ previousValue: false, nextValue: true, force: false })],
    }))
    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      entityId: 'version-3',
      changes: [expect.objectContaining({ previousValue: null, nextValue: false, force: true })],
    }))
    expect(state.recordChangedExecutionFacts).not.toHaveBeenCalledWith(expect.objectContaining({
      entityId: 'version-unchanged',
    }))
  })

  it('propagates persistence failures so the owning mutation can roll back', async () => {
    state.recordChangedExecutionFacts.mockRejectedValueOnce(new Error('fact persistence failed'))

    await expect(recordDrawingVersionCurrentFactChanges({
      projectId: '11111111-1111-4111-8111-111111111111',
      sourceMutationId: 'drawing:draw-1:version:2',
      sourceModule: 'construction-drawings',
      observedAt: '2026-07-24T00:00:00.000Z',
      before: [{ id: 'version-1', is_current_version: false }],
      after: [{ id: 'version-1', is_current_version: true }],
    })).rejects.toThrow('fact persistence failed')
  })
})
