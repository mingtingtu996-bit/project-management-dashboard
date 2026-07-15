import type { ParticipantUnitDraft, ParticipantUnitRecord } from './ParticipantUnitsDialog'

export function createEmptyParticipantUnitDraft(projectId?: string | null): ParticipantUnitDraft {
  return {
    id: null,
    project_id: projectId ?? '',
    unit_name: '',
    unit_type: '',
    contact_name: '',
    contact_role: '',
    contact_phone: '',
    contact_email: '',
    version: null,
  }
}

export function toParticipantUnitDraft(unit: ParticipantUnitRecord, projectId?: string | null): ParticipantUnitDraft {
  return {
    id: unit.id,
    project_id: String(unit.project_id ?? projectId ?? ''),
    unit_name: unit.unit_name,
    unit_type: unit.unit_type,
    contact_name: unit.contact_name ?? '',
    contact_role: unit.contact_role ?? '',
    contact_phone: unit.contact_phone ?? '',
    contact_email: unit.contact_email ?? '',
    version: unit.version ?? 1,
  }
}

export function sortParticipantUnits(units: ParticipantUnitRecord[]) {
  return [...units].sort((left, right) => left.unit_name.localeCompare(right.unit_name, 'zh-CN'))
}
