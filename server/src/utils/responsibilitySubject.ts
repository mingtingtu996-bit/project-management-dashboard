export type ResponsibilitySubjectLike = {
  participant_unit_id?: string | null
  assignee_user_id?: string | null
  responsible_user_id?: string | null
  assignee_id?: string | null
}

function hasStableId(value?: string | null) {
  return String(value ?? '').trim().length > 0
}

export function hasStableResponsibleUnit(task: ResponsibilitySubjectLike) {
  return hasStableId(task.participant_unit_id)
}

export function hasStableResponsiblePerson(task: ResponsibilitySubjectLike) {
  return hasStableId(task.assignee_user_id ?? task.responsible_user_id ?? task.assignee_id)
}

export function hasStableResponsibilitySubject(task: ResponsibilitySubjectLike) {
  return hasStableResponsibleUnit(task) || hasStableResponsiblePerson(task)
}
