import { beforeEach, describe, expect, it, vi } from 'vitest'

type PlanRow = {
  id: string
  project_id: string
  status?: string | null
  planned_date?: string | null
  updated_at: string
}

type DependencyRow = {
  id: string
  project_id: string | null
  source_plan_id: string
  target_plan_id: string
  dependency_kind: string
  status: string
  created_at: string
  updated_at: string
}

type RequirementRow = {
  id: string
  project_id: string | null
  plan_id: string
  requirement_type: string
  source_entity_type: string
  source_entity_id: string
  drawing_package_id: string | null
  description: string | null
  status: string
  is_required: boolean
  is_satisfied: boolean
  created_at: string
  updated_at: string
}

type RecordRow = {
  id: string
  project_id: string | null
  plan_id: string
  record_type: string
  content: string
  operator: string | null
  record_date: string | null
  attachments: unknown[] | null
  created_at: string
  updated_at: string
}

const state = vi.hoisted(() => {
  const plans: PlanRow[] = []
  const dependencies: DependencyRow[] = []
  const requirements: RequirementRow[] = []
  const records: RecordRow[] = []
  const compatibility = {
    missingRequirementDrawingPackageIdOnInsert: false,
    missingRequirementDrawingPackageIdOnSelect: false,
    missingRequirementDrawingPackageIdOnUpdate: false,
  }

  const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase()
  const clone = <T>(row: T | undefined) => (row ? { ...row } : null)
  const createMissingRequirementDrawingPackageIdError = () =>
    new Error("Could not find the 'drawing_package_id' column of 'acceptance_requirements' in the schema cache")

  const reset = () => {
    plans.splice(0, plans.length,
      {
        id: 'plan-source',
        project_id: 'project-1',
        status: 'passed',
        planned_date: '2026-06-18',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
      {
        id: 'plan-target',
        project_id: 'project-1',
        status: 'submitted',
        planned_date: '2026-06-19',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
    )
    dependencies.splice(0, dependencies.length)
    requirements.splice(0, requirements.length)
    records.splice(0, records.length)
    compatibility.missingRequirementDrawingPackageIdOnInsert = false
    compatibility.missingRequirementDrawingPackageIdOnSelect = false
    compatibility.missingRequirementDrawingPackageIdOnUpdate = false
  }

  const executeSQLOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)
    if (
      compatibility.missingRequirementDrawingPackageIdOnSelect &&
      normalized.includes('from acceptance_requirements') &&
      normalized.includes('drawing_package_id')
    ) {
      throw createMissingRequirementDrawingPackageIdError()
    }

    if (normalized === 'select project_id from acceptance_plans where id = ? limit 1') {
      return clone(plans.find((row) => row.id === String(params[0] ?? '')))
    }

    if (
      normalized.includes('from acceptance_dependencies where project_id = ? and source_plan_id = ? and target_plan_id = ? limit 1')
    ) {
      return clone(
        dependencies.find(
          (row) =>
            row.project_id === String(params[0] ?? '') &&
            row.source_plan_id === String(params[1] ?? '') &&
            row.target_plan_id === String(params[2] ?? ''),
        ),
      )
    }

    if (
      normalized.includes('from acceptance_dependencies where source_plan_id = ? and target_plan_id = ? limit 1')
    ) {
      return clone(
        dependencies.find(
          (row) =>
            row.source_plan_id === String(params[0] ?? '') &&
            row.target_plan_id === String(params[1] ?? ''),
        ),
      )
    }

    if (normalized.includes('from acceptance_dependencies where id = ?')) {
      return clone(dependencies.find((row) => row.id === String(params[0] ?? '')
        && (!normalized.includes('and project_id = ?') || row.project_id === String(params[1] ?? ''))))
    }

    if (normalized.includes('from acceptance_requirements where project_id = ? and id = ?')) {
      return clone(requirements.find((row) => row.project_id === String(params[0] ?? '')
        && row.id === String(params[1] ?? '')))
    }

    if (normalized.includes('from acceptance_requirements where id = ?')) {
      return clone(requirements.find((row) => row.id === String(params[0] ?? '')
        && (!normalized.includes('and project_id = ?') || row.project_id === String(params[1] ?? ''))))
    }

    if (normalized.includes('from acceptance_records where id = ?')) {
      return clone(records.find((row) => row.id === String(params[0] ?? '')
        && (!normalized.includes('and project_id = ?') || row.project_id === String(params[1] ?? ''))))
    }

    return null
  })

  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (
      compatibility.missingRequirementDrawingPackageIdOnInsert &&
      normalized.startsWith('insert into acceptance_requirements') &&
      normalized.includes('drawing_package_id')
    ) {
      throw createMissingRequirementDrawingPackageIdError()
    }

    if (
      compatibility.missingRequirementDrawingPackageIdOnSelect &&
      normalized.includes('from acceptance_requirements') &&
      normalized.includes('drawing_package_id')
    ) {
      throw createMissingRequirementDrawingPackageIdError()
    }

    if (
      compatibility.missingRequirementDrawingPackageIdOnUpdate &&
      normalized.startsWith('update acceptance_requirements set') &&
      normalized.includes('drawing_package_id = ?')
    ) {
      throw createMissingRequirementDrawingPackageIdError()
    }

    if (normalized.startsWith('insert into acceptance_dependencies (id, project_id, source_plan_id, target_plan_id, dependency_kind, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)')) {
      const [id, projectId, sourcePlanId, targetPlanId, dependencyKind, status, createdAt, updatedAt] = params
      dependencies.push({
        id: String(id ?? ''),
        project_id: projectId == null ? null : String(projectId),
        source_plan_id: String(sourcePlanId ?? ''),
        target_plan_id: String(targetPlanId ?? ''),
        dependency_kind: String(dependencyKind ?? 'hard'),
        status: String(status ?? 'active'),
        created_at: String(createdAt ?? ''),
        updated_at: String(updatedAt ?? ''),
      })
      return []
    }

    if (normalized === 'delete from acceptance_dependencies where id = ?'
      || normalized === 'delete from acceptance_dependencies where id = ? and project_id = ?') {
      const id = String(params[0] ?? '')
      const projectId = String(params[1] ?? '')
      const index = dependencies.findIndex((row) => row.id === id && (!projectId || row.project_id === projectId))
      if (index !== -1) dependencies.splice(index, 1)
      return []
    }

    if (normalized === 'delete from acceptance_requirements where id = ?'
      || normalized === 'delete from acceptance_requirements where id = ? and project_id = ?') {
      const id = String(params[0] ?? '')
      const projectId = String(params[1] ?? '')
      const index = requirements.findIndex((row) => row.id === id && (!projectId || row.project_id === projectId))
      if (index !== -1) requirements.splice(index, 1)
      return []
    }

    if (normalized === 'delete from acceptance_records where id = ?'
      || normalized === 'delete from acceptance_records where id = ? and project_id = ?') {
      const id = String(params[0] ?? '')
      const projectId = String(params[1] ?? '')
      const index = records.findIndex((row) => row.id === id && (!projectId || row.project_id === projectId))
      if (index !== -1) records.splice(index, 1)
      return []
    }

    if (normalized.startsWith('insert into acceptance_requirements (')) {
      const match = normalized.match(/^insert into acceptance_requirements \((.+)\) values \((.+)\)$/)
      if (!match) return []

      const columns = match[1].split(',').map((column) => column.trim())
      const next: RequirementRow = {
        id: '',
        project_id: null,
        plan_id: '',
        requirement_type: '',
        source_entity_type: '',
        source_entity_id: '',
        drawing_package_id: null,
        description: null,
        status: 'open',
        is_required: false,
        is_satisfied: false,
        created_at: '',
        updated_at: '',
      }

      columns.forEach((column, index) => {
        const value = params[index]
        switch (column) {
          case 'id':
            next.id = String(value ?? '')
            break
          case 'project_id':
            next.project_id = value == null ? null : String(value)
            break
          case 'plan_id':
            next.plan_id = String(value ?? '')
            break
          case 'requirement_type':
            next.requirement_type = String(value ?? '')
            break
          case 'source_entity_type':
            next.source_entity_type = String(value ?? '')
            break
          case 'source_entity_id':
            next.source_entity_id = String(value ?? '')
            break
          case 'drawing_package_id':
            next.drawing_package_id = value == null ? null : String(value)
            break
          case 'description':
            next.description = value == null ? null : String(value)
            break
          case 'status':
            next.status = String(value ?? 'open')
            break
          case 'is_required':
            next.is_required = Boolean(value)
            break
          case 'is_satisfied':
            next.is_satisfied = Boolean(value)
            break
          case 'created_at':
            next.created_at = String(value ?? '')
            break
          case 'updated_at':
            next.updated_at = String(value ?? '')
            break
        }
      })

      requirements.push(next)
      return []
    }

    if (normalized.startsWith('insert into acceptance_records (id, project_id, plan_id, record_type, content, operator, record_date, attachments, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')) {
      const [id, projectId, planId, recordType, content, operator, recordDate, attachments, createdAt, updatedAt] = params
      records.push({
        id: String(id ?? ''),
        project_id: projectId == null ? null : String(projectId),
        plan_id: String(planId ?? ''),
        record_type: String(recordType ?? ''),
        content: String(content ?? ''),
        operator: operator == null ? null : String(operator),
        record_date: recordDate == null ? null : String(recordDate),
        attachments: attachments == null ? null : (attachments as unknown[]),
        created_at: String(createdAt ?? ''),
        updated_at: String(updatedAt ?? ''),
      })
      return []
    }

    if (normalized.includes('from acceptance_catalog where project_id = ? order by created_at asc')) {
      return []
    }

    if (normalized.includes('from acceptance_plans where project_id = ? order by planned_date asc, created_at asc')) {
      return plans.filter((row) => row.project_id === String(params[0] ?? ''))
    }

    if (normalized.includes('from acceptance_dependencies where project_id = ? order by created_at asc')) {
      return dependencies.filter((row) => row.project_id === String(params[0] ?? ''))
    }

    if (normalized.includes('from acceptance_requirements where project_id = ? order by created_at asc')) {
      return requirements.filter((row) => row.project_id === String(params[0] ?? ''))
    }

    if (normalized.includes('from acceptance_records where project_id = ? order by created_at asc')) {
      return records.filter((row) => row.project_id === String(params[0] ?? ''))
    }

    if (normalized.includes('from acceptance_requirements where plan_id = ? order by created_at asc')) {
      return requirements.filter((row) => row.plan_id === String(params[0] ?? ''))
    }

    if (normalized.includes('from acceptance_records where plan_id = ? order by created_at asc')) {
      return records.filter((row) => row.plan_id === String(params[0] ?? ''))
    }

    if (normalized.startsWith('update acceptance_requirements set ')) {
      const match = normalized.match(/^update acceptance_requirements set (.+) where id = \?(?: and project_id = \?)?$/)
      if (!match) return []

      const hasProjectFilter = normalized.endsWith('and project_id = ?')
      const idParamIndex = hasProjectFilter ? params.length - 2 : params.length - 1
      const projectParamIndex = hasProjectFilter ? params.length - 1 : -1
      const row = requirements.find((item) => item.id === String(params[idParamIndex] ?? '')
        && (!hasProjectFilter || item.project_id === String(params[projectParamIndex] ?? '')))
      if (!row) return []

      const assignments = match[1].split(',').map((assignment) => assignment.trim())
      assignments.forEach((assignment, index) => {
        const field = assignment.replace(/\s*=\s*\?$/, '')
        const value = params[index]
        switch (field) {
          case 'requirement_type':
            row.requirement_type = String(value ?? '')
            break
          case 'source_entity_type':
            row.source_entity_type = String(value ?? '')
            break
          case 'source_entity_id':
            row.source_entity_id = String(value ?? '')
            break
          case 'drawing_package_id':
            row.drawing_package_id = value == null ? null : String(value)
            break
          case 'description':
            row.description = value == null ? null : String(value)
            break
          case 'status':
            row.status = String(value ?? 'open')
            break
          case 'is_required':
            row.is_required = Boolean(value)
            break
          case 'is_satisfied':
            row.is_satisfied = Boolean(value)
            break
          case 'updated_at':
            row.updated_at = String(value ?? '')
            break
        }
      })
      return []
    }

    return []
  })

  return {
    plans,
    dependencies,
    requirements,
    records,
    compatibility,
    executeSQL,
    executeSQLOne,
    reset,
  }
})

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
  executeSQLOne: state.executeSQLOne,
}))

const {
  clearAcceptanceFlowSnapshotCache,
  createAcceptanceDependency,
  createAcceptanceRecord,
  createAcceptanceRequirement,
  deleteAcceptanceDependency,
  getAcceptanceFlowSnapshot,
  listAcceptanceDependencies,
  listAcceptanceRecords,
  listAcceptanceRequirements,
  syncAcceptanceRequirementsBySource,
  updateAcceptanceRecord,
  updateAcceptanceRequirement,
} = await import('../services/acceptanceFlowService.js')

describe('acceptance flow service', () => {
  beforeEach(() => {
    state.reset()
    clearAcceptanceFlowSnapshotCache()
    vi.clearAllMocks()
  })

  it('keeps acceptance_dependencies as the only write target for plan edges', async () => {
    const created = await createAcceptanceDependency({
      project_id: 'project-1',
      source_plan_id: 'plan-source',
      target_plan_id: 'plan-target',
      dependency_kind: 'hard',
    })

    expect(created).toMatchObject({
      source_plan_id: 'plan-source',
      target_plan_id: 'plan-target',
      dependency_kind: 'hard',
    })
    expect(state.dependencies).toHaveLength(1)
    await deleteAcceptanceDependency('project-1', created!.id)

    expect(state.dependencies).toHaveLength(0)
  })

  it('surfaces requirements, dependencies and records in the shared snapshot', async () => {
    await createAcceptanceRequirement({
      project_id: 'project-1',
      plan_id: 'plan-target',
      requirement_type: 'external_precondition',
      source_entity_type: 'warning',
      source_entity_id: 'warning-1',
      description: 'Need external signal',
      status: 'open',
      is_required: true,
      is_satisfied: false,
    })

    await createAcceptanceDependency({
      project_id: 'project-1',
      source_plan_id: 'plan-source',
      target_plan_id: 'plan-target',
      dependency_kind: 'hard',
    })

    await createAcceptanceRecord({
      project_id: 'project-1',
      plan_id: 'plan-target',
      record_type: 'note',
      content: 'Accepted in sync',
    })

    const snapshot = await getAcceptanceFlowSnapshot('project-1')

    expect(snapshot.plans).toHaveLength(2)
    expect(snapshot.dependencies).toHaveLength(1)
    expect(snapshot.requirements).toHaveLength(1)
    expect(snapshot.records).toHaveLength(1)
    expect(snapshot.dependencies[0]).toMatchObject({
      source_plan_id: 'plan-source',
      target_plan_id: 'plan-target',
      dependency_kind: 'hard',
    })
    expect(snapshot.requirements[0]).toMatchObject({
      plan_id: 'plan-target',
      source_entity_id: 'warning-1',
      is_required: true,
      is_satisfied: false,
    })
    expect(snapshot.records[0]).toMatchObject({
      plan_id: 'plan-target',
      content: 'Accepted in sync',
    })
  })

  it('uses the local business calendar day for acceptance due buckets', async () => {
    const previousTimeZone = process.env.TZ
    process.env.TZ = 'Asia/Shanghai'
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-06-18T23:30:00.000Z'))

      const snapshot = await getAcceptanceFlowSnapshot('project-1')

      expect(snapshot.plans.find((plan) => plan.id === 'plan-target')).toMatchObject({
        planned_date: '2026-06-19',
        days_to_due: 0,
        is_overdue: false,
      })
    } finally {
      vi.useRealTimers()
      if (previousTimeZone === undefined) {
        delete process.env.TZ
      } else {
        process.env.TZ = previousTimeZone
      }
    }
  })

  it('invalidates the shared snapshot after acceptance write operations', async () => {
    const initial = await getAcceptanceFlowSnapshot('project-1')
    expect(initial.dependencies).toHaveLength(0)
    expect(initial.requirements).toHaveLength(0)
    expect(initial.records).toHaveLength(0)

    await createAcceptanceDependency({
      project_id: 'project-1',
      source_plan_id: 'plan-source',
      target_plan_id: 'plan-target',
      dependency_kind: 'hard',
    })
    let snapshot = await getAcceptanceFlowSnapshot('project-1')
    expect(snapshot.dependencies).toHaveLength(1)

    await createAcceptanceRequirement({
      project_id: 'project-1',
      plan_id: 'plan-target',
      requirement_type: 'external_precondition',
      source_entity_type: 'warning',
      source_entity_id: 'warning-cache',
      description: 'cache invalidation',
      status: 'open',
      is_required: true,
      is_satisfied: false,
    })
    snapshot = await getAcceptanceFlowSnapshot('project-1')
    expect(snapshot.requirements).toHaveLength(1)

    await createAcceptanceRecord({
      project_id: 'project-1',
      plan_id: 'plan-target',
      record_type: 'note',
      content: 'cache invalidated',
    })
    snapshot = await getAcceptanceFlowSnapshot('project-1')
    expect(snapshot.records).toHaveLength(1)
  })

  it('requires project_id instead of inferring it from the plan row', async () => {
    await expect(
      createAcceptanceDependency({
        source_plan_id: 'plan-source',
        target_plan_id: 'plan-target',
        dependency_kind: 'hard',
      }),
    ).rejects.toMatchObject({
      code: 'MISSING_PROJECT_ID',
      statusCode: 400,
    })
  })

  it('pushes project scope into dependency, requirement and record list queries', async () => {
    await listAcceptanceDependencies('project-1', 'plan-target')
    await listAcceptanceRequirements('project-1', 'plan-target')
    await listAcceptanceRecords('project-1', 'plan-target')

    const calls = state.executeSQL.mock.calls.map(([sql, params]) => ({
      sql: String(sql).replace(/\s+/g, ' ').trim().toLowerCase(),
      params,
    }))

    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sql: expect.stringContaining('from acceptance_dependencies where project_id = ? and source_plan_id = ?'),
        params: ['project-1', 'plan-target'],
      }),
      expect.objectContaining({
        sql: expect.stringContaining('from acceptance_dependencies where project_id = ? and target_plan_id = ?'),
        params: ['project-1', 'plan-target'],
      }),
      expect.objectContaining({
        sql: expect.stringContaining('from acceptance_requirements where project_id = ? and plan_id = ?'),
        params: ['project-1', 'plan-target'],
      }),
      expect.objectContaining({
        sql: expect.stringContaining('from acceptance_records where project_id = ? and plan_id = ?'),
        params: ['project-1', 'plan-target'],
      }),
    ]))
  })

  it('scopes dependency duplicate and cycle checks to the requested project', async () => {
    await createAcceptanceDependency({
      project_id: 'project-1',
      source_plan_id: 'plan-source',
      target_plan_id: 'plan-target',
      dependency_kind: 'hard',
    })

    const calls = [
      ...state.executeSQLOne.mock.calls,
      ...state.executeSQL.mock.calls,
    ].map(([sql, params]) => ({
      sql: String(sql).replace(/\s+/g, ' ').trim().toLowerCase(),
      params,
    }))

    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sql: expect.stringContaining('where project_id = ? and source_plan_id = ? and target_plan_id = ?'),
        params: ['project-1', 'plan-source', 'plan-target'],
      }),
      expect.objectContaining({
        sql: 'select source_plan_id, target_plan_id from acceptance_dependencies where project_id = ?',
        params: ['project-1'],
      }),
    ]))
  })

  it('rejects moving an acceptance record to another project', async () => {
    state.records.push({
      id: 'record-1',
      project_id: 'project-1',
      plan_id: 'plan-target',
      record_type: 'note',
      content: 'before',
      operator: null,
      record_date: null,
      attachments: null,
      created_at: '2026-04-15T00:00:00.000Z',
      updated_at: '2026-04-15T00:00:00.000Z',
    })

    await expect(updateAcceptanceRecord('project-1', 'record-1', {
      project_id: 'project-2',
    })).rejects.toMatchObject({
      code: 'PROJECT_ID_IMMUTABLE',
      statusCode: 400,
    })
  })

  it('fails closed when the canonical acceptance requirement drawing-package column is missing during create', async () => {
    state.compatibility.missingRequirementDrawingPackageIdOnInsert = true

    await expect(createAcceptanceRequirement({
      project_id: 'project-1',
      plan_id: 'plan-target',
      requirement_type: 'external_precondition',
      source_entity_type: 'warning',
      source_entity_id: 'warning-compat',
      drawing_package_id: 'drawing-1',
      description: 'legacy schema fallback',
      status: 'open',
      is_required: true,
      is_satisfied: false,
    })).rejects.toThrow(/drawing_package_id/i)

    expect(state.requirements).toHaveLength(0)
  })

  it('fails closed when the canonical acceptance requirement drawing-package column is missing during update', async () => {
    state.requirements.push({
      id: 'requirement-1',
      project_id: 'project-1',
      plan_id: 'plan-target',
      requirement_type: 'external_precondition',
      source_entity_type: 'warning',
      source_entity_id: 'warning-update',
      drawing_package_id: null,
      description: 'before update',
      status: 'open',
      is_required: true,
      is_satisfied: false,
      created_at: '2026-04-15T00:00:00.000Z',
      updated_at: '2026-04-15T00:00:00.000Z',
    })
    state.compatibility.missingRequirementDrawingPackageIdOnUpdate = true

    await expect(updateAcceptanceRequirement('project-1', 'requirement-1', {
      drawing_package_id: null,
      description: 'after update',
      status: 'met',
      is_satisfied: true,
    })).rejects.toThrow(/drawing_package_id/i)

    expect(state.requirements[0]).toMatchObject({
      description: 'before update',
      drawing_package_id: null,
      status: 'open',
      is_required: true,
      is_satisfied: false,
    })
  })

  it('syncs certificate-linked requirements from shared source entities', async () => {
    state.requirements.push(
      {
        id: 'requirement-pre',
        project_id: 'project-1',
        plan_id: 'plan-target',
        requirement_type: 'certificate',
        source_entity_type: 'pre_milestone',
        source_entity_id: 'certificate-1',
        drawing_package_id: null,
        description: 'linked-pre-milestone',
        status: 'open',
        is_required: true,
        is_satisfied: false,
        created_at: '2026-04-15T00:00:00.000Z',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
      {
        id: 'requirement-cert',
        project_id: 'project-1',
        plan_id: 'plan-target',
        requirement_type: 'certificate',
        source_entity_type: 'certificate',
        source_entity_id: 'certificate-1',
        drawing_package_id: null,
        description: 'linked-certificate-alias',
        status: 'open',
        is_required: true,
        is_satisfied: false,
        created_at: '2026-04-15T00:00:00.000Z',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
      {
        id: 'requirement-closed',
        project_id: 'project-1',
        plan_id: 'plan-target',
        requirement_type: 'certificate',
        source_entity_type: 'pre_milestone',
        source_entity_id: 'certificate-1',
        drawing_package_id: null,
        description: 'optional-requirement',
        status: 'closed',
        is_required: false,
        is_satisfied: false,
        created_at: '2026-04-15T00:00:00.000Z',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
      {
        id: 'requirement-other',
        project_id: 'project-1',
        plan_id: 'plan-target',
        requirement_type: 'certificate',
        source_entity_type: 'pre_milestone',
        source_entity_id: 'certificate-2',
        drawing_package_id: null,
        description: 'other-certificate',
        status: 'open',
        is_required: true,
        is_satisfied: false,
        created_at: '2026-04-15T00:00:00.000Z',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
    )

    const updated = await syncAcceptanceRequirementsBySource({
      projectId: 'project-1',
      sourceEntityTypes: ['pre_milestone', 'certificate'],
      sourceEntityId: 'certificate-1',
      isSatisfied: true,
    })

    expect(updated).toHaveLength(3)
    expect(state.requirements.find((row) => row.id === 'requirement-pre')).toMatchObject({
      status: 'met',
      is_required: true,
      is_satisfied: true,
    })
    expect(state.requirements.find((row) => row.id === 'requirement-cert')).toMatchObject({
      status: 'met',
      is_required: true,
      is_satisfied: true,
    })
    expect(state.requirements.find((row) => row.id === 'requirement-closed')).toMatchObject({
      status: 'closed',
      is_required: false,
      is_satisfied: false,
    })
    expect(state.requirements.find((row) => row.id === 'requirement-other')).toMatchObject({
      status: 'open',
      is_required: true,
      is_satisfied: false,
    })
  })
})
