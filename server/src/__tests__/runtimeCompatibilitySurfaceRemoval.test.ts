import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const forbiddenRuntimeFragments: Array<[string, string]> = [
  ['index.ts', "app.get('/api/health'"],
  ['index.ts', "app.use('/api/pre-milestones'"],
  ['index.ts', "app.use('/api/dashboard'"],
  ['auth/session.ts', 'mapLegacyRoleToGlobalRole'],
  ['auth/session.ts', 'email, role, global_role'],
  ['auth/session.ts', 'role: (currentCompanyRole'],
  ['auth/jwt.ts', 'role: user.role'],
  ['auth/types.ts', 'role?: string'],
  ['auth/access.ts', 'isMissingCompanyScopeSchemaError'],
  ['auth/access.ts', 'Legacy fallback only applies'],
  ['routes/projects.ts', 'fell back to legacy project list'],
  ['routes/dashboard.ts', 'req.query.projectId'],
  ['routes/dashboard.ts', "['title', 'name']"],
  ['routes/tasks.ts', 'retrying fixed legacy insert'],
  ['routes/tasks.ts', 'retrying fixed oldest-schema insert'],
  ['routes/tasks.ts', "field === 'title' || field === 'name'"],
  ['routes/tasks.ts', 'values.title ?? values.name'],
  ['routes/tasks.ts', '(task as { name?: string | null }).name'],
  ['routes/task-baselines.ts', 'row.title ?? row.name'],
  ['routes/monthly-plans.ts', 'row.title ?? row.name'],
  ['routes/task-conditions.ts', 'ensureTaskPrecedingRelationsTable'],
  ['routes/task-conditions.ts', 'extractMissingTaskConditionColumn'],
  ['routes/task-conditions.ts', 'ensureTaskConditionDrawingPackageColumns'],
  ['routes/task-conditions.ts', 'isMissingRelationError'],
  ['routes/drawing-packages.ts', 'isMissingTableError'],
  ['routes/drawing-review-rules.ts', 'isMissingTableError'],
  ['routes/task-summaries.ts', 'building_id, region_id, phase_id'],
  ['routes/task-summaries.ts', '// 兼容旧字段'],
  ['routes/notifications.ts', 'personal_states'],
  ['routes/reminders.ts', 'tryLoadLegacyNotificationSettings'],
  ['routes/acceptance-plans.ts', 'legacyRows'],
  ['routes/acceptance-plans.ts', 'acceptance_plans SET task_id'],
  ['routes/projectWizard.ts', 'selectDraftLegacySql'],
  ['routes/projectWizard.ts', 'legacy_direct_trigger'],
  ['routes/task-obstacles.ts', 'req.body.description ?? req.body.title'],
  ['routes/task-obstacles.ts', 'req.body.is_resolved ==='],
  ['routes/auth.ts', 'role: user.role'],
  ['routes/auth-me.ts', 'role: globalRole'],
  ['routes/auth-profile.ts', 'email, role, global_role'],
  ['routes/auth-profile.ts', 'role: updatedUser.role'],
  ['routes/auth-change-password.ts', 'email, role, global_role'],
  ['routes/auth-change-password.ts', 'role: updatedUser.role'],
  ['routes/auth-register.ts', 'role: newUser.role'],
  ['services/authRegistrationService.ts', 'email, role, global_role'],
  ['services/authRegistrationService.ts', 'device_id'],
  ['middleware/validation.ts', 'phase_id: uuidSchema.optional().nullable()'],
  ['middleware/auditLogger.ts', '/\\/api\\/health$/'],
  ['types/db.ts', 'phase_id?: string'],
  ['types/planning.ts', 'phase_id?: string | null'],
  ['services/dbService.ts', 'phase_id: task.phase_id'],
  ['services/dbService.ts', 'milestone.title ?? milestone.name'],
  ['services/dbService.ts', 'assignee_unit: task.assignee_unit'],
  ['services/dbService.ts', 'Falling back to direct task delete because task_preceding_relations is missing'],
  ['services/dataQualityService.ts', 'draft?.phase_id ?? baseTask?.phase_id'],
  ['services/taskConditionLinkageService.ts', 'ensureTaskConditionDrawingPackageColumns'],
  ['services/taskConditionLinkageService.ts', 'ensureTaskConditionParticipantUnitColumn'],
  ['services/taskConditionLinkageService.ts', 'ALTER TABLE public.task_conditions'],
  ['services/taskWriteChainService.ts', 'tasks.preceding_task_id'],
  ['services/taskWriteChainService.ts', 'task_preceding_relations missing'],
  ['services/taskWriteChainService.ts', 'payload.title ?? payload.name'],
  ['services/manualDurationCorrectionService.ts', 'task.title ?? task.name'],
  ['services/taskSummaryService.ts', '(task as any).name'],
  ['services/taskPlanDrilldownPolicyService.ts', 'task.name'],
  ['services/taskPlanDrilldownRhythmService.ts', 'task.title ?? task.name'],
  ['services/taskStandardInferenceService.ts', 'merged.title ?? merged.name'],
  ['services/projectCriticalPathService.ts', 'row.title || row.name'],
  ['services/projectCriticalPathService.ts', 'task.title ?? task.name'],
  ['services/projectCriticalPathService.ts', 'task.title || task.name'],
  ['services/progressDeviationService.ts', 'tasks.preceding_task_id'],
  ['services/jobRuntime.ts', 'CREATE TABLE IF NOT EXISTS public.job_failures'],
  ['services/statusDictionaryService.ts', 'CREATE TABLE IF NOT EXISTS status_domains'],
  ['services/constructionDependencyReplayCalibrationPersistenceService.ts', 'CREATE TABLE IF NOT EXISTS public.construction_dependency_replay_calibration_reports'],
  ['services/materialReportsService.ts', 'partially migrated schemas'],
  ['services/materialReportsService.ts', 'extractMissingTaskColumn'],
  ['services/commercialFoundationService.ts', 'isMissingCommercialSchemaError'],
  ['services/commercialTransactionService.ts', "if (code === '42703' || code === '42P01') return false"],
  ['services/durationSuggestionService.ts', 'isMissingCompanyColumnError'],
  ['services/durationSuggestionService.ts', 'isMissingProjectColumnError'],
  ['services/durationSuggestionService.ts', 'findLegacyBenchmark'],
  ['services/projectExecutionSummaryService.ts', 'isMissingPendingCloseoutCountColumn'],
  ['services/projectExecutionSummaryService.ts', 'withPendingCloseoutCountFallback'],
  ['services/projectExecutionSummaryService.ts', 'weeklyKpiSnapshotWithoutTodos'],
  ['services/projectExecutionSummaryService.ts', 'isMissingMilestoneSnapshotColumn'],
  ['services/projectExecutionSummaryService.ts', 'using legacy fallback metrics'],
  ['services/projectClimateProfileService.ts', 'isMissingClimateSchema'],
  ['services/regionalClimateRuleCandidateService.ts', 'isMissingCandidateSchema'],
  ['services/deletionRetentionGovernanceService.ts', 'export type RetentionDecision ='],
  ['services/weatherForecastImpactService.ts', 'isMissingWeatherSchema'],
  ['services/weatherImpactSignalReadModelService.ts', 'isMissingWeatherSchema'],
  ['services/acceptanceFlowService.ts', 'ACCEPTANCE_REQUIREMENT_COMPAT'],
  ['services/acceptanceFlowService.ts', 'Fall back to the legacy executeSQL path'],
  ['services/dataLineageService.ts', 'public.warnings'],
  ['services/sqlColumns.ts', "'responsible_unit'"],
  ['services/deletionRetentionGovernanceService.ts', "addCount(refs, 'warnings', 'warnings'"],
  ['routes/task-baselines.ts', ".from('milestones')"],
  ['routes/task-summaries.ts', ".from('milestones')"],
  ['routes/task-summaries.ts', ".from('task_milestones')"],
  ['routes/wbs-templates.ts', ".from('milestones')"],
  ['services/planningIntegrityService.ts', 'public.milestones'],
  ['services/progressDeviationService.ts', 'public.milestones'],
  ['services/progressDeviationService.ts', "fetchRows<Milestone>('milestones'"],
  ['routes/pre-milestones.ts', 'INSERT INTO wbs_structure'],
  ['middleware/validation.ts', 'responsible_unit: z.string().optional().nullable()'],
]

describe('runtime compatibility surface removal', () => {
  it.each(forbiddenRuntimeFragments)('%s no longer contains %s', (relativePath, fragment) => {
    expect(readRuntimeSource(relativePath)).not.toContain(fragment)
  })

  it('counts plan phases from canonical phase objects without the retired task phase_id field', () => {
    const source = readRuntimeSource('services/projectExecutionSummaryService.ts')

    expect(source).toContain('row.phase_object_id')
    expect(source).not.toMatch(/\brow\.phase_id\b/)
  })

  it('removes the singular preceding_task_id field without rejecting the current preceding_task_ids API', () => {
    expect(readRuntimeSource('routes/task-conditions.ts')).not.toMatch(/\bpreceding_task_id\b/)
    expect(readRuntimeSource('services/taskWriteChainService.ts')).not.toMatch(/\bpreceding_task_id\b/)
    expect(readRuntimeSource('services/progressDeviationService.ts')).not.toMatch(/\bpreceding_task_id\b/)
  })

  it.each([
    'services/taskDurationForecastService.ts',
    'services/upgradeChainService.ts',
    'services/warningService.ts',
  ])('%s resolves acceptance-plan tasks through project_entity_links', (relativePath) => {
    expect(readRuntimeSource(relativePath)).not.toMatch(
      /\.from\('acceptance_plans'\)[\s\S]{0,700}(?:\.select\([^)]*\btask_id\b|\.eq\('task_id')/,
    )
  })

  it('removes the retired metric registry compatibility barrel', () => {
    expect(runtimeSourceExists('analytics/metricRegistry.ts')).toBe(false)
  })

  it.each([
    'auth/access.ts',
    'auth/types.ts',
    'routes/members.ts',
    'routes/invitations.ts',
    'routes/workspace.ts',
    'services/invitationAcceptanceService.ts',
    'services/dbService.ts',
    'types/db.ts',
  ])('%s no longer models viewer as a project permission', (relativePath) => {
    expect(readRuntimeSource(relativePath)).not.toMatch(/\bviewer\b/i)
  })

  it.each([
    'routes/acceptance-plans.ts',
    'routes/construction-drawings.ts',
    'services/dataQualityService.ts',
    'services/materialArrivalReminderService.ts',
    'services/milestoneIntegrityService.ts',
    'services/operationalNotificationService.ts',
    'services/planningGovernanceService.ts',
    'services/projectCriticalPathService.ts',
    'services/progressDeviationService.ts',
    'services/responsibilityInsightService.ts',
    'services/taskWriteChainService.ts',
    'services/upgradeChainService.ts',
  ])('%s no longer reads the retired project_members.role column', (relativePath) => {
    const source = readRuntimeSource(relativePath)

    expect(source).not.toMatch(/\b(?:member|pm|projectMember|project_member)\.role\b/i)
    expect(source).not.toMatch(
      /\bSELECT\b[^'"`\r\n;]{0,300}\brole\b[^'"`\r\n;]{0,300}\bFROM\s+(?:public\.)?project_members\b/i,
    )
    expect(source).not.toMatch(
      /\bFROM\s+(?:public\.)?project_members\b[^'"`\r\n;]{0,300}\brole\b/i,
    )
  })

  it.each([
    ['scripts/db/check-and-create-collections.js', /['"](?:milestones|wbs_structure|wbs_task_links)['"]/i],
    ['scripts/db/seed-data.ts', /\bpermission_level\s*:\s*['"](?:admin|viewer)['"]|\btable\s*:\s*['"]milestones['"]/i],
    ['scripts/diagnostics/full-data-check.ts', /['"]milestones['"]/i],
    ['scripts/diagnostics/live-workspace-isolation-regression.mjs', /['"](?:milestones|task_milestones)['"]/i],
    ['scripts/seed-task-summary-demo.mjs', /\.from\(['"](?:milestones|task_milestones)['"]\)|\b(?:phase_id|assignee_unit|responsible_unit)\s*:/i],
    ['scripts/verify-v11-chapter6-7.mjs', /\.from\(['"]milestones['"]\)|\bassignee_unit\s*:/i],
    ['scripts/verify-v2-live-browser.mjs', /\b(?:phase_id|assignee_unit|responsible_unit)\s*:/i],
    ['project-testing/tools/run-v1424-g6-company-summary-pressure.mjs', /\bdevice_id\s*:/i],
    ['project-testing/tools/run-v14241-real-uat03-rls-role-matrix.mjs', /\bviewer\b/i],
  ] as Array<[string, RegExp]>)('%s does not reintroduce retired database or permission fixtures', (relativePath, pattern) => {
    expect(readWorkspaceSource(relativePath)).not.toMatch(pattern)
  })
})

function readRuntimeSource(relativePath: string) {
  const rootRelativePath = resolve(process.cwd(), 'server', 'src', relativePath)
  const serverRelativePath = resolve(process.cwd(), 'src', relativePath)
  return readFileSync(existsSync(rootRelativePath) ? rootRelativePath : serverRelativePath, 'utf8')
}

function runtimeSourceExists(relativePath: string) {
  const rootRelativePath = resolve(process.cwd(), 'server', 'src', relativePath)
  const serverRelativePath = resolve(process.cwd(), 'src', relativePath)
  return existsSync(rootRelativePath) || existsSync(serverRelativePath)
}

function readWorkspaceSource(relativePath: string) {
  const rootRelativePath = resolve(process.cwd(), relativePath)
  const parentRelativePath = resolve(process.cwd(), '..', relativePath)
  return readFileSync(existsSync(rootRelativePath) ? rootRelativePath : parentRelativePath, 'utf8')
}
