import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = process.cwd().endsWith('server') ? resolve(process.cwd(), '..') : process.cwd()

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

describe('duration and WBS workspace isolation repair', () => {
  it('requires the baseline project scope at every baseline-id preparation call', () => {
    const service = read('server/src/services/baselineGenerationService.ts')
    const route = read('server/src/routes/task-baselines.ts')
    const revisionBridge = read('server/src/services/durationAssetBaselineRevisionBridgeService.ts')

    expect(service).toContain('projectId: string')
    expect(service).toContain(".eq('project_id', projectId)")
    expect(route).toContain('prepareBaselineGenerationForBaseline(baseline.id, { projectId: baseline.project_id })')
    expect(revisionBridge).toContain('projectId: input.baseline.project_id')
  })

  it('scopes company governance calibration rows to visible projects', () => {
    const service = read('server/src/services/wbsTemplateSeedArchitectureGovernanceService.ts')
    const route = read('server/src/routes/wbs-template-governance.ts')

    expect(service).toContain('projectIds: string[]')
    expect(service).toContain(".in('project_id', projectIds)")
    expect(route).toContain('projectIds: await getFeedbackProjectScope(req)')
  })

  it('records system-wide calendar propagation and project-id capability reads as explicit reviewed boundaries', () => {
    const calendar = read('server/src/services/officialHolidayCalendarService.ts')
    const deviation = read('server/src/services/progressDeviationService.ts')

    expect(calendar).toContain('workspace-isolation-system-job-approved: official work-calendar publication')
    expect(deviation).toContain('workspace-isolation-capability-read-approved: progress deviation receives an authorized project id')
  })
})
