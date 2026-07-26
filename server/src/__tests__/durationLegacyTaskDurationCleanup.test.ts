import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readWbsTemplateGenerationImplementationSource } from './helpers/wbsTemplateGenerationSource.js'

const rootDir = path.resolve(__dirname, '../../..')
const allowedLegacyFieldFiles = new Set([
  'server/migrations/178_drop_legacy_task_duration_fields.sql',
  'server/migrations/208_drop_legacy_duration_physical_cache_objects.sql',
  'server/src/__tests__/durationLegacyTaskDurationCleanup.test.ts',
  'server/src/__tests__/retiredObjectReferenceAudit.test.ts',
])

const scannedLegacyFieldTargets = [
  'server/src',
  'server/migrations',
  'server/create_test_tasks.cjs',
  'server/test_update.cjs',
  'scripts/db/seed-data.ts',
]

const scannedRetiredAiDurationChannelTargets = [
  'server/src',
  'client/src',
  'scripts',
]

const publicDurationLegacyTemplateKeyTargets = [
  'server/src/routes/duration-suggestions.ts',
  'server/src/services/durationSuggestionService.ts',
  'server/src/services/wbsTemplateGenerationService.ts',
  'server/src/services/manualDurationCorrectionService.ts',
  'client/src/services/durationSuggestionsApi.ts',
  'client/src/pages/GanttView/taskFormUtils.ts',
]

const currentDurationNewWriteLegacyTemplateKeyTargets = [
  'server/src/services/durationExperienceService.ts',
  'server/src/services/taskStandardInferenceService.ts',
]

const currentLegacyTemplateKeySchemaTargets = [
  'server/migrations/140_v1418_duration_experience_tables.sql',
  'server/src/types/db.ts',
  'client/src/lib/supabase.ts',
  'client/src/pages/GanttViewTypes.ts',
]

const legacyTaskDurationCacheScriptTargets = [
  'scripts/db/seed-data.ts',
  'server/create_test_tasks.cjs',
  'server/test_update.cjs',
]

function read(relativePath: string) {
  if (relativePath === 'server/src/services/wbsTemplateGenerationService.ts') {
    return readWbsTemplateGenerationImplementationSource(path.join(rootDir, 'server'))
  }
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function listFiles(relativePath: string): string[] {
  const absolutePath = path.join(rootDir, relativePath)
  if (!fs.existsSync(absolutePath)) return []

  const stat = fs.statSync(absolutePath)
  if (stat.isFile()) return [relativePath.replace(/\\/g, '/')]

  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return []
    return listFiles(path.join(relativePath, entry.name))
  })
}

function isExecutableRuntimeSource(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/')
  if (normalized.includes('/__tests__/')) return false
  if (/\.(?:test|spec)\.(?:ts|tsx|js|cjs|mjs)$/.test(normalized)) return false
  return /\.(?:ts|tsx|js|cjs|mjs)$/.test(normalized)
}

function maskAllowedEstimateTableNames(source: string) {
  return source.replace(/\bai_duration_estimates\b/g, 'duration_estimate_records')
}

function expectNoLegacyAiTaskDurationFields(source: string, relativePath: string) {
  expect(source, relativePath).not.toMatch(/\breference_duration\b/)
  expect(source, relativePath).not.toMatch(/\bai_duration\b/)
  expect(source, relativePath).not.toMatch(/\bai_adjusted_duration\b/)
}

describe('legacy task duration field cleanup', () => {
  it('removes task reference_duration and ai_duration from backend task contracts and current algorithms', () => {
    const contracts = [
      'server/src/types/db.ts',
      'server/src/middleware/validation.ts',
      'server/src/services/dbService.ts',
      'server/src/services/manualDurationCorrectionService.ts',
      'server/src/services/taskDurationForecastService.ts',
      'server/src/routes/duration-suggestions.ts',
    ]

    for (const relativePath of contracts) {
      const source = maskAllowedEstimateTableNames(read(relativePath))
      expectNoLegacyAiTaskDurationFields(source, relativePath)
    }
  })

  it('keeps dormant planned_duration and standard_duration out of task write contracts', () => {
    const taskWriteContracts = [
      'server/src/middleware/validation.ts',
      'server/src/services/dbService.ts',
    ]

    for (const relativePath of taskWriteContracts) {
      const source = read(relativePath)
      expect(source, relativePath).not.toMatch(/\bplanned_duration\b/)
      expect(source, relativePath).not.toMatch(/\bstandard_duration\b/)
    }
  })

  it('adds a schema migration that drops the legacy task duration columns', () => {
    const migration = read('server/migrations/178_drop_legacy_task_duration_fields.sql')

    expect(migration).toContain('DROP COLUMN IF EXISTS reference_duration')
    expect(migration).toContain('DROP COLUMN IF EXISTS ai_duration')
    expect(migration).toContain('DROP COLUMN IF EXISTS ai_adjusted_duration')
    expect(migration).not.toContain('Historical ai_duration_estimates records are intentionally preserved')
  })

  it('adds a no-history physical cleanup migration for retired duration cache objects', () => {
    const migration = read('server/migrations/208_drop_legacy_duration_physical_cache_objects.sql')

    expect(migration).toMatch(/\bDROP\s+TABLE\s+IF\s+EXISTS\s+ai_duration_estimates\s+CASCADE\b/i)
    expect(migration).toMatch(/\bALTER\s+TABLE\s+IF\s+EXISTS\s+tasks\b/i)
    expect(migration).toContain('DROP COLUMN IF EXISTS planned_duration')
    expect(migration).toContain('DROP COLUMN IF EXISTS standard_duration')
    expect(migration).toContain('DROP COLUMN IF EXISTS reference_duration')
    expect(migration).toContain('DROP COLUMN IF EXISTS ai_duration')
    expect(migration).toContain('DROP COLUMN IF EXISTS ai_adjusted_duration')
  })

  it('keeps executable seed and setup scripts from writing retired task duration cache fields', () => {
    for (const relativePath of legacyTaskDurationCacheScriptTargets) {
      if (!fs.existsSync(path.join(rootDir, relativePath))) continue
      const source = read(relativePath)

      expect(source, relativePath).not.toMatch(/\bplanned_duration\b/)
      expect(source, relativePath).not.toMatch(/\bstandard_duration\b/)
    }
  })

  it('keeps clean bootstrap from recreating the retired completion report duration trigger', () => {
    const migration = read('server/migrations/CLEAN_MIGRATION_V4.sql')

    expect(migration).not.toContain('EXTRACT(DAY FROM (CURRENT_DATE - NEW.start_date))')
    expect(migration).not.toContain('EXECUTE FUNCTION auto_generate_completion_report()')
    expect(migration).not.toMatch(/\bCREATE\s+OR\s+REPLACE\s+FUNCTION\s+auto_generate_completion_report\b/i)
    expect(migration).toContain('DROP FUNCTION IF EXISTS auto_generate_completion_report() CASCADE')
  })

  it('retires the aiDurationService legacy estimate history channel', () => {
    const serviceSource = read('server/src/services/manualDurationCorrectionService.ts')

    expect(serviceSource).not.toContain('ai_duration_estimates')
    expect(serviceSource).not.toContain('AI工期服务')
    expect(serviceSource).not.toMatch(/\bestimateDuration\s*\(/)
    expect(serviceSource).not.toMatch(/\bgetConfidence\s*\(/)
    expect(serviceSource).not.toMatch(/\bsaveEstimate\s*\(/)
  })

  it('does not create or extend the retired ai_duration_estimates table in current migrations', () => {
    const migrationSources = listFiles('server/migrations')
      .filter((relativePath) => relativePath.endsWith('.sql'))
      .map((relativePath) => [relativePath, read(relativePath)] as const)

    for (const [relativePath, source] of migrationSources) {
      expect(source, relativePath).not.toMatch(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?ai_duration_estimates\b/i)
      expect(source, relativePath).not.toMatch(/\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?ai_duration_estimates\b/i)
    }
  })

  it('keeps current duration validation tests off retired aiDuration naming', () => {
    const testFiles = listFiles('server/src/__tests__')
      .filter((relativePath) => /\.(?:test|spec)\.ts$/.test(relativePath))

    expect(testFiles).not.toContain('server/src/__tests__/aiDurationValidation.test.ts')
    expect(testFiles).not.toContain('server/src/__tests__/aiDurationService.test.ts')
  })

  it('removes the old aiDurationService object and routes manual corrections through the named correction service', () => {
    expect(fs.existsSync(path.join(rootDir, 'server/src/services/aiDurationService.ts'))).toBe(false)

    const routeSource = read('server/src/routes/duration-suggestions.ts')
    const governanceSource = read('server/src/services/durationContextGovernanceService.ts')

    expect(routeSource).not.toContain('aiDurationService')
    expect(routeSource).not.toContain('AIDurationService')
    expect(routeSource).toContain('ManualDurationCorrectionService')
    expect(routeSource).toContain('manualDurationCorrectionService')
    expect(governanceSource).not.toContain('aiDurationService')
    expect(governanceSource).toContain('manualDurationCorrectionService')
  })

  it('removes the old AI duration DTO and public ai-duration route shell from current code', () => {
    expect(fs.existsSync(path.join(rootDir, 'server/src/routes/ai-duration.ts'))).toBe(false)

    const indexSource = read('server/src/index.ts')
    const dbTypes = read('server/src/types/db.ts')
    const durationRouteSource = read('server/src/routes/duration-suggestions.ts')

    expect(indexSource).not.toContain('/api/ai-duration')
    expect(indexSource).not.toContain('aiDurationRouter')
    expect(indexSource).toContain('/api/duration-suggestions')
    expect(indexSource).toContain('durationSuggestionsRouter')
    expect(dbTypes).not.toContain('AIDurationEstimate')
    expect(durationRouteSource).not.toContain('AIDurationEstimate')
    expect(durationRouteSource).not.toContain('ai-duration')
  })

  it('removes legacy duration suggestion route aliases from the canonical duration-suggestions router', () => {
    const durationRouteSource = read('server/src/routes/duration-suggestions.ts')

    expect(durationRouteSource).not.toContain("router.post('/estimate-duration'")
    expect(durationRouteSource).not.toContain("router.post('/estimate-batch'")
    expect(durationRouteSource).not.toContain("router.get('/confidence")
    expect(durationRouteSource).not.toContain("router.post('/duration-suggestions/task'")
    expect(durationRouteSource).not.toContain("router.post('/duration-suggestions/batch'")
    expect(durationRouteSource).not.toContain("router.post('/duration-suggestions/current-batch'")
    expect(durationRouteSource).toContain("router.post('/task'")
    expect(durationRouteSource).toContain("router.post('/batch'")
    expect(durationRouteSource).toContain("router.post('/current-batch'")
    expect(durationRouteSource).toContain("router.get('/tasks/:taskId/duration-forecast'")
  })

  it('keeps retired duration DTO aliases out of the canonical duration-suggestions serializer', () => {
    const durationRouteSource = read('server/src/routes/duration-suggestions.ts')
    const serializerSource = durationRouteSource.slice(
      durationRouteSource.indexOf('function serializeDurationSuggestion'),
      durationRouteSource.indexOf('function serializeTaskDurationForecast'),
    )

    expect(serializerSource).not.toContain('suggested_days')
    expect(serializerSource).not.toContain('estimated_duration')
    expect(serializerSource).not.toContain('conservative_duration')
    expect(serializerSource).not.toContain('remaining_duration_days')
    expect(serializerSource).not.toContain('optimistic_remaining_days')
    expect(serializerSource).not.toContain('conservative_remaining_days')
    expect(serializerSource).not.toContain('templateFastEstimateDays')
    expect(serializerSource).not.toContain('template_fast_estimate_days')
    expect(serializerSource).not.toContain('...canonicalSuggestion')
  })

  it('keeps delay-risk forecast payload behind governed duration output projection', () => {
    const durationRouteSource = read('server/src/routes/duration-suggestions.ts')
    const forecastServiceSource = read('server/src/services/taskDurationForecastService.ts')

    expect(forecastServiceSource).not.toMatch(/^\s*duration_forecast:\s*forecast\s*,?\s*$/m)
    expect(forecastServiceSource).toContain('toGovernedDurationForecastSignal(forecast)')
    expect(forecastServiceSource).not.toContain('forecast.remainingForecastDays ?? forecast.remainingDurationDays')
    expect(durationRouteSource).not.toMatch(/^\s*duration_forecast:\s*forecast\s*,?\s*$/m)
    expect(durationRouteSource).toContain('duration_forecast: serializeTaskDurationForecast(analysis.duration_forecast)')
  })

  it('removes the legacy aiSchedule duration facade from public routes', () => {
    expect(fs.existsSync(path.join(rootDir, 'server/src/routes/aiSchedule.ts'))).toBe(false)

    const indexSource = read('server/src/index.ts')
    expect(indexSource).not.toContain('aiScheduleRouter')
    expect(indexSource).not.toContain('/api/ai-schedule')
    expect(indexSource).not.toMatch(/app\.use\(['"]\/api\/ai['"]/)
    expect(indexSource).toContain('/api/duration-suggestions')
  })

  it('keeps retired AI duration and schedule channels out of runtime source and executable scripts', () => {
    const files = scannedRetiredAiDurationChannelTargets
      .flatMap(listFiles)
      .filter(isExecutableRuntimeSource)

    const forbiddenPatterns: Array<[string, RegExp]> = [
      ['old ai-duration API', /\/api\/ai-duration/],
      ['old ai-schedule API', /\/api\/ai-schedule/],
      ['old aiDurationService facade', /\bAIDurationService\b|\baiDurationService\b/],
      ['old aiSchedule facade', /\baiScheduleRouter\b|\baiSchedule\b/],
      ['old schedulePredictor facade', /\bschedulePredictor\b/],
    ]
    const offenders: string[] = []

    for (const relativePath of files) {
      const source = read(relativePath)
      for (const [label, pattern] of forbiddenPatterns) {
        if (pattern.test(source)) {
          offenders.push(`${relativePath}: ${label}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps legacy task duration fields out of backend source, setup scripts and schema creation migrations', () => {
    const files = scannedLegacyFieldTargets
      .flatMap(listFiles)
      .filter((relativePath) => !allowedLegacyFieldFiles.has(relativePath))
      .filter((relativePath) => /\.(ts|tsx|js|cjs|mjs|sql|bak)$/.test(relativePath))

    for (const relativePath of files) {
      const source = maskAllowedEstimateTableNames(read(relativePath))
      expectNoLegacyAiTaskDurationFields(source, relativePath)
    }
  }, 15000)

  it('keeps legacy template node keys out of public duration inputs and new task authoring paths', () => {
    for (const relativePath of publicDurationLegacyTemplateKeyTargets) {
      const source = read(relativePath)

      expect(source, relativePath).not.toContain('legacyTemplateNodeKey')
      expect(source, relativePath).not.toContain('legacy_template_node_key')
      if (relativePath.includes('durationSuggestionService') || relativePath.includes('wbsTemplateGenerationService')) {
        expect(source, relativePath).toContain('templateStableCode')
      }
    }
  })

  it('keeps legacy template node keys out of current duration sample writes and task standard inference', () => {
    for (const relativePath of currentDurationNewWriteLegacyTemplateKeyTargets) {
      const source = read(relativePath)

      expect(source, relativePath).not.toContain('legacyTemplateNodeKey')
      expect(source, relativePath).not.toContain('legacy_template_node_key')
    }
  })

  it('keeps legacy template node keys out of current duration learning and governance algorithms', () => {
    const algorithmTargets = [
      'server/src/services/algorithmSeedCandidateDiscoveryService.ts',
      'server/src/services/progressVelocityLearningService.ts',
      'server/src/services/standardWorkDurationSeedReplayGovernanceService.ts',
      'server/src/services/templateDurationGovernanceService.ts',
    ]

    for (const relativePath of algorithmTargets) {
      const source = read(relativePath)

      expect(source, relativePath).not.toContain('legacyTemplateNodeKey')
      expect(source, relativePath).not.toContain('legacy_template_node_key')
    }
  })

  it('drops legacy template node key columns and keeps current schema contracts free of the old field', () => {
    const dropMigration = read('server/migrations/183_drop_legacy_template_node_key_duration_channels.sql')

    expect(dropMigration).toContain('DROP COLUMN IF EXISTS legacy_template_node_key')
    expect(dropMigration).toContain('duration_experience_samples')
    expect(dropMigration).toContain('duration_benchmarks')
    expect(dropMigration).toContain('duration_suggestion_overrides')

    for (const relativePath of currentLegacyTemplateKeySchemaTargets) {
      const source = read(relativePath)

      expect(source, relativePath).not.toContain('legacy_template_node_key')
      expect(source, relativePath).not.toContain('legacyTemplateNodeKey')
    }
  })

  it('keeps public and operation-level template generation from selecting the fast-template duration channel', () => {
    const routeSource = read('server/src/routes/wbs-templates.ts')
    const generationSource = read('server/src/services/wbsTemplateGenerationService.ts')
    const clientApiSource = read('client/src/services/wbsTemplateGenerationApi.ts')
    const wbsApplyTestSource = read('server/src/__tests__/wbsTemplatesApply.test.ts')
    const governancePlanSources = [
      read('docs/plans/v1.4.22算法与规则口径治理体系执行方案.md'),
      read('docs/plans/v1.4.22.1项目快速建模与起跑线接入执行方案.md'),
      read('docs/plans/v1.4.18模板库与经验工期体系执行方案.md'),
      read('docs/plans/v1.4.7.2分部分项标准库与模板生成体系执行方案.md'),
    ]

    expect(routeSource).not.toContain('durationSuggestionMode: phaseOperation.durationSuggestionMode')
    expect(routeSource).not.toContain('durationSuggestionMode: operation.durationSuggestionMode')
    expect(clientApiSource).not.toContain('durationSuggestionMode')
    expect(generationSource).not.toContain('operation.durationSuggestionMode')
    expect(generationSource).not.toContain('operation.duration_suggestion_mode')
    expect(wbsApplyTestSource).not.toContain("durationSuggestionMode: 'fast_template'")
    for (const governancePlanSource of governancePlanSources) {
      expect(governancePlanSource).not.toContain('durationSuggestionMode=fast_template')
      expect(governancePlanSource).not.toContain('durationSuggestionMode=full')
      expect(governancePlanSource).not.toContain('fast_template_cold_start_to_plan_reference')
      expect(governancePlanSource).not.toContain('向导 `fast_template` 可以先落 `reference_duration`')
      expect(governancePlanSource).not.toContain('同步生成主链路默认 `durationSuggestionMode=fast_template`')
      expect(governancePlanSource).not.toContain('模板同步展开默认使用 `durationSuggestionMode=fast_template`')
    }
  })

  it('keeps current governance docs from describing retired AI duration facades as live compatibility channels', () => {
    const currentGovernancePlanSources = [
      read('docs/plans/v1.4.18模板库与经验工期体系执行方案.md'),
      read('docs/plans/v1.4.7.4项目基线算法与月度计划算法升级执行方案.md'),
      read('docs/plans/v1.4.13提醒通知与待办触达体系执行方案.md'),
      read('docs/plans/v1.4.21材料管控与任务联动体系执行方案.md'),
      read('docs/plans/v1.4.22算法与规则口径治理体系执行方案.md'),
      read('docs/plans/v1.4.23总集成与全链路验收体系执行方案.md'),
    ]
    const forbiddenLiveCompatibilityPhrases = [
      '`aiSchedule` 仅保留为兼容路由',
      '旧 `ai-duration / ai-schedule / ai_duration` 命名短期保留兼容',
      '旧接口短期兼容',
      '旧 AI 兼容转调',
      '旧 AI 接口兼容转调',
      '旧 AI 接口兼容委托',
      '旧 AI 工期链路保留兼容委托',
      '旧 AI 工期接口：只做兼容路由',
      'reference_duration / ai_duration 继续作为旧工期兜底',
      'ai_duration_estimates 不存在时可创建',
      '/api/ai-duration/estimate-duration 短期保留 URL',
      '/api/ai-schedule/analyze-delay-risk 短期保留 URL',
      'tasks.ai_duration 保留兼容',
    ]

    for (const governancePlanSource of currentGovernancePlanSources) {
      for (const phrase of forbiddenLiveCompatibilityPhrases) {
        expect(governancePlanSource).not.toContain(phrase)
      }
    }
  })

  it('keeps exported WBS generation params from exposing the fast-template duration channel', () => {
    const generationSource = read('server/src/services/wbsTemplateGenerationService.ts')

    expect(generationSource).not.toContain('durationSuggestionMode?: WbsTemplateDurationSuggestionMode')
    expect(generationSource).toContain('diagnosticDurationSuggestionMode?: WbsTemplateDurationSuggestionMode')
  })

  it('keeps WBS full duration generation on the shared ProjectGenerationFacts scale path', () => {
    const generationSource = read('server/src/services/wbsTemplateGenerationService.ts')
    const suggestionSource = read('server/src/services/durationSuggestionService.ts')

    expect(generationSource).toContain('projectGenerationFacts: buildProjectGenerationFactsSnapshot(featureProfile)')
    expect(generationSource).toContain('resolveSharedProjectFactDurationScaling(baseDays, seedRule, featureProfile)')
    expect(generationSource).not.toContain('applyProjectFactScalingToDurationSuggestion')
    expect(suggestionSource).toContain('resolveProjectFactDurationScaling(')
    expect(suggestionSource).toContain("source: 'project_fact_scale_proxy'")
  })

  it('keeps WBS diagnostic fast estimates on the governed standard-work seed resolver', () => {
    const generationSource = read('server/src/services/wbsTemplateGenerationService.ts')

    expect(generationSource).toContain('resolveStandardWorkDurationSeed(')
    expect(generationSource).not.toContain('STANDARD_WORK_DURATION_SEED_BY_CODE.get')
  })

  it('keeps the pure WBS generation suite out of real permission/database lookups', () => {
    const testSource = read('server/src/__tests__/wbsTemplateGenerationService.test.ts')
    const loggerSource = read('server/src/middleware/logger.ts')

    expect(testSource).toContain("process.env.DISABLE_PERMISSION_SYSTEM = 'true'")
    expect(testSource).toContain("process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn'")
    expect(testSource).toContain("vi.mock('../services/dbService.js'")
    expect(testSource).toContain("diagnosticDurationSuggestionMode: normalizedParams.diagnosticDurationSuggestionMode ?? 'fast_template'")
    expect(testSource).toContain("generateWbsTemplatePhaseChainRowsRaw")
    expect(testSource).toContain("diagnosticDurationSuggestionMode: params.diagnosticDurationSuggestionMode ?? 'fast_template'")
    expect(loggerSource).toContain("process.env.NODE_ENV === 'test' ? 'warn' : 'info'")
  })

  it('keeps diagnostic and benchmark scripts from selecting the fast-template duration channel', () => {
    const diagnosticSources = listFiles('scripts/diagnostics')
      .filter((relativePath) => isExecutableRuntimeSource(relativePath))
      .map((relativePath) => [relativePath, read(relativePath)] as const)

    for (const [relativePath, source] of diagnosticSources) {
      expect(source, relativePath).not.toContain("durationSuggestionMode: 'fast_template'")
      expect(source, relativePath).not.toContain('durationSuggestionMode=fast_template')
      expect(source, relativePath).not.toContain('sync fast_template')
    }
  })

  it('keeps runtime duration suggestion outputs free of fast-template diagnostic fields', () => {
    const runtimeSuggestionSource = read('server/src/services/durationSuggestionService.ts')
    const clientApiSource = read('client/src/services/durationSuggestionsApi.ts')

    expect(runtimeSuggestionSource).not.toContain('templateFastEstimateDays')
    expect(clientApiSource).not.toContain('templateFastEstimateDays')
  })

  it('keeps legacy fallback duration inputs out of public and runtime duration suggestions', () => {
    const routeSource = read('server/src/routes/duration-suggestions.ts')
    const runtimeSuggestionSource = read('server/src/services/durationSuggestionService.ts')
    const clientApiSource = read('client/src/services/durationSuggestionsApi.ts')

    for (const [relativePath, source] of [
      ['server/src/routes/duration-suggestions.ts', routeSource],
      ['server/src/services/durationSuggestionService.ts', runtimeSuggestionSource],
      ['client/src/services/durationSuggestionsApi.ts', clientApiSource],
    ] as const) {
      expect(source, relativePath).not.toContain('fallbackDurationDays')
      expect(source, relativePath).not.toContain('fallback_duration_days')
    }

    expect(runtimeSuggestionSource).not.toContain('legacy_fallback_duration_days')
  })

  it('keeps runtime duration suggestions from consuming legacy template reference days as fallback', () => {
    const runtimeSuggestionSource = read('server/src/services/durationSuggestionService.ts')

    expect(runtimeSuggestionSource).not.toContain('legacy_template_node_reference')
    expect(runtimeSuggestionSource).not.toContain('legacy_template_reference_days')
    expect(runtimeSuggestionSource).not.toContain("from('wbs_template_nodes')")
    expect(runtimeSuggestionSource).not.toContain("from('wbs_templates')")
    expect(runtimeSuggestionSource).not.toContain("default_duration_days, standard_duration, reference_days")
    expect(runtimeSuggestionSource).not.toContain("reference_days, project_id, company_id, catalog_scope, is_builtin, standard_catalog_code")
  })

  it('keeps execution duration forecasts from naming plan-reference candidates as template fallback', () => {
    const forecastSource = read('server/src/services/taskDurationForecastService.ts')
    const contextSource = read('server/src/services/durationContextService.ts')

    for (const [relativePath, source] of [
      ['server/src/services/taskDurationForecastService.ts', forecastSource],
      ['server/src/services/durationContextService.ts', contextSource],
    ] as const) {
      expect(source, relativePath).not.toContain('template_reference_only')
      expect(source, relativePath).not.toContain('templateFallback')
      expect(source, relativePath).not.toContain('forecastFallbackPolicy')
      expect(source, relativePath).not.toContain('forecastFallbackRecommended')
      expect(source, relativePath).not.toContain('progress_quality_template_fallback')
    }

    expect(forecastSource).toContain('planReferenceFallbackRecommended')
    expect(contextSource).toContain('plan_reference_ratio_only')
  })

  it('keeps manual duration corrections from synthesizing one-day baselines when governed suggestions are unavailable', () => {
    const correctionSource = read('server/src/services/manualDurationCorrectionService.ts')

    expect(correctionSource).not.toContain('suggestion.recommendedDurationDays ?? 1')
    expect(correctionSource).not.toContain('Math.max(1, Math.ceil(Number(suggestion.recommendedDurationDays')
    expect(correctionSource).not.toContain('recommendedDurationDays?: number | null')
    expect(correctionSource).toContain('readGovernedManualBaselineDuration')
    expect(correctionSource).toContain("'contextual_reference'")
    expect(correctionSource).toContain("'plan_reference'")
  })

  it('keeps manual correction and delay forecast service signals on semantic camelCase duration outputs', () => {
    const correctionSource = read('server/src/services/manualDurationCorrectionService.ts')
    const forecastSource = read('server/src/services/taskDurationForecastService.ts')
    const forecastSignalSource = forecastSource.slice(
      forecastSource.indexOf('function toGovernedDurationForecastSignal'),
      forecastSource.indexOf('export async function analyzeTaskDelayRiskWithDurationForecast'),
    )

    expect(correctionSource).toContain('durationOutputCode: suggestion.durationOutputCode')
    expect(correctionSource).toContain('durationOutputSemanticFieldName: suggestion.durationOutputSemanticFieldName')
    expect(correctionSource).toContain('contextualReferenceDays: suggestion.contextualReferenceDays')
    expect(correctionSource).not.toContain('duration_output_code: suggestion.durationOutputCode')
    expect(correctionSource).not.toContain('duration_output_semantic_field_name: suggestion.durationOutputSemanticFieldName')
    expect(correctionSource).not.toContain('contextual_reference_days: suggestion.contextualReferenceDays')

    expect(forecastSignalSource).toContain('durationOutputCode')
    expect(forecastSignalSource).toContain('durationOutputSemanticFieldName')
    expect(forecastSignalSource).toContain('remainingForecastDays')
    expect(forecastSignalSource).not.toContain('duration_output_code')
    expect(forecastSignalSource).not.toContain('duration_output_semantic_field_name')
    expect(forecastSignalSource).not.toContain('remaining_forecast_days')
    expect(forecastSignalSource).not.toContain('recommendedDurationDays: forecast.recommendedDurationDays')
  })

  it('keeps current duration calculation contexts off legacy snake_case output contract fields', () => {
    const runtimeTargets = [
      'server/src/services/durationSuggestionService.ts',
      'server/src/services/taskDurationForecastService.ts',
      'server/src/services/durationContextService.ts',
      'server/src/services/wbsTemplateGenerationService.ts',
    ]

    for (const relativePath of runtimeTargets) {
      const source = read(relativePath)
      expect(source, relativePath).not.toContain('duration_output_contract')
      expect(source, relativePath).toContain('durationOutputContract')
    }
  })

  it('keeps governed duration consumers from falling back to naked recommended duration days', () => {
    const routeSource = read('server/src/routes/duration-suggestions.ts')
    const clientApiSource = read('client/src/services/durationSuggestionsApi.ts')
    const wbsGenerationApiSource = read('client/src/services/wbsTemplateGenerationApi.ts')
    const materialsApiSource = read('client/src/services/materialsApi.ts')
    const materialsSource = read('client/src/pages/Materials.tsx')
    const correctionSource = read('server/src/services/manualDurationCorrectionService.ts')
    const baselineSource = read('server/src/services/baselineGenerationService.ts')
    const accelerationSource = read('server/src/services/scheduleAccelerationService.ts')
    const wbsTemplateSource = read('server/src/services/wbsTemplateGenerationService.ts')

    expect(routeSource).not.toContain('suggestion?.recommendedDurationDays ?? suggestion?.recommended_duration_days')
    expect(routeSource).not.toContain('recommendedDurationDays: forecast?.recommendedDurationDays ?? null')
    expect(routeSource).not.toContain('raw.source')
    expect(routeSource).not.toContain('raw.benchmark_key')
    expect(routeSource).not.toContain('raw.confidence_level')
    expect(routeSource).not.toContain('raw.duration_calibration_source')
    expect(routeSource).not.toContain('raw.duration_provenance')
    expect(routeSource).not.toContain('raw.factor_summary')
    expect(clientApiSource).not.toContain('recommendedDurationDays: raw?.recommendedDurationDays ?? raw?.recommended_duration_days ?? null')
    expect(clientApiSource).not.toContain('rawRecommendedDurationDays')
    expect(clientApiSource).not.toContain("durationOutputCode === 'template_fast_estimate' ? null : rawRecommendedDurationDays")
    expect(materialsSource).not.toContain('?? suggestion.recommendedDurationDays')
    expect(correctionSource).not.toContain('suggestion.contextualReferenceDays ?? suggestion.recommendedDurationDays')
    expect(correctionSource).not.toContain('suggestion.planReferenceDays ?? suggestion.recommendedDurationDays')
    expect(baselineSource).not.toContain('result.value.recommendedDurationDays ?? 0')
    expect(baselineSource).not.toContain('record.duration_output_code')
    expect(baselineSource).not.toContain('record.contextual_reference_days')
    expect(baselineSource).not.toContain('record.plan_reference_days')
    expect(baselineSource).not.toContain('record.remaining_forecast_days')
    expect(accelerationSource).not.toContain('Number(suggestion.recommendedDurationDays)')
    expect(accelerationSource).not.toContain('suggestion.duration_output_code')
    expect(accelerationSource).not.toContain('suggestion.contextual_reference_days')
    expect(accelerationSource).not.toContain('suggestion.plan_reference_days')
    expect(accelerationSource).not.toContain('suggestion.remaining_forecast_days')
    expect(wbsTemplateSource).not.toContain('return suggestion.recommendedDurationDays')
    expect(wbsTemplateSource).not.toContain('planReferenceDays: suggestion.recommendedDurationDays')
    expect(wbsTemplateSource).not.toContain('recommendedDurationDays: durationSuggestion.recommendedDurationDays')
    expect(wbsTemplateSource).toContain('sanitizeGeneratedTemplateRowsForPublicOutput')
    expect(wbsTemplateSource).toContain('return readPositiveNumber(suggestion.planReferenceDays)')
    expect(wbsGenerationApiSource).not.toContain('recommendedDurationDays: number | null')
    expect(materialsApiSource).not.toContain('recommendedDurationDays: number | null')
  })

  it('keeps the project-level remaining forecast public DTO on the semantic camelCase channel', () => {
    const routeSource = read('server/src/routes/schedule-acceleration.ts')
    const clientApiSource = read('client/src/services/projectRemainingForecastApi.ts')

    expect(routeSource).toContain('serializeProjectRemainingForecast')
    expect(routeSource).not.toContain('...result')
    expect(clientApiSource).not.toContain('...raw')

    for (const [relativePath, source] of [
      ['server/src/routes/schedule-acceleration.ts', routeSource],
      ['client/src/services/projectRemainingForecastApi.ts', clientApiSource],
    ] as const) {
      expect(source, relativePath).not.toContain('project_remaining_forecast_days')
      expect(source, relativePath).not.toContain('duration_output_code')
      expect(source, relativePath).not.toContain('duration_output_semantic_field_name')
      expect(source, relativePath).not.toContain('forecast_finish_date')
      expect(source, relativePath).not.toContain('target_gap_days')
      expect(source, relativePath).not.toContain('rows_evaluated')
      expect(source, relativePath).not.toContain('calculation_context')
    }
  })

  it('keeps template generation preview duration display on semantic camelCase fields', () => {
    const previewSource = read('client/src/components/planning/TemplateGenerationPreview.tsx')

    expect(previewSource).toContain('readGovernedReferenceDuration')
    expect(previewSource).not.toContain('suggestion.duration_output_code')
    expect(previewSource).not.toContain('suggestion.duration_output_semantic_field_name')
    expect(previewSource).not.toContain('suggestion.contextual_reference_days')
    expect(previewSource).not.toContain('suggestion.plan_reference_days')
    expect(previewSource).not.toContain('suggestion.remaining_forecast_days')
  })

  it('keeps golden benchmark replay duration evidence on semantic camelCase fields', () => {
    const replaySource = read('server/src/services/wbsTemplateGoldenBenchmarkReplayService.ts')

    expect(replaySource).toContain('summarizeDurationOutputs')
    expect(replaySource).not.toContain('suggestion?.duration_output_code')
    expect(replaySource).not.toContain('suggestion?.duration_output_semantic_field_name')
    expect(replaySource).not.toContain('suggestion?.duration_output_promotion')
    expect(replaySource).not.toContain('suggestion?.duration_output_write_evaluation')
    expect(replaySource).not.toContain('suggestion?.contextual_reference_days')
    expect(replaySource).not.toContain('suggestion?.plan_reference_days')
    expect(replaySource).not.toContain('suggestion?.remaining_forecast_days')
    expect(replaySource).not.toContain('suggestion?.template_fast_estimate_days')
    expect(replaySource).not.toContain('promotion?.from_output_code')
  })
})
