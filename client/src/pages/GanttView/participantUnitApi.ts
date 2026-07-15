import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/apiClient'
import type { ParticipantUnitDraft, ParticipantUnitRecord } from './ParticipantUnitsDialog'

function toParticipantUnitPayload(draft: ParticipantUnitDraft, projectId: string) {
  return {
    project_id: projectId,
    unit_name: draft.unit_name.trim(),
    unit_type: draft.unit_type.trim() || '其他',
    contact_name: draft.contact_name.trim() || null,
    contact_role: draft.contact_role.trim() || null,
    contact_phone: draft.contact_phone.trim() || null,
    contact_email: draft.contact_email.trim() || null,
  }
}

export async function listParticipantUnits(projectId: string, signal?: AbortSignal): Promise<ParticipantUnitRecord[]> {
  return apiGet<ParticipantUnitRecord[]>(
    `/api/participant-units?projectId=${encodeURIComponent(projectId)}`,
    signal ? { signal } : undefined,
  )
}

export async function saveParticipantUnitDraft(draft: ParticipantUnitDraft, projectId: string) {
  const payload = toParticipantUnitPayload(draft, projectId)
  if (draft.id) {
    return {
      created: false,
      record: await apiPut<ParticipantUnitRecord>(`/api/participant-units/${draft.id}`, {
        ...payload,
        version: draft.version ?? 1,
      }),
    }
  }

  return {
    created: true,
    record: await apiPost<ParticipantUnitRecord>('/api/participant-units', payload),
  }
}

export async function deleteParticipantUnitRecord(unitId: string) {
  await apiDelete(`/api/participant-units/${unitId}`)
}
