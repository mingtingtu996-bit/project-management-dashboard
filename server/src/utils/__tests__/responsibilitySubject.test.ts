import { describe, expect, it } from 'vitest'

import {
  hasStableResponsiblePerson,
  hasStableResponsibleUnit,
  hasStableResponsibilitySubject,
} from '../responsibilitySubject.js'

describe('responsibilitySubject utilities', () => {
  it('does not count legacy responsibility unit text as a stable responsibility subject', () => {
    expect(hasStableResponsibleUnit({
      participant_unit_id: null,
      // @ts-expect-error legacy text fields are intentionally ignored by this helper
      participant_unit_name: '旧文本单位',
      responsible_unit: '旧文本单位',
      assignee_unit: '旧文本单位',
    })).toBe(false)
    expect(hasStableResponsibilitySubject({
      participant_unit_id: null,
      // @ts-expect-error legacy text fields are intentionally ignored by this helper
      assignee: '现场张工',
      assignee_name: '现场张工',
    })).toBe(false)
  })

  it('counts stable participant unit and user identifiers as responsibility coverage', () => {
    expect(hasStableResponsibleUnit({ participant_unit_id: 'unit-1' })).toBe(true)
    expect(hasStableResponsiblePerson({ assignee_user_id: 'user-1' })).toBe(true)
    expect(hasStableResponsiblePerson({ responsible_user_id: 'user-2' })).toBe(true)
    expect(hasStableResponsiblePerson({ assignee_id: 'user-3' })).toBe(true)
    expect(hasStableResponsibilitySubject({ participant_unit_id: 'unit-1' })).toBe(true)
  })
})
