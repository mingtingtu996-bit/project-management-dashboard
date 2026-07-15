import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('WBS legacy serial template path removal', () => {
  it('removes the old direct template_generate handler from planningBootstrap', async () => {
    const source = await readFile(new URL('../services/planningBootstrap.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('handleTemplateGenerate')
    expect(source).not.toContain('template.wbs_nodes ?? []')
    expect(source).not.toContain('generatedCount: generatedItems.length')
    expect(source).not.toContain('buildBaselineItemsFromTemplateNodes')
  })

  it('removes the old serial-template materializer name from WBS routes', async () => {
    const source = await readFile(new URL('../routes/wbs-templates.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('buildBaselineItemsFromTemplateNodes')
  })

  it('keeps from-template on the default master-plan path instead of the serial baseline materializer', async () => {
    const source = await readFile(new URL('../routes/wbs-templates.ts', import.meta.url), 'utf8')
    const start = source.indexOf("router.post('/bootstrap/from-template'")
    const end = source.indexOf("router.get('/export-json'")

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)

    const fromTemplateBlock = source.slice(start, end)
    expect(fromTemplateBlock).toContain('buildDefaultMasterPlanBaselineDraft')
    expect(fromTemplateBlock).toContain('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')
    expect(fromTemplateBlock).toContain('directFailure: true')
    expect(fromTemplateBlock).toContain('legacyFallbackRemoved: true')
    expect(fromTemplateBlock).toContain('managedFallbackRemoved: true')
    expect(fromTemplateBlock).not.toContain('buildBaselineItemsFromTemplateNodes')
    expect(fromTemplateBlock).not.toContain('legacy_template_serial_fallback')
    expect(fromTemplateBlock).not.toContain('legacy_fallback')
    expect(fromTemplateBlock).not.toContain('fallback_policy')
    expect(fromTemplateBlock).not.toContain('controlledDegradation')
    expect(fromTemplateBlock).not.toContain('fallbackApplied')
    expect(fromTemplateBlock).not.toContain('handoffGenerationMode')
  })

  it('requires published explicit default master-plan entry templates before generating candidate drafts', async () => {
    const source = await readFile(new URL('../routes/wbs-templates.ts', import.meta.url), 'utf8')

    expect(source).toContain('function isPublishedWbsTemplateRow')
    expect(source).toContain("'status'")
    expect(source).toContain('const isActive = template.deleted_at === null || template.deleted_at === undefined')
    expect(source).toContain("const status = normalizeTemplateScope(template.status ?? template.lifecycle_status)")
    expect(source).toContain("const statusAllowsGeneration = !status || status === 'published' || status === 'active'")
    expect(source).toContain('const rawIsDefault = template.is_default ?? template.is_construction_default ?? false')
    expect(source).toContain('return isActive && statusAllowsGeneration && !isDraft')
    expect(source).toContain('if (!isPublishedWbsTemplateRow(template)) return false')
  })

  it('removes reverse-template and manual schedule bootstrap routes from reachable server surfaces', async () => {
    const wbsTemplateRoute = await readFile(new URL('../routes/wbs-templates.ts', import.meta.url), 'utf8')
    const taskBaselineRoute = await readFile(new URL('../routes/task-baselines.ts', import.meta.url), 'utf8')

    expect(wbsTemplateRoute).not.toContain('/bootstrap/from-completed-project')
    expect(wbsTemplateRoute).not.toContain('/bootstrap/from-ongoing-project')
    expect(wbsTemplateRoute).not.toContain('completed_project_to_template')
    expect(wbsTemplateRoute).not.toContain('ongoing_project_to_baseline')
    expect(taskBaselineRoute).not.toContain('/bootstrap/from-schedule')
    expect(taskBaselineRoute).not.toContain('ongoing_project_to_baseline')
  })

  it('retires the standalone WBS template page and keeps generation embedded', async () => {
    const retiredPage = new URL('../../../client/src/pages/WBSTemplates.tsx', import.meta.url)
    const embeddedSource = await readFile(new URL('../../../client/src/components/planning/TemplateInlineExpand.tsx', import.meta.url), 'utf8')
    const apiSource = await readFile(new URL('../../../client/src/services/wbsTemplateGenerationApi.ts', import.meta.url), 'utf8')

    expect(existsSync(retiredPage)).toBe(false)
    expect(embeddedSource).toContain('data-testid="template-inline-expand"')
    expect(embeddedSource).toContain('generateWbsTemplatePreview')
    expect(apiSource).toContain('/api/planning/wbs-templates/generate-preview')
    expect(apiSource).not.toContain('/api/wbs-templates')
  })

  it('keeps legacy scope sanitizer coverage off retired bootstrap endpoints', async () => {
    const source = await readFile(new URL('./wbsTemplateImportLegacyScopeSanitizer.test.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('/bootstrap/from-completed-project')
    expect(source).not.toContain('/bootstrap/from-ongoing-project')
    expect(source).not.toContain('/api/task-baselines/bootstrap/from-schedule')
  })
})
