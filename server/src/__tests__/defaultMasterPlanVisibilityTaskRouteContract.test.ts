import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('default master-plan visibility feedback task-route contract', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/routes/tasks.ts'), 'utf8')

  it('captures explicit preview selection after successful generated-task commit', () => {
    expect(source).toContain('buildDefaultMasterPlanVisibilityFeedback({')
    expect(source).toContain("explicitReview: Array.isArray(generationOperation.previewRows)")
    expect(source).toContain('retainedClientRowIds: generatedRows.map((row) => row.clientRowId)')
    expect(source).toContain('persistDefaultMasterPlanVisibilityFeedbackCandidate(visibilityFeedback)')
  })

  it('captures deletion of generated master-plan tasks as candidate-only feedback', () => {
    expect(source).toContain('buildDefaultMasterPlanVisibilityTaskAdjustmentFeedback({')
    expect(source).toContain("adjustment: 'hide'")
    expect(source).toContain('persistDefaultMasterPlanVisibilityFeedbackCandidate(deleteVisibilityFeedback)')
  })
})
