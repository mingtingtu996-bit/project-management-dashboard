import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type DangerousRouteContract = {
  routeFile: string
  entityTypes: string[]
  allowedGuards: string[]
  physicalDeleteMarkers: string[]
}

const CONTRACTS: DangerousRouteContract[] = [
  {
    routeFile: 'tasks.ts',
    entityTypes: ['task'],
    allowedGuards: ['executeTaskDeleteRetention', 'executeRetention('],
    physicalDeleteMarkers: ['deleteTaskInMainChain(', 'supabase.deleteTask('],
  },
  {
    routeFile: 'wbs.ts',
    entityTypes: ['task'],
    allowedGuards: ['executeRetention('],
    physicalDeleteMarkers: ['deleteTaskInMainChain('],
  },
  {
    routeFile: 'risks.ts',
    entityTypes: ['risk'],
    allowedGuards: ['enforceRetentionOrBlock('],
    physicalDeleteMarkers: ['deleteRisk(', ".from('risks').delete("],
  },
  {
    routeFile: 'issues.ts',
    entityTypes: ['issue'],
    allowedGuards: ['enforceRetentionOrBlock('],
    physicalDeleteMarkers: ['deleteIssueInMainChain(', ".from('issues').delete("],
  },
  {
    routeFile: 'acceptance-plans.ts',
    entityTypes: ['acceptance_plan'],
    allowedGuards: ['enforceRetentionOrBlock('],
    physicalDeleteMarkers: ['DELETE FROM acceptance_plans'],
  },
  {
    routeFile: 'task-obstacles.ts',
    entityTypes: ['task_obstacle'],
    allowedGuards: ['enforceRetentionOrBlock('],
    physicalDeleteMarkers: ['delete_task_obstacle_with_source_backfill_atomic'],
  },
  {
    routeFile: 'notifications.ts',
    entityTypes: ['notification'],
    allowedGuards: ['enforceRetentionOrBlock('],
    physicalDeleteMarkers: ['deleteNotification(', ".from('notifications').delete("],
  },
  {
    routeFile: 'projects.ts',
    entityTypes: ['project'],
    allowedGuards: ['enforceRetentionOrBlock('],
    physicalDeleteMarkers: ['deleteProject('],
  },
  {
    routeFile: 'project-materials.ts',
    entityTypes: ['project_material'],
    allowedGuards: ['enforceRetentionOrBlock('],
    physicalDeleteMarkers: ["record_status: 'inactive'", "lifecycle_status: 'archived'"],
  },
  {
    routeFile: 'participant-units.ts',
    entityTypes: ['participant_unit'],
    allowedGuards: ['executeRetention('],
    physicalDeleteMarkers: ['supabase.delete(TABLE_NAME, id)', "unit_status: 'archived'"],
  },
  {
    routeFile: 'construction-drawings.ts',
    entityTypes: ['construction_drawing'],
    allowedGuards: ['enforceRetentionOrBlock('],
    physicalDeleteMarkers: ['DELETE FROM construction_drawings'],
  },
  {
    routeFile: 'certificate-work-items.ts',
    entityTypes: ['certificate_work_item'],
    allowedGuards: ['enforceRetentionOrBlock('],
    physicalDeleteMarkers: ['DELETE FROM certificate_work_items'],
  },
]

function readRouteSource(routeFile: string) {
  const candidates = [
    join(process.cwd(), 'src/routes', routeFile),
    join(process.cwd(), 'server/src/routes', routeFile),
  ]
  const path = candidates.find(existsSync)
  if (!path) throw new Error(`Route file not found: ${routeFile}`)
  return readFileSync(path, 'utf8')
}

describe('deletion retention anti-bypass route contracts', () => {
  it.each(CONTRACTS)('$routeFile cannot expose dangerous delete without retention governance', (contract) => {
    const source = readRouteSource(contract.routeFile)
    const firstGuardIndex = Math.min(
      ...contract.allowedGuards
        .map((marker) => source.indexOf(marker))
        .filter((index) => index >= 0),
    )
    const firstDeleteIndex = Math.min(
      ...contract.physicalDeleteMarkers
        .map((marker) => source.indexOf(marker))
        .filter((index) => index >= 0),
    )

    expect(firstGuardIndex, `${contract.routeFile} missing retention guard for ${contract.entityTypes.join(', ')}`).toBeGreaterThanOrEqual(0)
    expect(firstDeleteIndex, `${contract.routeFile} missing physical/lifecycle delete marker`).toBeGreaterThanOrEqual(0)
    expect(firstGuardIndex, `${contract.routeFile} must evaluate retention before delete mutation`).toBeLessThan(firstDeleteIndex)
  })

  it('uses the shared retention API error builder for guarded route responses', () => {
    const routeFiles = [
      'acceptance-catalog.ts',
      'acceptance-dependencies.ts',
      'acceptance-plans.ts',
      'acceptance-records.ts',
      'acceptance-requirements.ts',
      'certificate-dependencies.ts',
      'certificate-work-items.ts',
      'construction-drawings.ts',
      'critical-paths.ts',
      'drawing-review-rules.ts',
      'engineering-objects.ts',
      'issues.ts',
      'notifications.ts',
      'pre-milestone-conditions.ts',
      'pre-milestone-dependencies.ts',
      'pre-milestones.ts',
      'project-materials.ts',
      'projects.ts',
      'risks.ts',
      'task-baselines.ts',
      'task-conditions.ts',
      'task-obstacles.ts',
      'wbs-templates.ts',
    ]

    const gaps = routeFiles.filter((routeFile) => {
      const source = readRouteSource(routeFile)
      return source.includes('enforceRetentionOrBlock(') && !source.includes('buildRetentionBlockedApiError')
    })

    expect(gaps).toEqual([])
  })

  it('routes guarded retention responses through the shared HTTP status helper', () => {
    const routeFiles = [
      'acceptance-catalog.ts',
      'acceptance-dependencies.ts',
      'acceptance-plans.ts',
      'acceptance-records.ts',
      'acceptance-requirements.ts',
      'certificate-dependencies.ts',
      'certificate-work-items.ts',
      'construction-drawings.ts',
      'critical-paths.ts',
      'drawing-review-rules.ts',
      'engineering-objects.ts',
      'issues.ts',
      'notifications.ts',
      'pre-milestone-conditions.ts',
      'pre-milestone-dependencies.ts',
      'pre-milestones.ts',
      'project-materials.ts',
      'projects.ts',
      'risks.ts',
      'task-baselines.ts',
      'task-conditions.ts',
      'task-obstacles.ts',
      'wbs-templates.ts',
    ]

    const gaps = routeFiles.filter((routeFile) => {
      const source = readRouteSource(routeFile)
      return source.includes('enforceRetentionOrBlock(') && !source.includes('buildRetentionBlockedHttpStatus')
    })

    expect(gaps).toEqual([])
  })
})
