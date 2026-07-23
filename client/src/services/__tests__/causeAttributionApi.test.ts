import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiGet, apiPost } from '@/lib/apiClient'
import { confirmTaskCause, listCauseAttributions, listCauseTaxonomy } from '../causeAttributionApi'

vi.mock('@/lib/apiClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

const mockedApiGet = vi.mocked(apiGet)
const mockedApiPost = vi.mocked(apiPost)

describe('causeAttributionApi', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('loads the server-owned taxonomy response without defining a client copy', async () => {
    const response = {
      version: 'v1.0.0',
      entries: [{ code: 'material_shortage', label: 'Material shortage or late arrival', category: 'resource', linkedDeviationReasonTypes: [], priority: 90 }],
    }
    mockedApiGet.mockResolvedValue(response)

    await expect(listCauseTaxonomy()).resolves.toEqual(response)
    expect(mockedApiGet).toHaveBeenCalledWith('/api/cause-attributions/taxonomy')
  })

  it('URL-encodes task confirmation identifiers and preserves the response', async () => {
    const response = { id: 'cause-1', status: 'confirmed' }
    mockedApiPost.mockResolvedValue(response)

    await expect(confirmTaskCause({
      projectId: 'project / 1',
      taskId: 'task / 1',
      causeCode: 'material_shortage',
      causeRole: 'primary',
      eventType: 'delay',
      rawText: 'Material has not arrived',
    })).resolves.toEqual(response)

    expect(mockedApiPost).toHaveBeenCalledWith(
      '/api/cause-attributions/projects/project%20%2F%201/subjects/task/task%20%2F%201/confirm',
      {
        causeCode: 'material_shortage',
        causeRole: 'primary',
        eventType: 'delay',
        rawText: 'Material has not arrived',
      },
    )
  })

  it('lists one exact cause authority slice and forwards cancellation', async () => {
    const controller = new AbortController()
    const response = [{
      id: 'cause-new',
      subject_id: 'task-1',
      cause_code: 'material_shortage',
      cause_role: 'primary',
      event_type: 'delay',
      raw_text: 'Material has not arrived',
      status: 'confirmed',
    }]
    mockedApiGet.mockResolvedValue(response)

    await expect(listCauseAttributions({
      projectId: 'project / 1',
      subjectType: 'task',
      status: 'confirmed',
      eventType: 'delay',
      causeRole: 'primary',
    }, controller.signal)).resolves.toEqual(response)

    expect(mockedApiGet).toHaveBeenCalledWith(
      '/api/cause-attributions/projects/project%20%2F%201?subjectType=task&status=confirmed&eventType=delay&causeRole=primary',
      { signal: controller.signal },
    )
  })
})
