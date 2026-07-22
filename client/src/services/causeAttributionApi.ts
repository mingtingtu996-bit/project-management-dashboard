import { apiGet, apiPost } from '@/lib/apiClient'

import type {
  CauseAttributionRecord,
  StructuredCauseTaxonomyResponse,
} from '@/domain/structuredCauseTaxonomy'

export type ConfirmTaskCauseInput = {
  projectId: string
  taskId: string
  causeCode: string
  causeRole: 'primary'
  eventType: 'delay'
  rawText: string
}

export function listCauseTaxonomy() {
  return apiGet<StructuredCauseTaxonomyResponse>('/api/cause-attributions/taxonomy')
}

export function listCauseAttributions(input: {
  projectId: string
  subjectType?: 'task'
  status?: 'confirmed'
}) {
  const query = new URLSearchParams()
  if (input.subjectType) query.set('subjectType', input.subjectType)
  if (input.status) query.set('status', input.status)
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return apiGet<CauseAttributionRecord[]>(
    `/api/cause-attributions/projects/${encodeURIComponent(input.projectId)}${suffix}`,
  )
}

export function confirmTaskCause(input: ConfirmTaskCauseInput) {
  return apiPost<CauseAttributionRecord>(
    `/api/cause-attributions/projects/${encodeURIComponent(input.projectId)}/subjects/task/${encodeURIComponent(input.taskId)}/confirm`,
    {
      causeCode: input.causeCode,
      causeRole: input.causeRole,
      eventType: input.eventType,
      rawText: input.rawText,
    },
  )
}
