import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiDelete: mocks.apiDelete,
  apiGet: mocks.apiGet,
  apiPatch: mocks.apiPatch,
  apiPost: mocks.apiPost,
}))

import {
  bootstrapEngineeringObjects,
  createEngineeringObject,
  listEngineeringObjects,
  updateEngineeringObject,
} from '../engineeringObjectsApi'

describe('engineeringObjectsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes backend snake_case rows to frontend camelCase objects', async () => {
    mocks.apiGet.mockResolvedValueOnce([
      {
        id: 'object-1',
        project_id: 'project-1',
        object_type: 'building',
        object_code: 'BLD-001',
        object_name: 'Building 1',
        parent_id: null,
        path: '/object-1',
        level: '1',
        sort_order: '7',
        status: 'active',
        metadata: { source: 'seed' },
      },
    ])

    const objects = await listEngineeringObjects('project-1')

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/engineering-objects?projectId=project-1', {
      runtimeCache: 'off',
    })
    expect(objects).toEqual([
      {
        id: 'object-1',
        projectId: 'project-1',
        objectType: 'building',
        objectCode: 'BLD-001',
        objectName: 'Building 1',
        parentId: null,
        path: '/object-1',
        level: 1,
        sortOrder: 7,
        status: 'active',
        metadata: { source: 'seed' },
      },
    ])
  })

  it('serializes root parent filters explicitly', async () => {
    mocks.apiGet.mockResolvedValueOnce([])

    await listEngineeringObjects('project-1', { parentId: null, status: 'all' })

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/engineering-objects?projectId=project-1&parentId=__root__&status=all', {
      runtimeCache: 'off',
    })
  })

  it('normalizes write and bootstrap responses for final physical zones', async () => {
    const row = {
      id: 'object-2',
      project_id: 'project-1',
      object_type: 'physical_zone',
      object_code: 'PZ-001',
      object_name: 'Roof',
      parent_id: null,
      path: '/object-2',
      level: 1,
      sort_order: 1,
      status: 'active',
      metadata: {},
    }

    mocks.apiPost.mockResolvedValueOnce(row).mockResolvedValueOnce([row])
    mocks.apiPatch.mockResolvedValueOnce({ ...row, object_name: 'Facade' })

    await expect(createEngineeringObject({
      projectId: 'project-1',
      objectType: 'physical_zone',
      objectName: 'Roof',
    })).resolves.toMatchObject({ objectName: 'Roof', objectType: 'physical_zone' })
    await expect(updateEngineeringObject('object-2', { objectName: 'Facade' })).resolves.toMatchObject({ objectName: 'Facade' })
    await expect(bootstrapEngineeringObjects('project-1')).resolves.toEqual([
      expect.objectContaining({ objectName: 'Roof', objectCode: 'PZ-001', objectType: 'physical_zone' }),
    ])
  })

  it('drops malformed object types from read arrays', async () => {
    mocks.apiGet.mockResolvedValueOnce([
      { id: 'malformed-object', object_type: 'not_a_range_type', object_name: 'Invalid' },
      { id: 'zone-1', project_id: 'project-1', object_type: 'physical_zone', object_name: 'Central plaza' },
    ])

    await expect(listEngineeringObjects('project-1')).resolves.toEqual([
      expect.objectContaining({ id: 'zone-1', objectType: 'physical_zone', objectName: 'Central plaza' }),
    ])
  })
})
