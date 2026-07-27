import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'
import { readWbsTemplateGenerationImplementationSource } from './helpers/wbsTemplateGenerationSource.js'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : join(process.cwd(), 'server'))
const guardPath = resolve(serverRoot, 'scripts', 'guard-duration-architecture-boundaries.mjs')

describe('duration architecture boundary guard', () => {
  it('keeps durationContextService from directly selecting L3 fact tables', () => {
    const source = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const forbiddenDirectReads = [
      ".from('tasks')",
      ".from('task_conditions')",
      ".from('task_obstacles')",
      ".from('project_materials')",
      ".from('task_progress_snapshots')",
      ".from('data_quality_findings')",
      ".from('task_dependencies')",
    ]

    for (const forbidden of forbiddenDirectReads) {
      expect(source).not.toContain(forbidden)
    }
    expect(source).not.toContain('durationContextFactTable')
  })

  it('keeps external readiness fact query construction behind the read model', () => {
    const contextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const readModelSource = readFileSync(resolve(serverRoot, 'src/services/durationContextFactReadModelService.ts'), 'utf8')
    const externalReadinessSource = readFileSync(resolve(serverRoot, 'src/services/durationContextExternalReadinessFactorService.ts'), 'utf8')
    const workflowSequenceSource = readFileSync(resolve(serverRoot, 'src/services/durationContextWorkflowSequenceFactorService.ts'), 'utf8')

    for (const tableName of [
      'tasks',
      'task_conditions',
      'task_obstacles',
      'project_materials',
      'task_progress_snapshots',
      'data_quality_findings',
      'task_dependencies',
    ]) {
      expect(contextSource).not.toContain(`durationContextFactTable('${tableName}')`)
      expect(readModelSource).toContain(`durationContextFactTable('${tableName}')`)
    }
    expect(contextSource).toContain('readDurationContextTaskContextRow')
    expect(contextSource).not.toContain('readDurationContextTaskReadinessSignalRows')
    expect(externalReadinessSource).toContain('readDurationContextTaskReadinessSignalRows')
    expect(contextSource).toContain('readDurationContextResourceReadinessRows')
    expect(contextSource).not.toContain('readDurationContextTaskProgressSnapshotRows')
    expect(externalReadinessSource).toContain('readDurationContextTaskProgressSnapshotRows')
    expect(readModelSource).toContain('readDurationContextProgressQualityFindings')
    expect(contextSource).not.toContain('readDurationContextActiveTaskDependencies')
    expect(workflowSequenceSource).toContain('readDurationContextActiveTaskDependencies')
    expect(contextSource).toContain('readDurationContextResponsibleUnitHistoryRows')
    expect(contextSource).toContain('readDurationContextResourceConflictTaskRows')
  })

  it('keeps progress quality factor construction behind its dedicated service boundary', () => {
    const contextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const progressQualitySource = readFileSync(resolve(serverRoot, 'src/services/durationContextProgressQualityFactorService.ts'), 'utf8')

    expect(contextSource).not.toContain('async function buildProgressQualityFactor')
    expect(contextSource).toContain('buildProgressQualityFactor(contextInput, runtimeCache)')
    expect(progressQualitySource).toContain('export async function buildProgressQualityFactor')
    expect(progressQualitySource).toContain('readDurationContextTaskProgressSnapshotRows')
    expect(progressQualitySource).toContain('readDurationContextProgressQualityFindings')
    expect(progressQualitySource).not.toContain("from('task_progress_snapshots')")
    expect(progressQualitySource).not.toContain("from('data_quality_findings')")
  })

  it('keeps project schedule-state factor construction behind its dedicated service boundary', () => {
    const contextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const scheduleStateSource = readFileSync(resolve(serverRoot, 'src/services/durationContextProjectScheduleStateFactorService.ts'), 'utf8')

    expect(contextSource).not.toContain('async function buildProjectScheduleStateFactor')
    expect(contextSource).not.toContain('function applyProjectScheduleStatePolicy')
    expect(contextSource).not.toContain('combineProjectScheduleStatePolicy')
    expect(contextSource).toContain('buildProjectScheduleStateFactor(contextInput)')
    expect(contextSource).toContain('applyProjectScheduleStatePolicy(recoveryFactor ? [...baseFactors, recoveryFactor] : baseFactors)')
    expect(scheduleStateSource).toContain('export async function buildProjectScheduleStateFactor')
    expect(scheduleStateSource).toContain('export function applyProjectScheduleStatePolicy')
    expect(scheduleStateSource).toContain('loadApplicableProjectScheduleStates')
    expect(scheduleStateSource).not.toContain("from('project_schedule_states')")
  })

  it('keeps project baseline calibration factor construction behind its dedicated service boundary', () => {
    const contextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const baselineCalibrationSource = readFileSync(resolve(serverRoot, 'src/services/durationContextProjectBaselineCalibrationFactorService.ts'), 'utf8')

    expect(contextSource).not.toContain('async function buildProjectBaselineCalibrationFactor')
    expect(contextSource).not.toContain('function buildProjectBaselineSample')
    expect(contextSource).not.toContain('function weightedRatioAverage')
    expect(contextSource).not.toContain('function baselineCalibrationConfidence')
    expect(contextSource).toContain('buildProjectBaselineCalibrationFactor(contextInput)')
    expect(baselineCalibrationSource).toContain('export async function buildProjectBaselineCalibrationFactor')
    expect(baselineCalibrationSource).toContain('loadPublishedProgressVelocityRuntime')
    expect(baselineCalibrationSource).not.toContain('loadProjectBaselineCalibrationDurationExperienceSamples')
    expect(baselineCalibrationSource).toContain('project_baseline_calibration')
    expect(baselineCalibrationSource).not.toContain("from('duration_experience_samples')")
  })

  it('keeps progress velocity raw experience reads behind the governed sample read model', () => {
    const progressVelocitySource = readFileSync(resolve(serverRoot, 'src/services/progressVelocityLearningService.ts'), 'utf8')
    const sampleReadModelSource = readFileSync(resolve(serverRoot, 'src/services/durationContextSampleReadModelService.ts'), 'utf8')

    expect(progressVelocitySource).toContain('loadProgressVelocityProjectDurationExperienceSamples')
    expect(progressVelocitySource).toContain('loadProgressVelocityCompanyDurationExperienceSamples')
    expect(progressVelocitySource).not.toContain("from('duration_experience_samples')")
    expect(sampleReadModelSource).toContain("from('duration_experience_samples')")
    expect(sampleReadModelSource).toContain("'company_id'")
    expect(sampleReadModelSource).toContain("'source_lineage'")
  })

  it('keeps project productivity calibration raw experience reads behind the governed sample read model', () => {
    const calibrationSource = readFileSync(resolve(serverRoot, 'src/services/projectProductivityCalibrationService.ts'), 'utf8')
    const sampleReadModelSource = readFileSync(resolve(serverRoot, 'src/services/durationContextSampleReadModelService.ts'), 'utf8')

    expect(calibrationSource).toContain('loadProjectProductivityCalibrationDurationExperienceSamples')
    expect(calibrationSource).not.toContain("from('duration_experience_samples')")
    expect(sampleReadModelSource).toContain('loadProjectProductivityCalibrationDurationExperienceSamples')
  })

  it('keeps runtime productivity compensation on published assets and explicit governance replay input', () => {
    const compensationSource = readFileSync(resolve(serverRoot, 'src/services/projectProductivityCompensationService.ts'), 'utf8')
    const calibrationSource = readFileSync(resolve(serverRoot, 'src/services/projectProductivityCalibrationService.ts'), 'utf8')

    expect(compensationSource).toContain('loadPublishedProjectProductivityCalibration')
    expect(compensationSource).toContain("governanceMode?: 'learning_shadow_replay'")
    expect(compensationSource).toContain("input.governanceMode === 'learning_shadow_replay'")
    expect(compensationSource).not.toContain("from('duration_experience_samples')")
    expect(compensationSource).not.toContain('buildProjectProgressVelocityLearning')
    expect(calibrationSource).toContain("governanceMode: 'learning_shadow_replay'")
    expect(calibrationSource).toContain('durationSamples: samples')
  })

  it('keeps productivity compensation factor construction behind its dedicated service boundary', () => {
    const contextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const productivityCompensationSource = readFileSync(resolve(serverRoot, 'src/services/durationContextProductivityCompensationFactorService.ts'), 'utf8')

    expect(contextSource).not.toContain('async function buildProductivityCompensationFactor')
    expect(contextSource).not.toContain('function productivityFromAppliedPenaltyFactors')
    expect(contextSource).toContain('buildProductivityCompensationFactor(contextInput, schedulePolicyFactors)')
    expect(productivityCompensationSource).toContain('export async function buildProductivityCompensationFactor')
    expect(productivityCompensationSource).toContain('buildProjectProductivityCompensation')
    expect(productivityCompensationSource).toContain('pm_recovery_candidate_owns_local_recovery_candidate_path')
    expect(productivityCompensationSource).not.toContain("from('duration_experience_samples')")
    expect(productivityCompensationSource).not.toContain("from('project_daily_snapshot')")
    expect(productivityCompensationSource).not.toContain("from('project_schedule_states')")
  })

  it('keeps workflow-sequence factor construction behind its dedicated service boundary', () => {
    const contextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const workflowSequenceSource = readFileSync(resolve(serverRoot, 'src/services/durationContextWorkflowSequenceFactorService.ts'), 'utf8')

    expect(contextSource).not.toContain('async function buildWorkflowSequenceFactor')
    expect(contextSource).not.toContain('resolveV1475CrossItemWorkflow')
    expect(contextSource).not.toContain('resolveV1474BuildingPatternMatches')
    expect(contextSource).toContain('buildWorkflowSequenceFactor(contextInput)')
    expect(workflowSequenceSource).toContain('export async function buildWorkflowSequenceFactor')
    expect(workflowSequenceSource).toContain('readDurationContextActiveTaskDependencies')
    expect(workflowSequenceSource).toContain('algorithm_seed_records.cross_item_workflow')
    expect(workflowSequenceSource).not.toContain("from('task_dependencies')")
  })

  it('keeps PM recovery compensation factor construction behind its dedicated service boundary', () => {
    const contextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const pmRecoverySource = readFileSync(resolve(serverRoot, 'src/services/durationContextPmRecoveryCompensationFactorService.ts'), 'utf8')

    expect(contextSource).not.toContain('function buildPmRecoveryCompensationFactor')
    expect(contextSource).not.toContain('async function buildPmRecoveryCompensationFactorWithEligibility')
    expect(contextSource).not.toContain('loadPmRecoveryEligibilityDurationExperienceSamples')
    expect(contextSource).toContain('buildPmRecoveryCompensationFactorWithEligibility(contextInput, initialAppliedFactors)')
    expect(pmRecoverySource).toContain('export async function buildPmRecoveryCompensationFactorWithEligibility')
    expect(pmRecoverySource).toContain('loadPublishedProgressVelocityRuntime')
    expect(pmRecoverySource).not.toContain('loadPmRecoveryEligibilityDurationExperienceSamples')
    expect(pmRecoverySource).toContain('candidate_only_until_pm_confirms_resequencing_capacity')
    expect(pmRecoverySource).not.toContain("from('duration_experience_samples')")
  })

  it('keeps runtime duration consumers on published assets instead of learning raw samples in request paths', () => {
    const runtimeFiles = [
      'durationContextService.ts',
      'durationSuggestionService.ts',
      'taskDurationForecastService.ts',
      'durationContextProjectBaselineCalibrationFactorService.ts',
      'durationContextPmRecoveryCompensationFactorService.ts',
      'projectProductivityCompensationService.ts',
    ]
    const forbiddenRuntimeLearningIdentifiers = [
      'buildProjectProgressVelocityLearning',
      'loadProjectBaselineCalibrationDurationExperienceSamples',
      'loadPmRecoveryEligibilityDurationExperienceSamples',
      'loadProgressVelocityProjectDurationExperienceSamples',
      'loadProgressVelocityCompanyDurationExperienceSamples',
    ]

    for (const fileName of runtimeFiles) {
      const source = readFileSync(resolve(serverRoot, 'src/services', fileName), 'utf8')
      for (const identifier of forbiddenRuntimeLearningIdentifiers) {
        expect(source).not.toContain(identifier)
      }
    }
  })

  it('fails closed when a runtime factor service imports a raw-sample learning reader', async () => {
    const { evaluateDurationArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-runtime-learning-boundary-'))
    const servicesRoot = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesRoot, { recursive: true })
    writeFileSync(join(servicesRoot, 'durationContextProjectBaselineCalibrationFactorService.ts'), [
      "import { loadProjectBaselineCalibrationDurationExperienceSamples } from './durationContextSampleReadModelService.js'",
      'export async function build(projectId: string) {',
      '  return loadProjectBaselineCalibrationDurationExperienceSamples(projectId)',
      '}',
    ].join('\n'))

    const result = evaluateDurationArchitectureBoundaryGuard(fixtureRoot)

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'forbidden_runtime_raw_sample_bypass',
        fileName: 'durationContextProjectBaselineCalibrationFactorService.ts',
        identifier: 'loadProjectBaselineCalibrationDurationExperienceSamples',
      }),
    ]))
  })

  it('keeps active weather productivity ceiling synthesis behind its dedicated service boundary', () => {
    const contextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const productivityCeilingSource = readFileSync(resolve(serverRoot, 'src/services/durationContextActiveWeatherProductivityCeilingService.ts'), 'utf8')

    expect(contextSource).not.toContain('function resolveActiveWeatherProductivityCeiling')
    expect(contextSource).not.toContain('function applyProductivityCeilingToScenario')
    expect(contextSource).toContain('resolveActiveWeatherProductivityCeiling(contextInput, sortedFactors)')
    expect(contextSource).toContain('applyProductivityCeilingToScenario(summarizeLedgerDurationScenario')
    expect(productivityCeilingSource).toContain('export function resolveActiveWeatherProductivityCeiling')
    expect(productivityCeilingSource).toContain('export function applyProductivityCeilingToScenario')
    expect(productivityCeilingSource).toContain('active_severe_weather_shutdown_ceiling')
    expect(productivityCeilingSource).not.toContain("from('duration_experience_samples')")
    expect(productivityCeilingSource).not.toContain("from('project_daily_snapshot')")
    expect(productivityCeilingSource).not.toContain("from('project_schedule_states')")
  })

  it('keeps seasonal productivity factor construction behind its dedicated service boundary', () => {
    const contextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const seasonalProductivitySource = readFileSync(resolve(serverRoot, 'src/services/durationContextSeasonalProductivityFactorService.ts'), 'utf8')

    expect(contextSource).not.toContain('async function buildSeasonalFactor')
    expect(contextSource).not.toContain('function isSpringFestivalHoliday')
    expect(contextSource).toContain('buildSeasonalFactor(contextInput)')
    expect(seasonalProductivitySource).toContain('export async function buildSeasonalFactor')
    expect(seasonalProductivitySource).toContain('resolveProjectClimateRegion')
    expect(seasonalProductivitySource).toContain('resolveV1474SeasonalProductivity')
    expect(seasonalProductivitySource).toContain('resolveV1474HolidayWindow')
    expect(seasonalProductivitySource).toContain('calendar_missing')
    expect(seasonalProductivitySource).not.toContain("from('duration_experience_samples')")
    expect(seasonalProductivitySource).not.toContain("from('project_daily_snapshot')")
    expect(seasonalProductivitySource).not.toContain("from('project_schedule_states')")
    expect(seasonalProductivitySource).not.toContain("from('task_dependencies')")
  })

  it('keeps process seasonal sensitivity factor construction behind its dedicated service boundary', () => {
    const contextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const processSeasonalSource = readFileSync(resolve(serverRoot, 'src/services/durationContextProcessSeasonalSensitivityFactorService.ts'), 'utf8')

    expect(contextSource).not.toContain('async function buildProcessSeasonalFactor')
    expect(contextSource).toContain('buildProcessSeasonalFactor(contextInput)')
    expect(processSeasonalSource).toContain('export async function buildProcessSeasonalFactor')
    expect(processSeasonalSource).toContain('resolveV1474ProcessSeasonalSensitivity')
    expect(processSeasonalSource).toContain('resolveV1474SeasonalProductivity')
    expect(processSeasonalSource).toContain('process_seasonal_sensitivity')
    expect(processSeasonalSource).not.toContain("from('duration_experience_samples')")
    expect(processSeasonalSource).not.toContain("from('project_daily_snapshot')")
    expect(processSeasonalSource).not.toContain("from('project_schedule_states')")
    expect(processSeasonalSource).not.toContain("from('task_dependencies')")
  })

  it('keeps weather forecast impact factor construction behind its dedicated service boundary', () => {
    const contextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const weatherForecastSource = readFileSync(resolve(serverRoot, 'src/services/durationContextWeatherForecastImpactFactorService.ts'), 'utf8')

    expect(contextSource).not.toContain('async function buildWeatherForecastImpactFactor')
    expect(contextSource).not.toContain('function weatherStaticCouplingObservation')
    expect(contextSource).not.toContain('function dampenWeatherMultiplierForStaticSeason')
    expect(contextSource).not.toContain('loadWeatherCanaryRuntimeMultiplier')
    expect(contextSource).toContain('buildWeatherForecastImpactFactor(contextInput)')
    expect(weatherForecastSource).toContain('export async function buildWeatherForecastImpactFactor')
    expect(weatherForecastSource).toContain('loadProjectWeatherImpactSignalsWithDiagnostics')
    expect(weatherForecastSource).toContain('resolveV1474ProcessSeasonalSensitivity')
    expect(weatherForecastSource).toContain('weatherStaticCoupling')
    expect(weatherForecastSource).toContain('site_shutdown_events')
    expect(weatherForecastSource).not.toContain("from('duration_experience_samples')")
    expect(weatherForecastSource).not.toContain("from('project_daily_snapshot')")
    expect(weatherForecastSource).not.toContain("from('project_schedule_states')")
    expect(weatherForecastSource).not.toContain("from('task_dependencies')")
  })

  it('keeps process constraint factor construction behind its dedicated service boundary', () => {
    const contextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const processConstraintSource = readFileSync(resolve(serverRoot, 'src/services/durationContextProcessConstraintFactorService.ts'), 'utf8')

    expect(contextSource).not.toContain('async function buildProcessConstraintFactor')
    expect(contextSource).not.toContain('function buildProcessConstraintConditionContext')
    expect(contextSource).not.toContain('function applyProcessConstraintConditionalEffects')
    expect(contextSource).not.toContain('function buildReleaseQuantityGate')
    expect(contextSource).toContain('buildProcessConstraintFactor(contextInput)')
    expect(processConstraintSource).toContain('export async function buildProcessConstraintFactor')
    expect(processConstraintSource).toContain('resolveV1474ProcessConstraint')
    expect(processConstraintSource).toContain('releaseQuantityPolicy')
    expect(processConstraintSource).toContain('conditionalEffectsApplied')
    expect(processConstraintSource).toContain('algorithm_seed_records.process_constraint')
    expect(processConstraintSource).not.toContain("from('duration_experience_samples')")
    expect(processConstraintSource).not.toContain("from('project_daily_snapshot')")
    expect(processConstraintSource).not.toContain("from('project_schedule_states')")
    expect(processConstraintSource).not.toContain("from('task_dependencies')")
  })

  it('keeps external readiness factor construction behind its dedicated service boundary', () => {
    const contextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    const externalReadinessSource = readFileSync(resolve(serverRoot, 'src/services/durationContextExternalReadinessFactorService.ts'), 'utf8')

    expect(contextSource).not.toContain('async function buildExternalReadinessFactor')
    expect(contextSource).not.toContain('function summarizeExternalReadinessCause')
    expect(contextSource).not.toContain('function normalizeExternalReadinessCalibrationOverlay')
    expect(contextSource).toContain('buildExternalReadinessFactor(contextInput, runtimeCache)')
    expect(externalReadinessSource).toContain('export async function buildExternalReadinessFactor')
    expect(externalReadinessSource).toContain('readDurationContextTaskReadinessSignalRows')
    expect(externalReadinessSource).toContain('externalReadinessCalibration')
    expect(externalReadinessSource).not.toContain("from('tasks')")
    expect(externalReadinessSource).not.toContain("from('task_conditions')")
    expect(externalReadinessSource).not.toContain("from('task_obstacles')")
    expect(externalReadinessSource).not.toContain("from('project_materials')")
    expect(externalReadinessSource).not.toContain("from('task_progress_snapshots')")
    expect(externalReadinessSource).not.toContain("from('task_dependencies')")
  })

  it('blocks new L2-L4 duration compute files from importing seeds or reading raw duration samples', async () => {
    const { evaluateDurationArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-duration-arch-'))
    const servicesRoot = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesRoot, { recursive: true })

    writeFileSync(join(servicesRoot, 'durationSuggestionService.ts'), [
      "import { STANDARD_WORK_DURATION_SEED } from '../seeds/standardWorkDurationSeed.js'",
      'export function suggest() { return STANDARD_WORK_DURATION_SEED.length }',
    ].join('\n'))
    writeFileSync(join(servicesRoot, 'taskDurationForecastService.ts'), [
      "export async function forecast(supabase: any) {",
      "  return supabase.from('duration_experience_samples').select('*')",
      '}',
    ].join('\n'))
    writeFileSync(join(servicesRoot, 'durationContextFactorSynthesisService.ts'), [
      "import { STANDARD_WORK_DURATION_SEED } from '../seeds/standardWorkDurationSeed.js'",
      'export async function synthesize(supabase: any) {',
      "  const samples = await supabase.from('duration_experience_samples').select('*')",
      '  return { seedCount: STANDARD_WORK_DURATION_SEED.length, sampleCount: samples.data?.length ?? 0 }',
      '}',
    ].join('\n'))
    writeFileSync(join(servicesRoot, 't2RhythmReplayLearningCandidateService.ts'), [
      'export const candidatePayload = {',
      "  experienceTier: 'T2',",
      "  experienceAssetType: 'process_duration',",
      '}',
    ].join('\n'))
    writeFileSync(join(servicesRoot, 'constructionOrganizationScenarioGovernanceService.ts'), [
      'export const candidatePayload = {',
      "  source: 'construction_organization_plan_option',",
      '}',
    ].join('\n'))
    writeFileSync(join(servicesRoot, 't2RhythmTaskWindowAnnotationCandidateEventService.ts'), [
      'export const candidatePayload = {',
      "  experienceTier: 'T2',",
      '}',
    ].join('\n'))
    writeFileSync(join(servicesRoot, 'standardWorkDurationSeedReplayCandidateBridgeService.ts'), [
      "// experienceTier: 'T1',",
      "// experienceAssetType: 'process_duration',",
      'export const candidatePayload = {',
      "  runtimeGovernancePolicy: 'candidate_only',",
      '}',
    ].join('\n'))

    const result = evaluateDurationArchitectureBoundaryGuard(fixtureRoot)

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'forbidden_seed_import',
        fileName: 'durationSuggestionService.ts',
        importPath: '../seeds/standardWorkDurationSeed.js',
      }),
      expect.objectContaining({
        type: 'forbidden_raw_duration_sample_read',
        fileName: 'taskDurationForecastService.ts',
      }),
      expect.objectContaining({
        type: 'forbidden_seed_import',
        fileName: 'durationContextFactorSynthesisService.ts',
      }),
      expect.objectContaining({
        type: 'forbidden_raw_duration_sample_read',
        fileName: 'durationContextFactorSynthesisService.ts',
      }),
      expect.objectContaining({
        type: 'missing_experience_tier_marker',
        fileName: 'standardWorkDurationSeedReplayCandidateBridgeService.ts',
      }),
      expect.objectContaining({
        type: 'missing_experience_asset_type_marker',
        fileName: 'standardWorkDurationSeedReplayCandidateBridgeService.ts',
      }),
      expect.objectContaining({
        type: 'invalid_experience_tier_asset_type_pair',
        fileName: 't2RhythmReplayLearningCandidateService.ts',
      }),
      expect.objectContaining({
        type: 'missing_experience_tier_marker',
        fileName: 'constructionOrganizationScenarioGovernanceService.ts',
      }),
      expect.objectContaining({
        type: 'missing_experience_asset_type_marker',
        fileName: 'constructionOrganizationScenarioGovernanceService.ts',
      }),
      expect.objectContaining({
        type: 'missing_experience_asset_type_marker',
        fileName: 't2RhythmTaskWindowAnnotationCandidateEventService.ts',
      }),
    ]))
  })

  it('blocks fast-template diagnostic duration mode from becoming a product or API surface', async () => {
    const { evaluateDurationArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-duration-fast-template-'))
    const routesRoot = join(fixtureRoot, 'server', 'src', 'routes')
    const servicesRoot = join(fixtureRoot, 'server', 'src', 'services')
    const clientRoot = join(fixtureRoot, 'client', 'src', 'services')
    mkdirSync(routesRoot, { recursive: true })
    mkdirSync(servicesRoot, { recursive: true })
    mkdirSync(clientRoot, { recursive: true })

    writeFileSync(join(routesRoot, 'projectWizard.ts'), [
      'export const preview = {',
      "  diagnosticDurationSuggestionMode: 'fast_template',",
      '}',
    ].join('\n'))
    writeFileSync(join(servicesRoot, 'wbsTemplateGenerationService.ts'), [
      "type WbsTemplateDurationSuggestionMode = 'fast_template' | 'full'",
      'export const internalDiagnosticMode: WbsTemplateDurationSuggestionMode = \'fast_template\'',
    ].join('\n'))
    writeFileSync(join(routesRoot, 'wbs-templates.ts'), [
      'export function parseOperation(operation: any) {',
      '  return { durationSuggestionMode: operation.durationSuggestionMode }',
      '}',
    ].join('\n'))
    writeFileSync(join(clientRoot, 'wbsTemplateGenerationApi.ts'), [
      'export const request = {',
      "  durationSuggestionMode: 'fast_template',",
      '}',
    ].join('\n'))

    const result = evaluateDurationArchitectureBoundaryGuard(fixtureRoot)

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'diagnostic_fast_template_product_surface',
        fileName: 'wbs-templates.ts',
      }),
      expect.objectContaining({
        type: 'diagnostic_fast_template_product_surface',
        fileName: 'wbsTemplateGenerationApi.ts',
      }),
    ]))
    expect(result.violations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'diagnostic_fast_template_product_surface',
        fileName: 'projectWizard.ts',
      }),
      expect.objectContaining({
        type: 'diagnostic_fast_template_product_surface',
        fileName: 'wbsTemplateGenerationService.ts',
      }),
    ]))
  })

  it('guards WBS runtime consumer from direct duration seed constants and raw duration sample reads', async () => {
    const { evaluateDurationArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-wbs-duration-consumer-'))
    const servicesRoot = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesRoot, { recursive: true })

    writeFileSync(join(servicesRoot, 'wbsTemplateGenerationService.ts'), [
      "import { type StandardWorkDurationSeedRule } from '../seeds/standardWorkDurationSeed.js'",
      "import { STANDARD_WORK_DURATION_SEED } from '../seeds/standardWorkDurationSeed.js'",
      "import { resolveStandardWorkDurationSeed } from './algorithmSeedResolver.js'",
      'export async function generate(supabase: any) {',
      "  const samples = await supabase.from('duration_experience_samples').select('*')",
      '  return resolveStandardWorkDurationSeed({ standardWorkCode: samples.data?.[0]?.standard_work_code }) ?? STANDARD_WORK_DURATION_SEED[0]',
      '}',
    ].join('\n'))

    const result = evaluateDurationArchitectureBoundaryGuard(fixtureRoot)

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'forbidden_wbs_standard_duration_seed_runtime_import',
        fileName: 'wbsTemplateGenerationService.ts',
        importPath: '../seeds/standardWorkDurationSeed.js',
      }),
      expect.objectContaining({
        type: 'forbidden_wbs_raw_duration_sample_read',
        fileName: 'wbsTemplateGenerationService.ts',
      }),
    ]))
    expect(result.violations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'forbidden_seed_import',
        fileName: 'wbsTemplateGenerationService.ts',
      }),
    ]))
  })

  it('blocks E1-E5 duration engines from dropping the DurationInputAssembler evidence contract', async () => {
    const { evaluateDurationArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-duration-assembler-contract-'))
    const servicesRoot = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesRoot, { recursive: true })

    writeFileSync(join(servicesRoot, 'durationSuggestionService.ts'), [
      'export function suggest() {',
      "  return { source: 'legacy_direct_duration_context' }",
      '}',
    ].join('\n'))
    writeFileSync(join(servicesRoot, 'taskDurationForecastService.ts'), [
      'export function forecast() {',
      "  return { forecastSources: { source: 'remaining_duration_forecast' } }",
      '}',
    ].join('\n'))
    writeFileSync(join(servicesRoot, 'projectCriticalPathService.ts'), [
      'export function calculateCriticalPath() {',
      "  return { snapshot: { source: 'critical_path_cpm' } }",
      '}',
    ].join('\n'))
    writeFileSync(join(servicesRoot, 'projectRemainingDurationForecastService.ts'), [
      'export function forecastProjectRemaining() {',
      "  return { calculationContext: { source: 'project_remaining_forecast' } }",
      '}',
    ].join('\n'))
    writeFileSync(join(servicesRoot, 'scheduleAccelerationRuntimeService.ts'), [
      'export function buildRuntimeRecoveryContext() {',
      "  return { t2RhythmScheduleEvidence: { source: 'schedule_acceleration_runtime' } }",
      '}',
    ].join('\n'))

    const result = evaluateDurationArchitectureBoundaryGuard(fixtureRoot)

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'missing_duration_input_assembler_engine_contract',
        fileName: 'durationSuggestionService.ts',
        engine: 'E1',
      }),
      expect.objectContaining({
        type: 'missing_duration_input_assembler_engine_contract',
        fileName: 'taskDurationForecastService.ts',
        engine: 'E2',
      }),
      expect.objectContaining({
        type: 'missing_duration_input_assembler_engine_contract',
        fileName: 'projectCriticalPathService.ts',
        engine: 'E3',
      }),
      expect.objectContaining({
        type: 'missing_duration_input_assembler_engine_contract',
        fileName: 'projectRemainingDurationForecastService.ts',
        engine: 'E4',
      }),
      expect.objectContaining({
        type: 'missing_duration_input_assembler_engine_contract',
        fileName: 'scheduleAccelerationRuntimeService.ts',
        engine: 'E5',
      }),
    ]))
  })

  it('keeps the current WBS runtime consumer on resolver and observation boundaries', async () => {
    const { evaluateDurationArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)

    const result = evaluateDurationArchitectureBoundaryGuard(serverRoot)
    const wbsSource = readWbsTemplateGenerationImplementationSource(serverRoot)

    expect(result.violations.filter((item) => item.fileName.startsWith('wbsTemplate'))).toEqual([])
    expect(wbsSource).toContain('resolveStandardWorkDurationSeed')
    expect(wbsSource).not.toContain('STANDARD_WORK_DURATION_SEED')
    expect(wbsSource).not.toContain("from('duration_experience_samples')")
    expect(wbsSource).not.toContain('from("duration_experience_samples")')
  })

  it('keeps current duration architecture boundaries guarded while preserving explicit legacy debt', async () => {
    const { evaluateDurationArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)

    const result = evaluateDurationArchitectureBoundaryGuard(serverRoot)

    expect(result.violations).toEqual([])
    expect(result.legacyDebt.filter((item) => item.fileName === 'durationContextService.ts')).toEqual([])
    expect(result.legacyDebt.filter((item) => item.fileName === 'scheduleAccelerationService.ts')).toEqual([])
    expect(result.legacyDebt).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        fileName: 'durationSuggestionService.ts',
      }),
      expect.objectContaining({
        fileName: 'scheduleAccelerationService.ts',
        importPath: '../seeds/durationContributionMode.js',
      }),
    ]))

    const durationSuggestionSource = readFileSync(resolve(serverRoot, 'src/services/durationSuggestionService.ts'), 'utf8')
    expect(durationSuggestionSource).not.toContain('../seeds/durationContributionMode.js')
    expect(durationSuggestionSource).toContain('resolveDurationContributionModeFromResolver')

    const scheduleAccelerationSource = readFileSync(resolve(serverRoot, 'src/services/scheduleAccelerationService.ts'), 'utf8')
    expect(scheduleAccelerationSource).not.toContain('../seeds/durationContributionMode.js')
    expect(scheduleAccelerationSource).toContain('resolveDurationContributionModeFromResolver as normalizeDurationContributionMode')

    const durationContextSource = readFileSync(resolve(serverRoot, 'src/services/durationContextService.ts'), 'utf8')
    expect(durationContextSource).not.toContain('../seeds/v1474SeasonalProductivitySeed.js')
    expect(durationContextSource).not.toContain('../seeds/durationContributionMode.js')
    expect(durationContextSource).not.toContain('../seeds/v1474ProcessConstraintSeed.js')
    expect(durationContextSource).not.toContain('../seeds/executionNature.js')
    expect(durationContextSource).not.toContain('../seeds/v1474ResourceClassSeed.js')
    expect(durationContextSource).not.toContain('../seeds/workEnvironment.js')
    expect(durationContextSource).not.toContain('deriveSeasonalProductivityRegionFromResolver')
    expect(durationContextSource).toContain('resolveDurationContributionModeFromResolver')
    expect(durationContextSource).toContain('inferExecutionNatureFromResolver')
    expect(durationContextSource).toContain('normalizeExecutionNatureFromResolver')
    expect(durationContextSource).toContain('inferResourcePressureDimensionsFromResolver')
    expect(durationContextSource).toContain('inferWorkEnvironmentFromResolver')
    expect(durationContextSource).toContain('normalizeWorkEnvironmentFromResolver')

    const seasonalProductivitySource = readFileSync(resolve(serverRoot, 'src/services/durationContextSeasonalProductivityFactorService.ts'), 'utf8')
    const processSeasonalSource = readFileSync(resolve(serverRoot, 'src/services/durationContextProcessSeasonalSensitivityFactorService.ts'), 'utf8')
    expect(seasonalProductivitySource).toContain('deriveSeasonalProductivityRegionFromResolver')
    expect(processSeasonalSource).toContain('deriveSeasonalProductivityRegionFromResolver')
  })

  it('fails closed when closed C-19.05 direct seed helper debt reappears', async () => {
    const { evaluateDurationArchitectureBoundaryGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-duration-closed-debt-'))
    const servicesRoot = join(fixtureRoot, 'server', 'src', 'services')
    mkdirSync(servicesRoot, { recursive: true })

    writeFileSync(join(servicesRoot, 'durationContextService.ts'), [
      "import { inferExecutionNature } from '../seeds/executionNature.js'",
      "import { v1474SeasonalProductivitySeed } from '../seeds/v1474SeasonalProductivitySeed.js'",
      'export function legacyContext() {',
      '  return { executionNature: inferExecutionNature({}), seasonal: v1474SeasonalProductivitySeed.length }',
      '}',
    ].join('\n'))

    const result = evaluateDurationArchitectureBoundaryGuard(fixtureRoot)

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'forbidden_seed_import',
        fileName: 'durationContextService.ts',
        importPath: '../seeds/executionNature.js',
      }),
      expect.objectContaining({
        type: 'forbidden_seed_import',
        fileName: 'durationContextService.ts',
        importPath: '../seeds/v1474SeasonalProductivitySeed.js',
      }),
    ]))
    expect(result.legacyDebt).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'closed_c1905_direct_seed_helper_debt',
        fileName: 'durationContextService.ts',
        importPath: '../seeds/executionNature.js',
      }),
    ]))
  })
})
