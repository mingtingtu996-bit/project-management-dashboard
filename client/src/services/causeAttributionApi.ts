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
  eventType?: 'delay' | 'completion' | 'closure' | 'baseline_change'
  causeRole?: 'primary' | 'contributing' | 'transmitted'
}, signal?: AbortSignal) {
  const query = new URLSearchParams()
  if (input.subjectType) query.set('subjectType', input.subjectType)
  if (input.status) query.set('status', input.status)
  if (input.eventType) query.set('eventType', input.eventType)
  if (input.causeRole) query.set('causeRole', input.causeRole)
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return apiGet<CauseAttributionRecord[]>(
    `/api/cause-attributions/projects/${encodeURIComponent(input.projectId)}${suffix}`,
    { signal },
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
