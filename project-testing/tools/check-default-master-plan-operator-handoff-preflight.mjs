#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateRealProductionOutcomeFile } from './default-master-plan-real-outcome-evidence.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_HANDOFF = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness', 'operator-handoff.json')
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness', 'operator-handoff-preflight.json')
const DEFAULT_SOURCE_EXPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness', 'source-exports')
const PLACEHOLDER_PATTERN = /<[^>\r\n]+>|\bTODO\b|\bTBD\b|\bplaceholder\b/i
const REQUIRED_RUNTIME_EVIDENCE_FLAGS = [
  ['--review-evidence', 'review_evidence'],
  ['--duration-calibration-evidence', 'duration_calibration_evidence'],
  ['--dependency-writer-evidence', 'dependency_writer_evidence'],
  ['--runtime-publication-evidence', 'runtime_publication_evidence'],
  ['--post-publish-smoke-rollback-evidence', 'post_publish_smoke_rollback_evidence'],
  ['--source-manifest', 'source_manifest'],
]
const REQUIRED_PRODUCTION_PIPELINE_SOURCE_FLAGS = [
  ['--review-export', 'review_export'],
  ['--duration-samples', 'duration_samples'],
  ['--writer-result', 'writer_result'],
  ['--task-dependencies', 'task_dependencies'],
  ['--runtime-publications', 'runtime_publications'],
  ['--api-read-smoke', 'api_read_smoke'],
  ['--ui-consumption-smoke', 'ui_consumption_smoke'],
  ['--critical-path-readback', 'critical_path_readback'],
  ['--rollback-verification', 'rollback_verification'],
  ['--source-manifest', 'source_manifest'],
]
const REQUIRED_SOURCE_EXPORT_RUNTIME_FLAGS = [
  ['--writer-result', 'writer_result'],
  ['--critical-path-readback', 'critical_path_readback'],
  ['--api-read-smoke', 'api_read_smoke'],
  ['--ui-consumption-smoke', 'ui_consumption_smoke'],
  ['--rollback-verification', 'rollback_verification'],
]

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    handoff: DEFAULT_HANDOFF,
    output: DEFAULT_OUTPUT,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }
    if (arg === '--handoff') {
      options.handoff = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

export async function checkDefaultMasterPlanOperatorHandoffPreflight({
  handoff = DEFAULT_HANDOFF,
  output = DEFAULT_OUTPUT,
  now = new Date(),
} = {}) {
  const handoffPath = path.resolve(handoff)
  const outputPath = path.resolve(output)
  const handoffPayload = JSON.parse(await readFile(handoffPath, 'utf8'))
  const actionSequence = Array.isArray(handoffPayload.actionSequence) ? handoffPayload.actionSequence : []
  const placeholderFindings = []
  for (const action of actionSequence) {
    const command = text(action.command)
    const matches = command.match(new RegExp(PLACEHOLDER_PATTERN.source, 'gi')) ?? []
    for (const match of matches) {
      placeholderFindings.push({
        actionId: text(action.id),
        gate: text(action.gate),
        placeholder: match,
        command,
      })
    }
  }
  const sourceExportPlaceholderFindings = placeholderFindings.filter(isSourceExportPlaceholderFinding)
  const reviewDurationSourceExportPlaceholderFindings = placeholderFindings.filter(isReviewDurationSourceExportPlaceholderFinding)
  const reviewPackagePlaceholderFindings = placeholderFindings.filter(isReviewPackagePlaceholderFinding)
  const candidateRefreshPackagePlaceholderFindings = placeholderFindings.filter(isCandidateRefreshPackagePlaceholderFinding)
  const candidateRefreshExecutionPreflightPlaceholderFindings = placeholderFindings.filter(isCandidateRefreshExecutionPreflightPlaceholderFinding)
  const candidateRefreshAuthorizationPackagePlaceholderFindings = placeholderFindings.filter(isCandidateRefreshAuthorizationPackagePlaceholderFinding)
  const candidateRefreshExecutionReadinessSealPlaceholderFindings = placeholderFindings.filter(isCandidateRefreshExecutionReadinessSealPlaceholderFinding)
  const candidateBaselineMaterializationPlaceholderFindings = placeholderFindings.filter(isCandidateBaselineMaterializationPlaceholderFinding)
  const candidateBaselineMaterializationReadinessSealPlaceholderFindings = placeholderFindings.filter(isCandidateBaselineMaterializationReadinessSealPlaceholderFinding)
  const candidateRefreshExecutionPlaceholderFindings = placeholderFindings.filter(isCandidateRefreshExecutionPlaceholderFinding)
  const pmReviewRecordPlaceholderFindings = placeholderFindings.filter(isPmReviewRecordPlaceholderFinding)
  const durationAssetUtilizationPlaceholderFindings = placeholderFindings.filter(isDurationAssetUtilizationPlaceholderFinding)
  const runtimeSeedEvidencePipelinePlaceholderFindings = placeholderFindings.filter(isRuntimeSeedEvidencePipelinePlaceholderFinding)
  const runtimeSeedImportReadinessSealPlaceholderFindings = placeholderFindings.filter(isRuntimeSeedImportReadinessSealPlaceholderFinding)
  const runtimeSeedImportExecutionPlaceholderFindings = placeholderFindings.filter(isRuntimeSeedImportExecutionPlaceholderFinding)
  const durationSampleCollectionPackagePlaceholderFindings = placeholderFindings.filter(isDurationSampleCollectionPackagePlaceholderFinding)
  const completedTaskExportPlaceholderFindings = placeholderFindings.filter(isCompletedTaskExportPlaceholderFinding)
  const runtimeCandidateAlignmentPreflightPlaceholderFindings = placeholderFindings.filter(isRuntimeCandidateAlignmentPreflightPlaceholderFinding)
  const runtimeTaskAlignmentRefreshPackagePlaceholderFindings = placeholderFindings.filter(isRuntimeTaskAlignmentRefreshPackagePlaceholderFinding)
  const runtimeTaskAlignmentReviewEvidencePlaceholderFindings = placeholderFindings.filter(isRuntimeTaskAlignmentReviewEvidencePlaceholderFinding)
  const realDurationSampleMaterialFromTaskExportPlaceholderFindings = placeholderFindings.filter(isRealDurationSampleMaterialFromTaskExportPlaceholderFinding)
  const realDurationSampleMaterialTemplatePlaceholderFindings = placeholderFindings.filter(isRealDurationSampleMaterialTemplatePlaceholderFinding)
  const realDurationSampleCollectionKitPreflightPlaceholderFindings = placeholderFindings.filter(isRealDurationSampleCollectionKitPreflightPlaceholderFinding)
  const realDurationSampleMaterialFromCollectionKitPreflightPlaceholderFindings = placeholderFindings.filter(isRealDurationSampleMaterialFromCollectionKitPreflightPlaceholderFinding)
  const realDurationSampleSourceExportPlaceholderFindings = placeholderFindings.filter(isRealDurationSampleSourceExportPlaceholderFinding)
  const realDurationSampleMaterialPreflightPlaceholderFindings = placeholderFindings.filter(isRealDurationSampleMaterialPreflightPlaceholderFinding)
  const durationSampleCoveragePlaceholderFindings = placeholderFindings.filter(isDurationSampleCoveragePlaceholderFinding)
  const runtimeMaterialPackagePlaceholderFindings = placeholderFindings.filter(isRuntimeMaterialPackagePlaceholderFinding)
  const realProductionOutcomePackagePlaceholderFindings = placeholderFindings.filter(isRealProductionOutcomePackagePlaceholderFinding)
  const reportedCurrentBlockers = arrayOfText(handoffPayload.currentBlockers)
  const ignoredLegacyPmReviewBlockers = reportedCurrentBlockers.filter(isLegacyRuntimePmReviewBlocker)
  const currentBlockers = reportedCurrentBlockers.filter((blocker) => !isLegacyRuntimePmReviewBlocker(blocker))
  const handoffRuntimeReady = handoffPayload.productionReady === true
    || (reportedCurrentBlockers.length > 0
      && currentBlockers.length === 0
      && ignoredLegacyPmReviewBlockers.length === reportedCurrentBlockers.length)
  const candidateRefreshActiveBlockers = currentBlockers.filter(isCandidateRefreshActiveBlocker)
  const pmReviewRecordDeferredBy = []
  const activePlaceholderFindings = placeholderFindings.filter((finding) => (
    !isOfflineDevelopmentQualityReviewPlaceholderFinding(finding)
  ))
  const completedTaskExport = summarizeCompletedTaskExportFromHandoff(handoffPayload.completedTaskExport)
  const identityMatches = handoffPayload.identityConsistency?.matches === true
  const mutationBoundary = handoffPayload.mutationBoundary && typeof handoffPayload.mutationBoundary === 'object'
    ? handoffPayload.mutationBoundary
    : {}
  const mutationBoundaryBlockers = [
    mutationBoundary.writesProductionTables === false ? null : 'handoff_no_write_boundary_missing',
    mutationBoundary.invokesRuntimeWriters === false ? null : 'handoff_runtime_writer_boundary_missing',
    mutationBoundary.writesTaskDependencies === false ? null : 'handoff_task_dependency_write_boundary_missing',
    mutationBoundary.writesRuntimePublication === false ? null : 'handoff_runtime_publication_boundary_missing',
  ].filter(Boolean)
  const handoffRuntimeMaterialPackage = handoffPayload.runtimeMaterialPackage && typeof handoffPayload.runtimeMaterialPackage === 'object'
    ? handoffPayload.runtimeMaterialPackage
    : {}
  const sourceExportAction = actionSequence.find((action) => text(action.id) === 'source_export_collect') ?? {}
  const sourceExportCommand = text(sourceExportAction.command)
  const sourceExportCommandIdentityBlockers = buildCommandIdentityBlockers(sourceExportCommand, {
    baselineId: text(handoffPayload.baselineId),
    projectId: text(handoffPayload.projectId),
    publicationKey: text(handoffPayload.publicationKey),
  }, 'source_export_command')
  const sourceExportCommandScriptBlockers = buildRequiredActionCommandBlockers(sourceExportCommand, {
    prefix: 'source_export',
    scriptName: 'export-default-master-plan-production-sources.mjs',
    npmScriptName: 'evidence:default-master-plan:export-sources',
  })
  const sourceExportCommandEnvironmentBlockers = buildCommandEnvironmentBlockers(
    sourceExportCommand,
    text(handoffPayload.environment),
    'source_export_command',
  )
  const sourceExportCommandOperatorBlockers = buildRequiredFlagBlockers(
    sourceExportCommand,
    [['--exported-by', 'exported_by']],
    'source_export_command',
  )
  const productionPipelineAction = actionSequence.find((action) => text(action.id) === 'production_evidence_pipeline') ?? {}
  const productionPipelineCommand = text(productionPipelineAction.command)
  const productionPipelineCommandScriptBlockers = buildRequiredActionCommandBlockers(productionPipelineCommand, {
    prefix: 'production_pipeline',
    scriptName: 'build-default-master-plan-production-evidence-pipeline.mjs',
  })
  const productionPipelineCommandIdentityBlockers = buildCommandIdentityBlockers(productionPipelineCommand, {
    baselineId: text(handoffPayload.baselineId),
    projectId: text(handoffPayload.projectId),
    publicationKey: text(handoffPayload.publicationKey),
  }, 'production_pipeline_command')
  const productionPipelineEnvironmentBlockers = buildCommandEnvironmentBlockers(productionPipelineCommand, text(handoffPayload.environment), 'production_pipeline_command')
  const productionPipelineSourceInputBlockers = buildRequiredFlagBlockers(
    productionPipelineCommand,
    REQUIRED_PRODUCTION_PIPELINE_SOURCE_FLAGS,
    'production_pipeline_command',
  )
  const productionPipelineSourceManifestBlockers = buildSourceExportManifestBindingBlockers(
    sourceExportCommand,
    productionPipelineCommand,
    'production_pipeline_command',
  )
  const evidenceBundleAction = actionSequence.find((action) => text(action.id) === 'evidence_bundle') ?? {}
  const evidenceBundleCommand = text(evidenceBundleAction.command)
  const evidenceBundleCommandBlockers = buildRequiredActionCommandBlockers(evidenceBundleCommand, {
    prefix: 'evidence_bundle',
    scriptName: 'build-default-master-plan-production-evidence-bundle.mjs',
  })
  const evidenceBundleArgumentBlockers = buildRequiredFlagBlockers(evidenceBundleCommand, REQUIRED_RUNTIME_EVIDENCE_FLAGS, 'evidence_bundle')
  const evidenceBundleSourceManifestBlockers = buildCommandSourceManifestBindingBlockers(
    productionPipelineCommand,
    evidenceBundleCommand,
    'evidence_bundle',
  )
  const readinessCheckAction = actionSequence.find((action) => text(action.id) === 'readiness_check') ?? {}
  const readinessCheckCommand = text(readinessCheckAction.command)
  const readinessCheckCommandBlockers = buildRequiredActionCommandBlockers(readinessCheckCommand, {
    prefix: 'readiness_check',
    scriptName: 'check-default-master-plan-production-readiness.mjs',
  })
  const readinessCheckArgumentBlockers = buildRequiredFlagBlockers(readinessCheckCommand, REQUIRED_RUNTIME_EVIDENCE_FLAGS, 'readiness_check')
  const readinessCheckSourceManifestBlockers = buildCommandSourceManifestBindingBlockers(
    productionPipelineCommand,
    readinessCheckCommand,
    'readiness_check',
  )
  const targetEnvironment = text(extractFlagValue(sourceExportCommand, '--environment') || handoffPayload.environment)
  const productionReadySourceExportEnvironment = isProductionReadyEnvironment(targetEnvironment)
  const realProductionOutcomePath = extractFlagValue(sourceExportCommand, '--real-production-outcome')
  const realProductionOutcomeMaterialBlockers = productionReadySourceExportEnvironment && realProductionOutcomePath && !PLACEHOLDER_PATTERN.test(realProductionOutcomePath)
    ? await validateRealProductionOutcomeFile(realProductionOutcomePath, {
      targetEnvironment,
      baselineId: text(handoffPayload.baselineId),
      projectId: text(handoffPayload.projectId),
      publicationKey: text(handoffPayload.publicationKey),
    })
    : []
  const realProductionOutcomeSourceExportBlockers = [
    productionReadySourceExportEnvironment
      && (!realProductionOutcomePath || PLACEHOLDER_PATTERN.test(realProductionOutcomePath))
      ? 'real_production_outcome_material_required'
      : null,
    ...realProductionOutcomeMaterialBlockers,
  ].filter(Boolean)
  const runtimeMaterialPackageStatus = text(handoffRuntimeMaterialPackage.status)
  const runtimeMaterialReportBlockers = arrayOfText(handoffRuntimeMaterialPackage.blockers)
  const runtimeMaterialPackageSourceExportBlockers = [
    runtimeMaterialPackageStatus && runtimeMaterialPackageStatus !== 'runtime_materials_resolved'
    ? 'runtime_material_package_not_resolved'
      : null,
    ...runtimeMaterialReportBlockers,
  ].filter(Boolean)
  const sourceExportRuntimeInputBlockers = productionReadySourceExportEnvironment
    ? buildRequiredFlagBlockers(sourceExportCommand, REQUIRED_SOURCE_EXPORT_RUNTIME_FLAGS, 'source_export_command')
    : []
  const sourceExportBlockers = [
    text(handoffPayload.baselineId) ? null : 'baseline_id_required',
    text(handoffPayload.projectId) ? null : 'project_id_required',
    identityMatches ? null : 'handoff_identity_mismatch',
    sourceExportPlaceholderFindings.length === 0 ? null : 'handoff_contains_source_export_placeholders',
    ...sourceExportCommandIdentityBlockers,
    ...sourceExportCommandScriptBlockers,
    ...sourceExportCommandEnvironmentBlockers,
    ...sourceExportCommandOperatorBlockers,
    ...runtimeMaterialPackageSourceExportBlockers,
    ...realProductionOutcomeSourceExportBlockers,
    ...sourceExportRuntimeInputBlockers,
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const sourceExportMode = productionReadySourceExportEnvironment
    ? 'production_or_live'
    : 'supporting_non_production'
  const productionSourceExportBlockers = [
    productionReadySourceExportEnvironment
      ? null
      : 'production_or_live_source_export_required_for_production_ready',
    ...sourceExportBlockers,
  ].filter(Boolean)
  const realProductionOutcomeEvidenceBlockers = [
    productionReadySourceExportEnvironment
      ? null
      : 'production_or_live_target_required_for_real_production_outcome_evidence',
    !realProductionOutcomePath || PLACEHOLDER_PATTERN.test(realProductionOutcomePath)
      ? 'real_production_outcome_material_required'
      : null,
    ...realProductionOutcomeMaterialBlockers,
  ].filter(Boolean)
  const reviewDurationSourceExportBlockers = [
    text(handoffPayload.baselineId) ? null : 'baseline_id_required',
    text(handoffPayload.projectId) ? null : 'project_id_required',
    identityMatches ? null : 'handoff_identity_mismatch',
    reviewDurationSourceExportPlaceholderFindings.length === 0 ? null : 'handoff_contains_review_duration_source_export_placeholders',
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const reviewPackageBlockers = [
    text(handoffPayload.baselineId) ? null : 'baseline_id_required',
    text(handoffPayload.projectId) ? null : 'project_id_required',
    identityMatches ? null : 'handoff_identity_mismatch',
    reviewPackagePlaceholderFindings.length === 0 ? null : 'handoff_contains_review_package_placeholders',
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const candidateRefreshPackageAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'candidate_refresh_package'
      || command.includes('evidence:default-master-plan:candidate-refresh-package')
      || command.includes('build-default-master-plan-candidate-refresh-package')
  }) ?? {}
  const candidateRefreshPackageCommand = text(candidateRefreshPackageAction.command)
  const candidateRefreshRequired = currentBlockers.includes('candidate_baseline_refresh_required_before_runtime_publication')
    || handoffPayload.candidateRefreshPackage?.refreshRequired === true
    || text(handoffPayload.candidateRefreshPackage?.status) === 'refresh_required'
  const candidateRefreshPackageBlockers = [
    candidateRefreshPackageCommand && !text(handoffPayload.baselineId) ? 'baseline_id_required' : null,
    candidateRefreshPackageCommand && !text(handoffPayload.projectId) ? 'project_id_required' : null,
    candidateRefreshPackageCommand && !identityMatches ? 'handoff_identity_mismatch' : null,
    candidateRefreshPackageCommand && candidateRefreshPackagePlaceholderFindings.length > 0 ? 'handoff_contains_candidate_refresh_package_placeholders' : null,
    ...(candidateRefreshPackageCommand
      ? [
          ...buildRequiredActionCommandBlockers(candidateRefreshPackageCommand, {
            prefix: 'candidate_refresh_package',
            scriptName: 'build-default-master-plan-candidate-refresh-package.mjs',
            npmScriptName: 'evidence:default-master-plan:candidate-refresh-package',
          }),
          ...buildRequiredFlagBlockers(
            candidateRefreshPackageCommand,
            [
              ['--profile-report', 'profile_report'],
              ['--hygiene', 'hygiene'],
              ['--output', 'output'],
            ],
            'candidate_refresh_package',
          ),
        ]
      : candidateRefreshRequired ? ['candidate_refresh_package_command_required'] : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const candidateRefreshExecutionPreflightAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'candidate_refresh_execution_preflight'
      || command.includes('evidence:default-master-plan:candidate-refresh-preflight')
      || command.includes('check-default-master-plan-candidate-refresh-execution-preflight')
  }) ?? {}
  const candidateRefreshExecutionPreflightCommand = text(candidateRefreshExecutionPreflightAction.command)
  const candidateRefreshExecutionPreflightBlockers = [
    candidateRefreshExecutionPreflightCommand && candidateRefreshExecutionPreflightPlaceholderFindings.length > 0
      ? 'handoff_contains_candidate_refresh_execution_preflight_placeholders'
      : null,
    ...(candidateRefreshExecutionPreflightCommand
      ? [
          ...buildRequiredActionCommandBlockers(candidateRefreshExecutionPreflightCommand, {
            prefix: 'candidate_refresh_execution_preflight',
            scriptName: 'check-default-master-plan-candidate-refresh-execution-preflight.mjs',
            npmScriptName: 'evidence:default-master-plan:candidate-refresh-preflight',
          }),
          ...buildRequiredFlagBlockers(
            candidateRefreshExecutionPreflightCommand,
            [
              ['--refresh-package', 'refresh_package'],
              ['--output', 'output'],
              ['--environment', 'environment'],
            ],
            'candidate_refresh_execution_preflight',
          ),
        ]
      : candidateRefreshRequired ? ['candidate_refresh_execution_preflight_command_required'] : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const candidateRefreshAuthorizationPackageAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'candidate_refresh_authorization_package'
      || command.includes('build-default-master-plan-candidate-refresh-authorization-package')
  }) ?? {}
  const candidateRefreshAuthorizationPackageCommand = text(candidateRefreshAuthorizationPackageAction.command)
  const candidateRefreshAuthorizationPackageBlockers = [
    candidateRefreshAuthorizationPackageCommand && candidateRefreshAuthorizationPackagePlaceholderFindings.length > 0
      ? 'handoff_contains_candidate_refresh_authorization_package_placeholders'
      : null,
    ...(candidateRefreshAuthorizationPackageCommand
      ? [
          ...buildRequiredActionCommandBlockers(candidateRefreshAuthorizationPackageCommand, {
            prefix: 'candidate_refresh_authorization_package',
            scriptName: 'build-default-master-plan-candidate-refresh-authorization-package.mjs',
          }),
          ...buildRequiredFlagBlockers(
            candidateRefreshAuthorizationPackageCommand,
            [
              ['--handoff', 'handoff'],
              ['--preflight', 'preflight'],
              ['--execution', 'execution'],
              ['--output', 'output'],
              ['--template-output', 'template_output'],
            ],
            'candidate_refresh_authorization_package',
          ),
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const candidateRefreshExecutionReadinessSealAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'candidate_refresh_execution_readiness_seal'
      || command.includes('check-default-master-plan-candidate-refresh-execution-readiness')
  }) ?? {}
  const candidateRefreshExecutionReadinessSealCommand = text(candidateRefreshExecutionReadinessSealAction.command)
  const candidateRefreshExecutionReadinessSealBlockers = [
    candidateRefreshExecutionReadinessSealCommand && candidateRefreshExecutionReadinessSealPlaceholderFindings.length > 0
      ? 'handoff_contains_candidate_refresh_execution_readiness_seal_placeholders'
      : null,
    ...(candidateRefreshExecutionReadinessSealCommand
      ? [
          ...buildRequiredActionCommandBlockers(candidateRefreshExecutionReadinessSealCommand, {
            prefix: 'candidate_refresh_execution_readiness_seal',
            scriptName: 'check-default-master-plan-candidate-refresh-execution-readiness.mjs',
          }),
          ...buildRequiredFlagBlockers(
            candidateRefreshExecutionReadinessSealCommand,
            [
              ['--authorization-package', 'authorization_package'],
              ['--preflight', 'preflight'],
              ['--output', 'output'],
            ],
            'candidate_refresh_execution_readiness_seal',
          ),
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const candidateBaselineMaterializationAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'candidate_baseline_materialization'
      || command.includes('evidence:default-master-plan:candidate-baseline-materialization')
      || command.includes('run-default-master-plan-candidate-baseline-materialization')
  }) ?? {}
  const candidateBaselineMaterializationCommand = text(candidateBaselineMaterializationAction.command)
  const candidateBaselineMaterializationCurrentBlockers = currentBlockers.filter(isCandidateBaselineMaterializationBlocker)
  const candidateBaselineMaterializationBlockers = [
    candidateBaselineMaterializationCommand && candidateBaselineMaterializationPlaceholderFindings.length > 0
      ? 'handoff_contains_candidate_baseline_materialization_placeholders'
      : null,
    ...(candidateBaselineMaterializationCommand
      ? [
          ...buildRequiredActionCommandBlockers(candidateBaselineMaterializationCommand, {
            prefix: 'candidate_baseline_materialization',
            scriptName: 'run-default-master-plan-candidate-baseline-materialization.mjs',
            npmScriptName: 'evidence:default-master-plan:candidate-baseline-materialization',
          }),
          ...buildRequiredFlagBlockers(
            candidateBaselineMaterializationCommand,
            [
              ['--refresh-package', 'refresh_package'],
              ['--output', 'output'],
              ['--environment', 'environment'],
            ],
            'candidate_baseline_materialization',
          ),
        ]
      : candidateBaselineMaterializationCurrentBlockers.length > 0 ? ['candidate_baseline_materialization_command_required'] : []),
    ...candidateBaselineMaterializationCurrentBlockers,
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const candidateBaselineMaterializationReadinessSealAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'candidate_baseline_materialization_readiness_seal'
      || command.includes('check-default-master-plan-candidate-baseline-materialization-readiness')
  }) ?? {}
  const candidateBaselineMaterializationReadinessSealCommand = text(candidateBaselineMaterializationReadinessSealAction.command)
  const candidateBaselineMaterializationReadinessSealBlockers = [
    candidateBaselineMaterializationReadinessSealCommand && candidateBaselineMaterializationReadinessSealPlaceholderFindings.length > 0
      ? 'handoff_contains_candidate_baseline_materialization_readiness_seal_placeholders'
      : null,
    ...(candidateBaselineMaterializationReadinessSealCommand
      ? [
          ...buildRequiredActionCommandBlockers(candidateBaselineMaterializationReadinessSealCommand, {
            prefix: 'candidate_baseline_materialization_readiness_seal',
            scriptName: 'check-default-master-plan-candidate-baseline-materialization-readiness.mjs',
          }),
          ...buildRequiredFlagBlockers(
            candidateBaselineMaterializationReadinessSealCommand,
            [
              ['--refresh-package', 'refresh_package'],
              ['--materialization', 'materialization'],
              ['--output', 'output'],
            ],
            'candidate_baseline_materialization_readiness_seal',
          ),
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const candidateRefreshExecutionAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'candidate_refresh_execution'
      || command.includes('evidence:default-master-plan:candidate-refresh-execution')
      || command.includes('run-default-master-plan-candidate-refresh-execution')
  }) ?? {}
  const candidateRefreshExecutionCommand = text(candidateRefreshExecutionAction.command)
  const candidateRefreshExecutionCurrentBlockers = currentBlockers.filter(isCandidateRefreshExecutionBlocker)
  const candidateRefreshExecutionBlockers = [
    candidateRefreshExecutionCommand && candidateRefreshExecutionPlaceholderFindings.length > 0
      ? 'handoff_contains_candidate_refresh_execution_placeholders'
      : null,
    ...(candidateRefreshExecutionCommand
      ? [
          ...buildRequiredActionCommandBlockers(candidateRefreshExecutionCommand, {
            prefix: 'candidate_refresh_execution',
            scriptName: 'run-default-master-plan-candidate-refresh-execution.mjs',
            npmScriptName: 'evidence:default-master-plan:candidate-refresh-execution',
          }),
          ...buildRequiredFlagBlockers(
            candidateRefreshExecutionCommand,
            [
              ['--refresh-package', 'refresh_package'],
              ['--preflight', 'preflight'],
              ['--authorization-package', 'authorization_package'],
              ['--output', 'output'],
              ['--environment', 'environment'],
            ],
            'candidate_refresh_execution',
          ),
        ]
      : candidateRefreshExecutionCurrentBlockers.length > 0 ? ['candidate_refresh_execution_command_required'] : []),
    ...candidateRefreshExecutionCurrentBlockers,
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const durationAssetUtilizationAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'duration_asset_utilization'
      || command.includes('evidence:default-master-plan:duration-asset-utilization')
      || command.includes('build-default-master-plan-duration-asset-utilization-report')
  }) ?? {}
  const durationAssetUtilizationCommand = text(durationAssetUtilizationAction.command)
  const durationAssetUtilizationBlockers = [
    durationAssetUtilizationCommand && !text(handoffPayload.baselineId) ? 'baseline_id_required' : null,
    durationAssetUtilizationCommand && !text(handoffPayload.projectId) ? 'project_id_required' : null,
    durationAssetUtilizationCommand && !identityMatches ? 'handoff_identity_mismatch' : null,
    durationAssetUtilizationCommand && durationAssetUtilizationPlaceholderFindings.length > 0 ? 'handoff_contains_duration_asset_utilization_placeholders' : null,
    ...(durationAssetUtilizationCommand
      ? [
          ...buildRequiredActionCommandBlockers(durationAssetUtilizationCommand, {
            prefix: 'duration_asset_utilization',
            scriptName: 'build-default-master-plan-duration-asset-utilization-report.mjs',
            npmScriptName: 'evidence:default-master-plan:duration-asset-utilization',
          }),
          ...buildRequiredFlagBlockers(
            durationAssetUtilizationCommand,
            [
              ['--candidate-refresh-package', 'candidate_refresh_package'],
              ['--output', 'output'],
            ],
            'duration_asset_utilization',
          ),
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const runtimeSeedEvidencePipelineAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'runtime_seed_evidence_pipeline'
      || command.includes('evidence:default-master-plan:runtime-seed-pipeline')
      || command.includes('run-default-master-plan-runtime-seed-evidence-pipeline')
  }) ?? {}
  const runtimeSeedEvidencePipelineCommand = text(runtimeSeedEvidencePipelineAction.command)
  const runtimeSeedEvidencePipelineRequired = runtimeSeedEvidencePipelineCommand
    || handoffPayload.runtimeSeedEvidencePipeline
    || currentBlockers.some((blocker) => blocker.startsWith('runtime_seed_pipeline_'))
    || currentBlockers.includes('runtime_seed_and_reference_days_evidence')
  const runtimeSeedEvidencePipelineBlockers = [
    runtimeSeedEvidencePipelineCommand && runtimeSeedEvidencePipelinePlaceholderFindings.length > 0
      ? 'handoff_contains_runtime_seed_evidence_pipeline_placeholders'
      : null,
    ...(runtimeSeedEvidencePipelineCommand
      ? [
          ...buildRequiredActionCommandBlockers(runtimeSeedEvidencePipelineCommand, {
            prefix: 'runtime_seed_evidence_pipeline',
            scriptName: 'run-default-master-plan-runtime-seed-evidence-pipeline.mjs',
            npmScriptName: 'evidence:default-master-plan:runtime-seed-pipeline',
          }),
          ...buildRequiredFlagBlockers(
            runtimeSeedEvidencePipelineCommand,
            [['--output', 'output']],
            'runtime_seed_evidence_pipeline',
          ),
        ]
      : runtimeSeedEvidencePipelineRequired ? ['runtime_seed_evidence_pipeline_command_required'] : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const runtimeSeedRepairPlan = normalizeRuntimeSeedRepairPlan(
    handoffPayload.runtimeSeedEvidencePipeline?.environment?.repairPlan
    ?? runtimeSeedEvidencePipelineAction.repairPlan,
  )
  const runtimeSeedImportReadinessSealAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'runtime_seed_import_readiness_seal'
      || command.includes('check-default-master-plan-runtime-seed-import-readiness')
  }) ?? {}
  const runtimeSeedImportReadinessSealCommand = text(runtimeSeedImportReadinessSealAction.command)
  const runtimeSeedImportReadinessSealRequired = runtimeSeedImportReadinessSealCommand
    || handoffPayload.runtimeSeedImportReadinessSeal
    || currentBlockers.some((blocker) => blocker.startsWith('runtime_seed_import_execution_'))
  const runtimeSeedImportReadinessSealBlockers = [
    runtimeSeedImportReadinessSealCommand && runtimeSeedImportReadinessSealPlaceholderFindings.length > 0
      ? 'handoff_contains_runtime_seed_import_readiness_seal_placeholders'
      : null,
    ...(runtimeSeedImportReadinessSealCommand
      ? [
          ...buildRequiredActionCommandBlockers(runtimeSeedImportReadinessSealCommand, {
            prefix: 'runtime_seed_import_readiness_seal',
            scriptName: 'check-default-master-plan-runtime-seed-import-readiness.mjs',
          }),
          ...buildRequiredFlagBlockers(
            runtimeSeedImportReadinessSealCommand,
            [
              ['--import-gate', 'import_gate'],
              ['--execution', 'execution'],
              ['--output', 'output'],
            ],
            'runtime_seed_import_readiness_seal',
          ),
        ]
      : runtimeSeedImportReadinessSealRequired ? ['runtime_seed_import_readiness_seal_command_required'] : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const runtimeSeedImportExecutionAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'runtime_seed_import_execution'
      || command.includes('evidence:default-master-plan:runtime-seed-import-execution')
      || command.includes('run-default-master-plan-runtime-seed-import-execution')
  }) ?? {}
  const runtimeSeedImportExecutionCommand = text(runtimeSeedImportExecutionAction.command)
  const runtimeSeedImportExecutionRequired = runtimeSeedImportExecutionCommand
    || handoffPayload.runtimeSeedImportExecution
    || currentBlockers.some((blocker) => blocker.startsWith('runtime_seed_import_execution_'))
  const runtimeSeedImportExecutionBlockers = [
    runtimeSeedImportExecutionCommand && runtimeSeedImportExecutionPlaceholderFindings.length > 0
      ? 'handoff_contains_runtime_seed_import_execution_placeholders'
      : null,
    ...(runtimeSeedImportExecutionCommand
      ? [
          ...buildRequiredActionCommandBlockers(runtimeSeedImportExecutionCommand, {
            prefix: 'runtime_seed_import_execution',
            scriptName: 'run-default-master-plan-runtime-seed-import-execution.mjs',
            npmScriptName: 'evidence:default-master-plan:runtime-seed-import-execution',
          }),
          ...buildRequiredFlagBlockers(
            runtimeSeedImportExecutionCommand,
            [['--output', 'output']],
            'runtime_seed_import_execution',
          ),
        ]
      : runtimeSeedImportExecutionRequired ? ['runtime_seed_import_execution_command_required'] : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const runtimeSeedImportWriteExecutionBlockers = buildRuntimeSeedImportWriteExecutionBlockers({
    handoffRuntimeSeedImportExecution: handoffPayload.runtimeSeedImportExecution,
    currentBlockers,
    required: Boolean(runtimeSeedImportExecutionRequired),
  })
  const readinessCheckRuntimeSeedEvidencePipelineBlockers = buildRuntimeSeedEvidencePipelineReadinessBlockers({
    readinessCheckCommand,
    runtimeSeedEvidencePipelineCommand,
    handoffRuntimeSeedEvidencePipeline: handoffPayload.runtimeSeedEvidencePipeline,
    required: Boolean(runtimeSeedEvidencePipelineRequired),
  })
  const reviewPackageAction = actionSequence.find((action) => text(action.id) === 'pm_review_package') ?? {}
  const reviewPackageCommand = text(reviewPackageAction.command)
  const expectedReviewPackagePath = text(extractFlagValue(reviewPackageCommand, '--output'))
    || 'project-testing/reports/default-master-plan-production-readiness/pm-review-package.json'
  const pmReviewRecordAction = actionSequence.find((action) => text(action.id) === 'pm_review_record') ?? {}
  const pmReviewRecordCommand = text(pmReviewRecordAction.command)
  const pmReviewRecordReviewPackagePath = text(extractFlagValue(pmReviewRecordCommand, '--review-package'))
  const pmReviewRecordReviewPackageBindingBlockers = pmReviewRecordCommand && pmReviewRecordReviewPackagePath
    ? [
        PLACEHOLDER_PATTERN.test(pmReviewRecordReviewPackagePath) ? 'pm_review_record_review_package_placeholder' : null,
        expectedReviewPackagePath && !PLACEHOLDER_PATTERN.test(pmReviewRecordReviewPackagePath) && !sameCommandPath(pmReviewRecordReviewPackagePath, expectedReviewPackagePath)
          ? 'pm_review_record_review_package_mismatch'
          : null,
      ].filter(Boolean)
    : []
  const rawPmReviewRecordBlockers = [
    ...buildRequiredActionCommandBlockers(pmReviewRecordCommand, {
      prefix: 'pm_review_record',
      scriptName: 'record-default-master-plan-review-export.mjs',
      npmScriptName: 'evidence:default-master-plan:record-review',
    }),
    pmReviewRecordPlaceholderFindings.length === 0 ? null : 'pm_review_record_command_contains_placeholders',
    ...buildCommandIdentityBlockers(pmReviewRecordCommand, {
      baselineId: text(handoffPayload.baselineId),
      projectId: text(handoffPayload.projectId),
    }, 'pm_review_record'),
    ...buildCommandEnvironmentBlockers(pmReviewRecordCommand, text(handoffPayload.environment), 'pm_review_record'),
    ...buildRequiredFlagBlockers(
      pmReviewRecordCommand,
      [
        ['--reviewed-by', 'reviewed_by'],
        ['--review-notes', 'review_notes'],
        ['--review-package', 'review_package'],
        ['--exported-by', 'exported_by'],
      ],
      'pm_review_record',
    ),
    ...buildReviewRecordModeBlockers(pmReviewRecordCommand),
    ...pmReviewRecordReviewPackageBindingBlockers,
  ].filter(Boolean)
  const pmReviewRecordBlockers = pmReviewRecordDeferredBy.length > 0 ? [] : rawPmReviewRecordBlockers
  const durationSampleCollectionPackageAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'duration_sample_collection_package'
      || command.includes('evidence:default-master-plan:duration-sample-package')
      || command.includes('build-default-master-plan-duration-sample-collection-package')
  }) ?? {}
  const durationSampleCollectionPackageCommand = text(durationSampleCollectionPackageAction.command)
  const durationSampleCollectionPackageBlockers = [
    text(handoffPayload.baselineId) ? null : 'baseline_id_required',
    text(handoffPayload.projectId) ? null : 'project_id_required',
    identityMatches ? null : 'handoff_identity_mismatch',
    durationSampleCollectionPackagePlaceholderFindings.length === 0 ? null : 'handoff_contains_duration_sample_collection_package_placeholders',
    ...(durationSampleCollectionPackageCommand
      ? [
          ...buildRequiredActionCommandBlockers(durationSampleCollectionPackageCommand, {
            prefix: 'duration_sample_collection_package',
            scriptName: 'build-default-master-plan-duration-sample-collection-package.mjs',
            npmScriptName: 'evidence:default-master-plan:duration-sample-package',
          }),
          ...buildRequiredFlagBlockers(
            durationSampleCollectionPackageCommand,
            [
              ['--duration-gap-plan', 'duration_gap_plan'],
              ['--profile-report', 'profile_report'],
              ['--duration-asset-utilization-report', 'duration_asset_utilization_report'],
              ['--baseline-id', 'baseline_id'],
              ['--project-id', 'project_id'],
              ['--output', 'output'],
              ['--environment', 'environment'],
              ['--exported-by', 'exported_by'],
            ],
            'duration_sample_collection_package',
          ),
          ...buildCommandIdentityBlockers(
            durationSampleCollectionPackageCommand,
            {
              baselineId: text(handoffPayload.baselineId),
              projectId: text(handoffPayload.projectId),
            },
            'duration_sample_collection_package',
          ),
          ...buildDurationSampleCollectionScopeBlockers(durationSampleCollectionPackageCommand),
          ...buildCommandEnvironmentBlockers(
            durationSampleCollectionPackageCommand,
            text(handoffPayload.environment),
            'duration_sample_collection_package',
          ),
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const durationSampleCoverageAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'duration_sample_coverage'
      || command.includes('evidence:default-master-plan:duration-sample-coverage')
      || command.includes('verify-default-master-plan-duration-sample-coverage')
  }) ?? {}
  const durationSampleCoverageCommand = text(durationSampleCoverageAction.command)
  const durationSampleCoverageBlockers = [
    text(handoffPayload.baselineId) ? null : 'baseline_id_required',
    text(handoffPayload.projectId) ? null : 'project_id_required',
    identityMatches ? null : 'handoff_identity_mismatch',
    durationSampleCoveragePlaceholderFindings.length === 0 ? null : 'handoff_contains_duration_sample_coverage_placeholders',
    ...buildRequiredActionCommandBlockers(durationSampleCoverageCommand, {
      prefix: 'duration_sample_coverage',
      scriptName: 'verify-default-master-plan-duration-sample-coverage.mjs',
      npmScriptName: 'evidence:default-master-plan:duration-sample-coverage',
    }),
    ...buildRequiredFlagBlockers(
      durationSampleCoverageCommand,
      [
        ['--collection-package', 'collection_package'],
        ['--samples', 'samples'],
        ['--output', 'output'],
      ],
      'duration_sample_coverage',
    ),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const realDurationSampleMaterialTemplateAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'real_duration_sample_material_template'
      || command.includes('evidence:default-master-plan:real-duration-sample-template')
      || command.includes('build-default-master-plan-real-duration-sample-material-template')
  }) ?? {}
  const realDurationSampleMaterialTemplateCommand = text(realDurationSampleMaterialTemplateAction.command)
  const realDurationSampleCollectionKit = await summarizeRealDurationSampleCollectionKitFromCommand(
    realDurationSampleMaterialTemplateCommand,
    {
      baselineId: text(handoffPayload.baselineId),
      projectId: text(handoffPayload.projectId),
    },
  )
  const realDurationSampleMaterialTemplateBlockers = [
    realDurationSampleMaterialTemplateCommand && !text(handoffPayload.baselineId) ? 'baseline_id_required' : null,
    realDurationSampleMaterialTemplateCommand && !text(handoffPayload.projectId) ? 'project_id_required' : null,
    realDurationSampleMaterialTemplateCommand && !identityMatches ? 'handoff_identity_mismatch' : null,
    realDurationSampleMaterialTemplateCommand && realDurationSampleMaterialTemplatePlaceholderFindings.length > 0 ? 'handoff_contains_real_duration_sample_material_template_placeholders' : null,
    ...arrayOfText(realDurationSampleCollectionKit.blockers),
    ...(realDurationSampleMaterialTemplateCommand
      ? [
          ...buildRequiredActionCommandBlockers(realDurationSampleMaterialTemplateCommand, {
            prefix: 'real_duration_sample_material_template',
            scriptName: 'build-default-master-plan-real-duration-sample-material-template.mjs',
            npmScriptName: 'evidence:default-master-plan:real-duration-sample-template',
          }),
          ...buildRequiredFlagBlockers(
            realDurationSampleMaterialTemplateCommand,
            [
              ['--collection-package', 'collection_package'],
              ['--output', 'output'],
              ['--prepared-by', 'prepared_by'],
            ],
            'real_duration_sample_material_template',
          ),
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const realDurationSampleCollectionKitPreflightAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'real_duration_sample_collection_kit_preflight'
      || command.includes('check-default-master-plan-real-duration-sample-collection-kit-preflight')
  }) ?? {}
  const realDurationSampleCollectionKitPreflightCommand = text(realDurationSampleCollectionKitPreflightAction.command)
  const realDurationSampleCollectionKitPreflightInputBlockers = realDurationSampleCollectionKitPreflightCommand
    ? await buildRealDurationSampleCollectionKitPreflightInputBlockers(realDurationSampleCollectionKitPreflightCommand)
    : []
  const realDurationSampleCollectionKitPreflightBlockers = [
    realDurationSampleCollectionKitPreflightCommand && !text(handoffPayload.baselineId) ? 'baseline_id_required' : null,
    realDurationSampleCollectionKitPreflightCommand && !text(handoffPayload.projectId) ? 'project_id_required' : null,
    realDurationSampleCollectionKitPreflightCommand && !identityMatches ? 'handoff_identity_mismatch' : null,
    realDurationSampleCollectionKitPreflightCommand && realDurationSampleCollectionKitPreflightPlaceholderFindings.length > 0 ? 'handoff_contains_real_duration_sample_collection_kit_preflight_placeholders' : null,
    ...(realDurationSampleCollectionKitPreflightCommand
      ? [
          ...buildRequiredActionCommandBlockers(realDurationSampleCollectionKitPreflightCommand, {
            prefix: 'real_duration_sample_collection_kit_preflight',
            scriptName: 'check-default-master-plan-real-duration-sample-collection-kit-preflight.mjs',
          }),
          ...buildRequiredFlagBlockers(
            realDurationSampleCollectionKitPreflightCommand,
            [
              ['--collection-kit', 'collection_kit'],
              ['--output', 'output'],
              ['--checked-by', 'checked_by'],
            ],
            'real_duration_sample_collection_kit_preflight',
          ),
          ...realDurationSampleCollectionKitPreflightInputBlockers,
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const realDurationSampleMaterialFromCollectionKitPreflightAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'real_duration_sample_material_from_collection_kit_preflight'
      || command.includes('build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight')
  }) ?? {}
  const realDurationSampleMaterialFromCollectionKitPreflightCommand = text(realDurationSampleMaterialFromCollectionKitPreflightAction.command)
  const realDurationSampleMaterialFromCollectionKitPreflightInputBlockers = realDurationSampleMaterialFromCollectionKitPreflightCommand
    ? await buildRealDurationSampleMaterialFromCollectionKitPreflightInputBlockers(realDurationSampleMaterialFromCollectionKitPreflightCommand)
    : []
  const realDurationSampleMaterialFromCollectionKitPreflightBlockers = [
    realDurationSampleMaterialFromCollectionKitPreflightCommand && !text(handoffPayload.baselineId) ? 'baseline_id_required' : null,
    realDurationSampleMaterialFromCollectionKitPreflightCommand && !text(handoffPayload.projectId) ? 'project_id_required' : null,
    realDurationSampleMaterialFromCollectionKitPreflightCommand && !identityMatches ? 'handoff_identity_mismatch' : null,
    realDurationSampleMaterialFromCollectionKitPreflightCommand && realDurationSampleMaterialFromCollectionKitPreflightPlaceholderFindings.length > 0 ? 'handoff_contains_real_duration_sample_material_from_collection_kit_preflight_placeholders' : null,
    ...(realDurationSampleMaterialFromCollectionKitPreflightCommand
      ? [
          ...buildRequiredActionCommandBlockers(realDurationSampleMaterialFromCollectionKitPreflightCommand, {
            prefix: 'real_duration_sample_material_from_collection_kit_preflight',
            scriptName: 'build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight.mjs',
          }),
          ...buildRequiredFlagBlockers(
            realDurationSampleMaterialFromCollectionKitPreflightCommand,
            [
              ['--collection-package', 'collection_package'],
              ['--collection-kit-preflight', 'collection_kit_preflight'],
              ['--output', 'output'],
              ['--prepared-by', 'prepared_by'],
            ],
            'real_duration_sample_material_from_collection_kit_preflight',
          ),
          ...realDurationSampleMaterialFromCollectionKitPreflightInputBlockers,
          realDurationSampleCollectionKitPreflightBlockers.length > 0 ? 'real_duration_sample_material_from_collection_kit_preflight_collection_kit_preflight_not_ready' : null,
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const completedTaskExportAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'completed_task_export'
      || command.includes('evidence:default-master-plan:completed-task-export')
      || command.includes('build-default-master-plan-completed-task-export')
  }) ?? {}
  const completedTaskExportCommand = text(completedTaskExportAction.command)
  const completedTaskExportInputBlockers = completedTaskExportCommand
    ? await buildCompletedTaskExportInputBlockers(completedTaskExportCommand)
    : []
  const completedTaskExportBlockers = [
    completedTaskExportCommand && !text(handoffPayload.baselineId) ? 'baseline_id_required' : null,
    completedTaskExportCommand && !text(handoffPayload.projectId) ? 'project_id_required' : null,
    completedTaskExportCommand && !identityMatches ? 'handoff_identity_mismatch' : null,
    completedTaskExportCommand && completedTaskExportPlaceholderFindings.length > 0 ? 'handoff_contains_completed_task_export_placeholders' : null,
    ...(completedTaskExportCommand
      ? [
          ...buildRequiredActionCommandBlockers(completedTaskExportCommand, {
            prefix: 'completed_task_export',
            scriptName: 'build-default-master-plan-completed-task-export.mjs',
            npmScriptName: 'evidence:default-master-plan:completed-task-export',
          }),
          ...buildRequiredFlagBlockers(
            completedTaskExportCommand,
            [
              ['--collection-package', 'collection_package'],
              ['--raw-tasks', 'raw_tasks'],
              ['--output', 'output'],
              ['--source-name', 'source_name'],
              ['--evidence-ref', 'evidence_ref'],
              ['--operator-review-ref', 'operator_review_ref'],
              ['--exported-by', 'exported_by'],
            ],
            'completed_task_export',
          ),
          ...completedTaskExportInputBlockers,
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const runtimeCandidateAlignmentPreflightAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'runtime_candidate_alignment_preflight'
      || command.includes('evidence:default-master-plan:runtime-candidate-alignment')
      || command.includes('build-default-master-plan-runtime-candidate-alignment-preflight')
  }) ?? {}
  const runtimeCandidateAlignmentPreflightCommand = text(runtimeCandidateAlignmentPreflightAction.command)
  const runtimeCandidateAlignmentPreflightInputBlockers = runtimeCandidateAlignmentPreflightCommand
    ? await buildRuntimeCandidateAlignmentPreflightInputBlockers(runtimeCandidateAlignmentPreflightCommand)
    : []
  const runtimeCandidateAlignmentPreflightBlockers = [
    runtimeCandidateAlignmentPreflightCommand && !text(handoffPayload.baselineId) ? 'baseline_id_required' : null,
    runtimeCandidateAlignmentPreflightCommand && !text(handoffPayload.projectId) ? 'project_id_required' : null,
    runtimeCandidateAlignmentPreflightCommand && !identityMatches ? 'handoff_identity_mismatch' : null,
    runtimeCandidateAlignmentPreflightCommand && runtimeCandidateAlignmentPreflightPlaceholderFindings.length > 0 ? 'handoff_contains_runtime_candidate_alignment_preflight_placeholders' : null,
    ...(runtimeCandidateAlignmentPreflightCommand
      ? [
          ...buildRequiredActionCommandBlockers(runtimeCandidateAlignmentPreflightCommand, {
            prefix: 'runtime_candidate_alignment_preflight',
            scriptName: 'build-default-master-plan-runtime-candidate-alignment-preflight.mjs',
            npmScriptName: 'evidence:default-master-plan:runtime-candidate-alignment',
          }),
          ...buildRequiredFlagBlockers(
            runtimeCandidateAlignmentPreflightCommand,
            [
              ['--candidate-baseline', 'candidate_baseline'],
              ['--raw-tasks', 'raw_tasks'],
              ['--output', 'output'],
            ],
            'runtime_candidate_alignment_preflight',
          ),
          ...runtimeCandidateAlignmentPreflightInputBlockers,
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const runtimeTaskAlignmentRefreshPackageAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'runtime_task_alignment_refresh_package'
      || command.includes('evidence:default-master-plan:runtime-task-alignment-refresh-package')
      || command.includes('build-default-master-plan-runtime-task-alignment-refresh-package')
  }) ?? {}
  const runtimeTaskAlignmentRefreshPackageCommand = text(runtimeTaskAlignmentRefreshPackageAction.command)
  const runtimeTaskAlignmentRefreshPackageInputBlockers = runtimeTaskAlignmentRefreshPackageCommand
    ? await buildRuntimeTaskAlignmentRefreshPackageInputBlockers(runtimeTaskAlignmentRefreshPackageCommand)
    : []
  const runtimeTaskAlignmentRefreshPackageBlockers = [
    runtimeTaskAlignmentRefreshPackageCommand && !text(handoffPayload.baselineId) ? 'baseline_id_required' : null,
    runtimeTaskAlignmentRefreshPackageCommand && !text(handoffPayload.projectId) ? 'project_id_required' : null,
    runtimeTaskAlignmentRefreshPackageCommand && !identityMatches ? 'handoff_identity_mismatch' : null,
    runtimeTaskAlignmentRefreshPackageCommand && runtimeTaskAlignmentRefreshPackagePlaceholderFindings.length > 0 ? 'handoff_contains_runtime_task_alignment_refresh_package_placeholders' : null,
    ...(runtimeTaskAlignmentRefreshPackageCommand
      ? [
          ...buildRequiredActionCommandBlockers(runtimeTaskAlignmentRefreshPackageCommand, {
            prefix: 'runtime_task_alignment_refresh_package',
            scriptName: 'build-default-master-plan-runtime-task-alignment-refresh-package.mjs',
            npmScriptName: 'evidence:default-master-plan:runtime-task-alignment-refresh-package',
          }),
          ...buildRequiredFlagBlockers(
            runtimeTaskAlignmentRefreshPackageCommand,
            [
              ['--runtime-candidate-alignment-preflight', 'runtime_candidate_alignment_preflight'],
              ['--output', 'output'],
              ['--prepared-by', 'prepared_by'],
            ],
            'runtime_task_alignment_refresh_package',
          ),
          ...runtimeTaskAlignmentRefreshPackageInputBlockers,
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const runtimeTaskAlignmentReviewEvidenceAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'runtime_task_alignment_review_evidence'
      || command.includes('evidence:default-master-plan:runtime-task-alignment-review-evidence')
      || command.includes('build-default-master-plan-runtime-task-alignment-review-evidence')
  }) ?? {}
  const runtimeTaskAlignmentReviewEvidenceCommand = text(runtimeTaskAlignmentReviewEvidenceAction.command)
  const runtimeTaskAlignmentReviewEvidenceInputBlockers = runtimeTaskAlignmentReviewEvidenceCommand
    ? await buildRuntimeTaskAlignmentReviewEvidenceInputBlockers(runtimeTaskAlignmentReviewEvidenceCommand)
    : []
  const runtimeTaskAlignmentReviewEvidenceBlockers = [
    runtimeTaskAlignmentReviewEvidenceCommand && !text(handoffPayload.baselineId) ? 'baseline_id_required' : null,
    runtimeTaskAlignmentReviewEvidenceCommand && !text(handoffPayload.projectId) ? 'project_id_required' : null,
    runtimeTaskAlignmentReviewEvidenceCommand && !identityMatches ? 'handoff_identity_mismatch' : null,
    runtimeTaskAlignmentReviewEvidenceCommand && runtimeTaskAlignmentReviewEvidencePlaceholderFindings.length > 0 ? 'handoff_contains_runtime_task_alignment_review_evidence_placeholders' : null,
    ...(runtimeTaskAlignmentReviewEvidenceCommand
      ? [
          ...buildRequiredActionCommandBlockers(runtimeTaskAlignmentReviewEvidenceCommand, {
            prefix: 'runtime_task_alignment_review_evidence',
            scriptName: 'build-default-master-plan-runtime-task-alignment-review-evidence.mjs',
            npmScriptName: 'evidence:default-master-plan:runtime-task-alignment-review-evidence',
          }),
          ...buildRequiredFlagBlockers(
            runtimeTaskAlignmentReviewEvidenceCommand,
            [
              ['--runtime-task-alignment-refresh-package', 'runtime_task_alignment_refresh_package'],
              ['--review-decisions', 'review_decisions'],
              ['--output', 'output'],
              ['--reviewed-by', 'reviewed_by'],
              ['--review-notes', 'review_notes'],
            ],
            'runtime_task_alignment_review_evidence',
          ),
          ...runtimeTaskAlignmentReviewEvidenceInputBlockers,
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const realDurationSampleMaterialFromTaskExportAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'real_duration_sample_material_from_task_export'
      || command.includes('evidence:default-master-plan:real-duration-sample-from-task-export')
      || command.includes('build-default-master-plan-real-duration-sample-material-from-task-export')
  }) ?? {}
  const realDurationSampleMaterialFromTaskExportCommand = text(realDurationSampleMaterialFromTaskExportAction.command)
  const realDurationSampleMaterialFromTaskExportInputBlockers = realDurationSampleMaterialFromTaskExportCommand
    ? await buildRealDurationSampleMaterialFromTaskExportInputBlockers(realDurationSampleMaterialFromTaskExportCommand)
    : []
  const realDurationSampleMaterialFromTaskExportDependencyBlockers = buildRealDurationSampleMaterialFromTaskExportDependencyBlockers(currentBlockers)
  const realDurationSampleMaterialFromTaskExportBlockers = [
    realDurationSampleMaterialFromTaskExportCommand && !text(handoffPayload.baselineId) ? 'baseline_id_required' : null,
    realDurationSampleMaterialFromTaskExportCommand && !text(handoffPayload.projectId) ? 'project_id_required' : null,
    realDurationSampleMaterialFromTaskExportCommand && !identityMatches ? 'handoff_identity_mismatch' : null,
    realDurationSampleMaterialFromTaskExportCommand && realDurationSampleMaterialFromTaskExportPlaceholderFindings.length > 0 ? 'handoff_contains_real_duration_sample_material_from_task_export_placeholders' : null,
    ...(realDurationSampleMaterialFromTaskExportCommand
      ? [
          ...buildRequiredActionCommandBlockers(realDurationSampleMaterialFromTaskExportCommand, {
            prefix: 'real_duration_sample_material_from_task_export',
            scriptName: 'build-default-master-plan-real-duration-sample-material-from-task-export.mjs',
            npmScriptName: 'evidence:default-master-plan:real-duration-sample-from-task-export',
          }),
          ...buildRequiredFlagBlockers(
            realDurationSampleMaterialFromTaskExportCommand,
            [
              ['--collection-package', 'collection_package'],
              ['--completed-task-export', 'completed_task_export'],
              ['--output', 'output'],
              ['--source-name', 'source_name'],
              ['--evidence-ref', 'evidence_ref'],
              ['--operator-review-ref', 'operator_review_ref'],
              ['--prepared-by', 'prepared_by'],
            ],
            'real_duration_sample_material_from_task_export',
          ),
          ...realDurationSampleMaterialFromTaskExportInputBlockers,
          runtimeTaskAlignmentReviewEvidenceBlockers.length > 0
            ? 'real_duration_sample_material_from_task_export_runtime_task_alignment_review_not_ready'
            : null,
          ...realDurationSampleMaterialFromTaskExportDependencyBlockers,
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const realDurationSampleMaterialPreflightAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'real_duration_sample_material_preflight'
      || command.includes('evidence:default-master-plan:real-duration-sample-preflight')
      || command.includes('check-default-master-plan-real-duration-sample-material-preflight')
  }) ?? {}
  const realDurationSampleMaterialPreflightCommand = text(realDurationSampleMaterialPreflightAction.command)
  const realDurationSampleMaterialPreflightInputBlockers = realDurationSampleMaterialPreflightCommand
    ? await buildRealDurationSampleMaterialPreflightInputBlockers(realDurationSampleMaterialPreflightCommand)
    : []
  const realDurationSampleMaterialPreflightBlockers = [
    realDurationSampleMaterialPreflightCommand && !text(handoffPayload.baselineId) ? 'baseline_id_required' : null,
    realDurationSampleMaterialPreflightCommand && !text(handoffPayload.projectId) ? 'project_id_required' : null,
    realDurationSampleMaterialPreflightCommand && !identityMatches ? 'handoff_identity_mismatch' : null,
    realDurationSampleMaterialPreflightCommand && realDurationSampleMaterialPreflightPlaceholderFindings.length > 0 ? 'handoff_contains_real_duration_sample_material_preflight_placeholders' : null,
    ...(realDurationSampleMaterialPreflightCommand
      ? [
          ...buildRequiredActionCommandBlockers(realDurationSampleMaterialPreflightCommand, {
            prefix: 'real_duration_sample_material_preflight',
            scriptName: 'check-default-master-plan-real-duration-sample-material-preflight.mjs',
            npmScriptName: 'evidence:default-master-plan:real-duration-sample-preflight',
          }),
          ...buildRequiredFlagBlockers(
            realDurationSampleMaterialPreflightCommand,
            [
              ['--collection-package', 'collection_package'],
              ['--sample-material', 'sample_material'],
              ['--output', 'output'],
              ['--checked-by', 'checked_by'],
            ],
            'real_duration_sample_material_preflight',
          ),
          ...realDurationSampleMaterialPreflightInputBlockers,
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const realDurationSampleSourceExportAction = actionSequence.find((action) => {
    const command = text(action.command)
    return text(action.id) === 'real_duration_sample_source_export'
      || command.includes('evidence:default-master-plan:real-duration-sample-export')
      || command.includes('build-default-master-plan-real-duration-sample-source-export')
  }) ?? {}
  const realDurationSampleSourceExportCommand = text(realDurationSampleSourceExportAction.command)
  const realDurationSampleSourceExportMaterialPreflightBlockers = realDurationSampleSourceExportCommand
    ? await buildRealDurationSampleSourceExportMaterialPreflightBlockers(realDurationSampleSourceExportCommand)
    : []
  const realDurationSampleSourceExportBlockers = [
    realDurationSampleSourceExportCommand && !text(handoffPayload.baselineId) ? 'baseline_id_required' : null,
    realDurationSampleSourceExportCommand && !text(handoffPayload.projectId) ? 'project_id_required' : null,
    realDurationSampleSourceExportCommand && !identityMatches ? 'handoff_identity_mismatch' : null,
    realDurationSampleSourceExportCommand && realDurationSampleSourceExportPlaceholderFindings.length > 0 ? 'handoff_contains_real_duration_sample_source_export_placeholders' : null,
    ...(realDurationSampleSourceExportCommand
      ? [
          ...buildRequiredActionCommandBlockers(realDurationSampleSourceExportCommand, {
            prefix: 'real_duration_sample_source_export',
            scriptName: 'build-default-master-plan-real-duration-sample-source-export.mjs',
            npmScriptName: 'evidence:default-master-plan:real-duration-sample-export',
          }),
          ...buildRequiredFlagBlockers(
            realDurationSampleSourceExportCommand,
            [
              ['--collection-package', 'collection_package'],
              ['--sample-material', 'sample_material'],
              ['--output', 'output'],
              ['--environment', 'environment'],
              ['--exported-by', 'exported_by'],
              ['--material-preflight', 'material_preflight'],
            ],
            'real_duration_sample_source_export',
          ),
          ...buildCommandEnvironmentBlockers(
            realDurationSampleSourceExportCommand,
            text(handoffPayload.environment),
            'real_duration_sample_source_export',
          ),
          ...realDurationSampleSourceExportMaterialPreflightBlockers,
        ]
      : []),
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const runtimeMaterialPackageBlockers = [
    text(handoffPayload.baselineId) ? null : 'baseline_id_required',
    text(handoffPayload.projectId) ? null : 'project_id_required',
    identityMatches ? null : 'handoff_identity_mismatch',
    runtimeMaterialPackagePlaceholderFindings.length === 0 ? null : 'handoff_contains_runtime_material_package_placeholders',
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const realProductionOutcomePackageBlockers = [
    text(handoffPayload.baselineId) ? null : 'baseline_id_required',
    text(handoffPayload.projectId) ? null : 'project_id_required',
    text(handoffPayload.publicationKey) ? null : 'publication_key_required',
    identityMatches ? null : 'handoff_identity_mismatch',
    realProductionOutcomePackagePlaceholderFindings.length === 0 ? null : 'handoff_contains_real_production_outcome_package_placeholders',
    ...mutationBoundaryBlockers,
  ].filter(Boolean)
  const productionEvidencePipelineBlockers = [
    activePlaceholderFindings.length === 0 ? null : 'handoff_contains_placeholders',
    currentBlockers.length === 0 ? null : 'handoff_current_blockers_not_empty',
    handoffRuntimeReady ? null : 'handoff_not_production_ready',
    ...productionSourceExportBlockers,
    ...productionPipelineCommandScriptBlockers,
    ...productionPipelineCommandIdentityBlockers,
    ...productionPipelineEnvironmentBlockers,
    ...productionPipelineSourceInputBlockers,
    ...productionPipelineSourceManifestBlockers,
    productionReadySourceExportEnvironment && !text(extractFlagValue(productionPipelineCommand, '--real-production-outcome'))
      ? 'production_pipeline_command_real_production_outcome_missing'
      : null,
    ...evidenceBundleCommandBlockers,
    ...evidenceBundleArgumentBlockers,
    ...evidenceBundleSourceManifestBlockers,
    ...readinessCheckCommandBlockers,
    ...readinessCheckArgumentBlockers,
    ...readinessCheckSourceManifestBlockers,
    ...readinessCheckRuntimeSeedEvidencePipelineBlockers,
  ].filter(Boolean)
  const blockers = [...new Set([
    ...candidateRefreshPackageBlockers,
    ...candidateRefreshExecutionPreflightBlockers,
    ...candidateRefreshAuthorizationPackageBlockers,
    ...candidateRefreshExecutionReadinessSealBlockers,
    ...candidateBaselineMaterializationBlockers,
    ...candidateBaselineMaterializationReadinessSealBlockers,
    ...candidateRefreshExecutionBlockers,
    ...durationAssetUtilizationBlockers,
    ...runtimeSeedEvidencePipelineBlockers,
    ...runtimeSeedImportReadinessSealBlockers,
    ...runtimeSeedImportExecutionBlockers,
    ...durationSampleCollectionPackageBlockers,
    ...completedTaskExportBlockers,
    ...runtimeTaskAlignmentReviewEvidenceBlockers,
    ...realDurationSampleMaterialFromTaskExportBlockers,
    ...realDurationSampleMaterialTemplateBlockers,
    ...realDurationSampleCollectionKitPreflightBlockers,
    ...realDurationSampleMaterialPreflightBlockers,
    ...realDurationSampleSourceExportBlockers,
    ...durationSampleCoverageBlockers,
    ...runtimeMaterialPackageBlockers,
    ...realProductionOutcomePackageBlockers,
    ...realProductionOutcomeEvidenceBlockers,
    ...reviewDurationSourceExportBlockers,
    ...sourceExportBlockers,
    ...productionEvidencePipelineBlockers,
  ])]
  const mayBuildCandidateRefreshPackage = candidateRefreshPackageBlockers.length === 0
  const mayRunCandidateRefreshExecutionPreflight = candidateRefreshExecutionPreflightCommand
    ? candidateRefreshExecutionPreflightBlockers.length === 0
    : false
  const mayBuildCandidateRefreshAuthorizationPackage = candidateRefreshAuthorizationPackageCommand
    ? candidateRefreshAuthorizationPackageBlockers.length === 0
    : false
  const mayBuildRealDurationSampleMaterialFromCollectionKitPreflight = realDurationSampleMaterialFromCollectionKitPreflightCommand
    ? realDurationSampleMaterialFromCollectionKitPreflightBlockers.length === 0
    : false
  const mayCheckCandidateRefreshExecutionReadinessSeal = candidateRefreshExecutionReadinessSealCommand
    ? candidateRefreshExecutionReadinessSealBlockers.length === 0
    : false
  const mayRunCandidateBaselineMaterialization = candidateBaselineMaterializationCommand
    ? candidateBaselineMaterializationBlockers.length === 0
    : false
  const mayCheckCandidateBaselineMaterializationReadinessSeal = candidateBaselineMaterializationReadinessSealCommand
    ? candidateBaselineMaterializationReadinessSealBlockers.length === 0
    : false
  const mayRunCandidateRefreshExecution = candidateRefreshExecutionCommand
    ? candidateRefreshExecutionBlockers.length === 0
    : false
  const mayBuildDurationAssetUtilizationReport = durationAssetUtilizationBlockers.length === 0
  const mayRunRuntimeSeedEvidencePipeline = runtimeSeedEvidencePipelineCommand
    ? runtimeSeedEvidencePipelineBlockers.length === 0
    : false
  const mayCheckRuntimeSeedImportReadinessSeal = runtimeSeedImportReadinessSealCommand
    ? runtimeSeedImportReadinessSealBlockers.length === 0
    : false
  const mayRunRuntimeSeedImportExecution = runtimeSeedImportExecutionCommand
    ? runtimeSeedImportExecutionBlockers.length === 0
    : false
  const mayExecuteRuntimeSeedImportWrite = runtimeSeedImportExecutionCommand
    ? runtimeSeedImportWriteExecutionBlockers.length === 0
    : false
  const mayBuildReviewPackage = reviewPackageBlockers.length === 0
  const mayBuildDurationSampleCollectionPackage = durationSampleCollectionPackageBlockers.length === 0
  const mayBuildCompletedTaskExport = completedTaskExportCommand
    ? completedTaskExportBlockers.length === 0
    : false
  const mayRunRuntimeCandidateAlignmentPreflight = runtimeCandidateAlignmentPreflightCommand
    ? runtimeCandidateAlignmentPreflightBlockers.length === 0
    : false
  const mayBuildRuntimeTaskAlignmentRefreshPackage = runtimeTaskAlignmentRefreshPackageCommand
    ? runtimeTaskAlignmentRefreshPackageBlockers.length === 0
    : false
  const mayBuildRuntimeTaskAlignmentReviewEvidence = runtimeTaskAlignmentReviewEvidenceCommand
    ? runtimeTaskAlignmentReviewEvidenceBlockers.length === 0
    : false
  const mayBuildRealDurationSampleMaterialFromTaskExport = realDurationSampleMaterialFromTaskExportCommand
    ? realDurationSampleMaterialFromTaskExportBlockers.length === 0
    : false
  const mayBuildRealDurationSampleMaterialTemplate = realDurationSampleMaterialTemplateCommand
    ? realDurationSampleMaterialTemplateBlockers.length === 0
    : false
  const mayCheckRealDurationSampleCollectionKit = realDurationSampleCollectionKitPreflightCommand
    ? realDurationSampleCollectionKitPreflightBlockers.length === 0
    : false
  const mayBuildRealDurationSampleSourceExport = realDurationSampleSourceExportCommand
    ? realDurationSampleSourceExportBlockers.length === 0
    : false
  const mayCheckRealDurationSampleMaterial = realDurationSampleMaterialPreflightCommand
    ? realDurationSampleMaterialPreflightBlockers.length === 0
    : false
  const mayVerifyDurationSampleCoverage = durationSampleCoverageBlockers.length === 0
  const mayBuildRuntimeMaterialPackage = runtimeMaterialPackageBlockers.length === 0
  const mayBuildRealProductionOutcomePackage = realProductionOutcomePackageBlockers.length === 0
  const mayAcceptRealProductionOutcomeEvidence = realProductionOutcomeEvidenceBlockers.length === 0
  const mayRunReviewDurationSourceExport = reviewDurationSourceExportBlockers.length === 0
  const mayRunSupportingSourceExport = sourceExportBlockers.length === 0
  const mayRunProductionSourceExport = productionSourceExportBlockers.length === 0
  const mayRunSourceExport = mayRunProductionSourceExport
  const mayRunProductionEvidencePipeline = blockers.length === 0
  const actionReadiness = buildActionReadiness(actionSequence, [
    ['candidate_refresh_package', mayBuildCandidateRefreshPackage, candidateRefreshPackageBlockers],
    ['candidate_refresh_execution_preflight', mayRunCandidateRefreshExecutionPreflight, candidateRefreshExecutionPreflightBlockers],
    ['candidate_refresh_authorization_package', mayBuildCandidateRefreshAuthorizationPackage, candidateRefreshAuthorizationPackageBlockers],
    ['candidate_refresh_execution_readiness_seal', mayCheckCandidateRefreshExecutionReadinessSeal, candidateRefreshExecutionReadinessSealBlockers],
    ['candidate_baseline_materialization', mayRunCandidateBaselineMaterialization, candidateBaselineMaterializationBlockers],
    ['candidate_baseline_materialization_readiness_seal', mayCheckCandidateBaselineMaterializationReadinessSeal, candidateBaselineMaterializationReadinessSealBlockers],
    ['candidate_refresh_execution', mayRunCandidateRefreshExecution, candidateRefreshExecutionBlockers],
    ['duration_asset_utilization', mayBuildDurationAssetUtilizationReport, durationAssetUtilizationBlockers],
    ['runtime_seed_evidence_pipeline', mayRunRuntimeSeedEvidencePipeline, runtimeSeedEvidencePipelineBlockers],
    ['runtime_seed_import_readiness_seal', mayCheckRuntimeSeedImportReadinessSeal, runtimeSeedImportReadinessSealBlockers],
    ['runtime_seed_import_execution', mayRunRuntimeSeedImportExecution, runtimeSeedImportExecutionBlockers],
    ['duration_sample_collection_package', mayBuildDurationSampleCollectionPackage, durationSampleCollectionPackageBlockers],
    ['completed_task_export', mayBuildCompletedTaskExport, completedTaskExportBlockers],
    ['runtime_candidate_alignment_preflight', mayRunRuntimeCandidateAlignmentPreflight, runtimeCandidateAlignmentPreflightBlockers],
    ['runtime_task_alignment_refresh_package', mayBuildRuntimeTaskAlignmentRefreshPackage, runtimeTaskAlignmentRefreshPackageBlockers],
    ['runtime_task_alignment_review_evidence', mayBuildRuntimeTaskAlignmentReviewEvidence, runtimeTaskAlignmentReviewEvidenceBlockers],
    ['real_duration_sample_material_from_task_export', mayBuildRealDurationSampleMaterialFromTaskExport, realDurationSampleMaterialFromTaskExportBlockers],
    ['real_duration_sample_material_template', mayBuildRealDurationSampleMaterialTemplate, realDurationSampleMaterialTemplateBlockers],
    ['real_duration_sample_collection_kit_preflight', mayCheckRealDurationSampleCollectionKit, realDurationSampleCollectionKitPreflightBlockers],
    ['real_duration_sample_material_preflight', mayCheckRealDurationSampleMaterial, realDurationSampleMaterialPreflightBlockers],
    ['real_duration_sample_material_from_collection_kit_preflight', mayBuildRealDurationSampleMaterialFromCollectionKitPreflight, realDurationSampleMaterialFromCollectionKitPreflightBlockers],
    ['real_duration_sample_source_export', mayBuildRealDurationSampleSourceExport, realDurationSampleSourceExportBlockers],
    ['duration_sample_coverage', mayVerifyDurationSampleCoverage, durationSampleCoverageBlockers],
    ['runtime_material_package', mayBuildRuntimeMaterialPackage, runtimeMaterialPackageBlockers],
    ['real_production_outcome_package', mayBuildRealProductionOutcomePackage, realProductionOutcomePackageBlockers],
    ['duration_source_export_collect', mayRunReviewDurationSourceExport, reviewDurationSourceExportBlockers],
    ['review_duration_source_export_collect', mayRunReviewDurationSourceExport, reviewDurationSourceExportBlockers],
    ['source_export_collect', mayRunSupportingSourceExport, sourceExportBlockers],
    ['production_evidence_pipeline', productionEvidencePipelineBlockers.length === 0, productionEvidencePipelineBlockers],
    [
      'evidence_bundle',
      [
        ...evidenceBundleCommandBlockers,
        ...evidenceBundleArgumentBlockers,
        ...evidenceBundleSourceManifestBlockers,
      ].length === 0,
      [
        ...evidenceBundleCommandBlockers,
        ...evidenceBundleArgumentBlockers,
        ...evidenceBundleSourceManifestBlockers,
      ],
    ],
    [
      'readiness_check',
      [
        ...readinessCheckCommandBlockers,
        ...readinessCheckArgumentBlockers,
        ...readinessCheckSourceManifestBlockers,
        ...readinessCheckRuntimeSeedEvidencePipelineBlockers,
      ].length === 0,
      [
        ...readinessCheckCommandBlockers,
        ...readinessCheckArgumentBlockers,
        ...readinessCheckSourceManifestBlockers,
        ...readinessCheckRuntimeSeedEvidencePipelineBlockers,
      ],
    ],
  ])
  const writeExecutionReadiness = buildActionReadiness(actionSequence, [
    ['runtime_seed_import_execution', mayExecuteRuntimeSeedImportWrite, runtimeSeedImportWriteExecutionBlockers],
  ])
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-operator-handoff-preflight/v1',
    generatedAt: now.toISOString(),
    source: 'check-default-master-plan-operator-handoff-preflight',
    status: blockers.length === 0 ? 'pass' : 'blocked',
    baselineId: text(handoffPayload.baselineId),
    projectId: text(handoffPayload.projectId),
    publicationKey: text(handoffPayload.publicationKey),
    targetEnvironment,
    handoffRuntimeReady,
    handoffRef: `operator_handoff:${repoRelative(handoffPath)}`,
    mayBuildCandidateRefreshPackage,
    mayRunCandidateRefreshExecutionPreflight,
    mayBuildCandidateRefreshAuthorizationPackage,
    mayCheckCandidateRefreshExecutionReadinessSeal,
    mayRunCandidateBaselineMaterialization,
    mayCheckCandidateBaselineMaterializationReadinessSeal,
    mayRunCandidateRefreshExecution,
    mayBuildDurationAssetUtilizationReport,
    mayRunRuntimeSeedEvidencePipeline,
    mayCheckRuntimeSeedImportReadinessSeal,
    mayRunRuntimeSeedImportExecution,
    mayExecuteRuntimeSeedImportWrite,
    mayBuildReviewPackage,
    mayBuildDurationSampleCollectionPackage,
    mayBuildCompletedTaskExport,
    mayRunRuntimeCandidateAlignmentPreflight,
    mayBuildRuntimeTaskAlignmentRefreshPackage,
    mayBuildRuntimeTaskAlignmentReviewEvidence,
    mayBuildRealDurationSampleMaterialFromTaskExport,
    mayCheckRealDurationSampleMaterial,
    mayCheckRealDurationSampleCollectionKit,
    mayBuildRealDurationSampleMaterialFromCollectionKitPreflight,
    mayBuildRealDurationSampleMaterialTemplate,
    mayBuildRealDurationSampleSourceExport,
    mayVerifyDurationSampleCoverage,
    mayBuildRuntimeMaterialPackage,
    mayBuildRealProductionOutcomePackage,
    mayAcceptRealProductionOutcomeEvidence,
    mayRunReviewDurationSourceExport,
    sourceExportMode,
    mayRunSupportingSourceExport,
    mayRunProductionSourceExport,
    mayRunSourceExport,
    mayRunProductionEvidencePipeline,
    offlineDevelopmentQualityReview: {
      status: reviewPackageCommand || pmReviewRecordCommand ? 'legacy_artifacts_detected' : 'not_provided',
      requiredForRuntime: false,
      intendedUse: 'offline_development_quality_review_and_template_calibration',
      reviewPackageFindings: reviewPackageBlockers,
      reviewRecordFindings: pmReviewRecordBlockers,
    },
    actionReadiness,
    runnableActionIds: actionReadiness.runnableActionIds,
    blockedActionIds: actionReadiness.blockedActionIds,
    deferredActionIds: actionReadiness.deferredActionIds,
    blockedActionDetails: actionReadiness.blockedActionDetails,
    writeExecutionReadiness,
    writeExecutionRunnableActionIds: writeExecutionReadiness.runnableActionIds,
    writeExecutionBlockedActionIds: writeExecutionReadiness.blockedActionIds,
    writeExecutionDeferredActionIds: writeExecutionReadiness.deferredActionIds,
    writeExecutionBlockedActionDetails: writeExecutionReadiness.blockedActionDetails,
    blockers,
    candidateRefreshPackageBlockers,
    candidateRefreshExecutionPreflightBlockers,
    candidateRefreshAuthorizationPackageBlockers,
    candidateRefreshExecutionReadinessSealBlockers,
    candidateBaselineMaterializationBlockers,
    candidateBaselineMaterializationReadinessSealBlockers,
    candidateRefreshExecutionBlockers,
    durationAssetUtilizationBlockers,
    runtimeSeedEvidencePipelineBlockers,
    runtimeSeedImportReadinessSealBlockers,
    runtimeSeedImportExecutionBlockers,
    runtimeSeedRepairPlan,
    runtimeSeedImportWriteExecutionBlockers,
    realDurationSampleMaterialPreflightBlockers,
    reviewPackageBlockers,
    pmReviewRecordBlockers,
    rawPmReviewRecordBlockers,
    pmReviewRecordDeferredBy,
    durationSampleCollectionPackageBlockers,
    completedTaskExportBlockers,
    runtimeCandidateAlignmentPreflightBlockers,
    runtimeTaskAlignmentRefreshPackageBlockers,
    runtimeTaskAlignmentReviewEvidenceBlockers,
    realDurationSampleMaterialFromTaskExportBlockers,
    realDurationSampleMaterialTemplateBlockers,
    realDurationSampleCollectionKitPreflightBlockers,
    realDurationSampleMaterialFromCollectionKitPreflightBlockers,
    realDurationSampleSourceExportBlockers,
    durationSampleCoverageBlockers,
    runtimeMaterialPackageBlockers,
    realProductionOutcomePackageBlockers,
    realProductionOutcomeEvidenceBlockers,
    reviewDurationSourceExportBlockers,
    sourceExportBlockers,
    productionSourceExportBlockers,
    productionEvidencePipelineBlockers,
    realDurationSampleCollectionKit,
    completedTaskExport,
    currentBlockers,
    ignoredLegacyPmReviewBlockers,
    placeholderFindings,
    activePlaceholderFindings,
    activePlaceholderFindingCount: activePlaceholderFindings.length,
    deferredPlaceholderFindingCount: placeholderFindings.length - activePlaceholderFindings.length,
    candidateRefreshPackagePlaceholderFindings,
    candidateRefreshExecutionPreflightPlaceholderFindings,
    candidateRefreshAuthorizationPackagePlaceholderFindings,
    candidateRefreshExecutionReadinessSealPlaceholderFindings,
    candidateBaselineMaterializationPlaceholderFindings,
    candidateBaselineMaterializationReadinessSealPlaceholderFindings,
    candidateRefreshExecutionPlaceholderFindings,
    durationAssetUtilizationPlaceholderFindings,
    runtimeSeedEvidencePipelinePlaceholderFindings,
    runtimeSeedImportReadinessSealPlaceholderFindings,
    runtimeSeedImportExecutionPlaceholderFindings,
    reviewPackagePlaceholderFindings,
    realDurationSampleMaterialPreflightPlaceholderFindings,
    pmReviewRecordPlaceholderFindings,
    durationSampleCollectionPackagePlaceholderFindings,
    completedTaskExportPlaceholderFindings,
    runtimeCandidateAlignmentPreflightPlaceholderFindings,
    runtimeTaskAlignmentRefreshPackagePlaceholderFindings,
    runtimeTaskAlignmentReviewEvidencePlaceholderFindings,
    realDurationSampleMaterialFromTaskExportPlaceholderFindings,
    realDurationSampleMaterialTemplatePlaceholderFindings,
    realDurationSampleCollectionKitPreflightPlaceholderFindings,
    realDurationSampleSourceExportPlaceholderFindings,
    durationSampleCoveragePlaceholderFindings,
    runtimeMaterialPackagePlaceholderFindings,
    realProductionOutcomePackagePlaceholderFindings,
    reviewDurationSourceExportPlaceholderFindings,
    sourceExportPlaceholderFindings,
    actionCount: actionReadiness.actions.length,
    identityConsistency: handoffPayload.identityConsistency ?? null,
    mutationBoundary: {
      readsOperatorHandoff: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function summarizeCompletedTaskExportFromHandoff(value) {
  const payload = readRecord(value)
  const invalidTaskExamples = Array.isArray(payload.invalidTaskExamples)
    ? payload.invalidTaskExamples.slice(0, 5).map((task) => ({
        id: text(task.id),
        stableCode: text(task.stableCode ?? task.stable_code),
        title: text(task.title),
        expectedTitle: text(task.expectedTitle ?? task.expected_title),
        matchingRequestedStableCodeByTitle: text(task.matchingRequestedStableCodeByTitle ?? task.matching_requested_stable_code_by_title),
        recommendedAction: text(task.recommendedAction ?? task.recommended_action),
        blockers: arrayOfText(task.blockers),
      }))
    : []
  return {
    status: text(payload.status) || 'not_generated',
    requiredStableCodeCount: readNumber(payload.requiredStableCodeCount ?? payload.required_stable_code_count),
    rawTaskCount: readNumber(payload.rawTaskCount ?? payload.raw_task_count),
    exportedTaskCount: readNumber(payload.exportedTaskCount ?? payload.exported_task_count),
    invalidTaskCount: readNumber(payload.invalidTaskCount ?? payload.invalid_task_count),
    titleMismatchCount: readNumber(payload.titleMismatchCount ?? payload.title_mismatch_count),
    titleMatchedDifferentStableCodeCount: readNumber(payload.titleMatchedDifferentStableCodeCount ?? payload.title_matched_different_stable_code_count),
    missingStableCodeCount: readNumber(payload.missingStableCodeCount ?? payload.missing_stable_code_count),
    missingStableCodes: arrayOfText(payload.missingStableCodes ?? payload.missing_stable_codes),
    invalidTaskExamples,
    recommendedNextAction: firstText(
      payload.recommendedNextAction,
      payload.recommended_next_action,
      ...invalidTaskExamples.map((task) => task.recommendedAction),
    ),
    blockers: arrayOfText(payload.blockers),
    artifact: text(payload.artifact),
  }
}

async function summarizeRealDurationSampleCollectionKitFromCommand(command, expectedIdentity = {}) {
  const collectionKitOutput = text(extractFlagValue(command, '--collection-kit-output'))
  if (!text(command)) {
    return emptyRealDurationSampleCollectionKitSummary('not_generated')
  }
  if (!collectionKitOutput) {
    return emptyRealDurationSampleCollectionKitSummary('not_configured')
  }
  const payload = await readJsonIfPresent(collectionKitOutput)
  if (!payload) {
    return {
      ...emptyRealDurationSampleCollectionKitSummary('missing'),
      artifact: repoRelative(resolveCommandPath(collectionKitOutput)),
      blockers: ['real_duration_sample_collection_kit_missing'],
    }
  }
  const summary = readRecord(payload.summary)
  const mutationBoundary = readRecord(payload.mutationBoundary)
  const groups = Array.isArray(payload.businessTypeGroups)
    ? payload.businessTypeGroups
    : Array.isArray(payload.business_type_groups)
      ? payload.business_type_groups
      : []
  const targetCount = readNumber(summary.targetCount ?? summary.target_count)
  const businessTypeGroupCount = readNumber(summary.businessTypeGroupCount ?? summary.business_type_group_count) || groups.length
  const productionReady = payload.productionReady === true || payload.production_ready === true
  const noWriteBoundary = text(payload.noWriteBoundary ?? payload.no_write_boundary)
  const baselineId = text(payload.baselineId ?? payload.baseline_id)
  const projectId = text(payload.projectId ?? payload.project_id)
  const blockers = [
    productionReady ? 'real_duration_sample_collection_kit_must_not_be_production_ready' : null,
    noWriteBoundary === 'operator_collection_kit_only_no_db_write'
      ? null
      : 'real_duration_sample_collection_kit_no_write_boundary_missing',
    mutationBoundary.writesProductionTables === false
      ? null
      : 'real_duration_sample_collection_kit_production_write_boundary_missing',
    mutationBoundary.writesTasks === false
      ? null
      : 'real_duration_sample_collection_kit_task_write_boundary_missing',
    mutationBoundary.writesTaskDependencies === false
      ? null
      : 'real_duration_sample_collection_kit_task_dependency_write_boundary_missing',
    mutationBoundary.writesDurationSamples === false
      ? null
      : 'real_duration_sample_collection_kit_duration_sample_write_boundary_missing',
    mutationBoundary.writesRuntimePublication === false
      ? null
      : 'real_duration_sample_collection_kit_runtime_publication_boundary_missing',
    mutationBoundary.invokesRuntimeWriters === false
      ? null
      : 'real_duration_sample_collection_kit_runtime_writer_boundary_missing',
    mutationBoundary.performsRollback === false
      ? null
      : 'real_duration_sample_collection_kit_rollback_boundary_missing',
    text(expectedIdentity.baselineId) && baselineId && baselineId !== text(expectedIdentity.baselineId)
      ? 'real_duration_sample_collection_kit_baseline_id_mismatch'
      : null,
    text(expectedIdentity.projectId) && projectId && projectId !== text(expectedIdentity.projectId)
      ? 'real_duration_sample_collection_kit_project_id_mismatch'
      : null,
  ].filter(Boolean)

  return {
    schemaVersion: text(payload.schemaVersion ?? payload.schema_version),
    status: targetCount > 0 || businessTypeGroupCount > 0 ? 'operator_collection_required' : 'empty',
    artifact: repoRelative(resolveCommandPath(collectionKitOutput)),
    productionReady,
    noWriteBoundary,
    baselineId,
    projectId,
    targetSource: text(payload.targetSource ?? payload.target_source),
    targetCount,
    businessTypeGroupCount,
    missingSampleCount: readNumber(summary.missingSampleCount ?? summary.missing_sample_count),
    invalidSampleCount: readNumber(summary.invalidSampleCount ?? summary.invalid_sample_count),
    businessTypeGroups: groups.map((group) => {
      const record = readRecord(group)
      return {
        businessType: text(record.businessType ?? record.business_type),
        targetCount: readNumber(record.targetCount ?? record.target_count),
        missingSampleCount: readNumber(record.missingSampleCount ?? record.missing_sample_count),
        invalidSampleCount: readNumber(record.invalidSampleCount ?? record.invalid_sample_count),
      }
    }),
    writesProductionTables: mutationBoundary.writesProductionTables === true || mutationBoundary.writes_production_tables === true,
    writesTasks: mutationBoundary.writesTasks === true || mutationBoundary.writes_tasks === true,
    writesTaskDependencies: mutationBoundary.writesTaskDependencies === true || mutationBoundary.writes_task_dependencies === true,
    writesDurationSamples: mutationBoundary.writesDurationSamples === true || mutationBoundary.writes_duration_samples === true,
    writesRuntimePublication: mutationBoundary.writesRuntimePublication === true || mutationBoundary.writes_runtime_publication === true,
    invokesRuntimeWriters: mutationBoundary.invokesRuntimeWriters === true || mutationBoundary.invokes_runtime_writers === true,
    performsRollback: mutationBoundary.performsRollback === true || mutationBoundary.performs_rollback === true,
    blockers,
  }
}

function emptyRealDurationSampleCollectionKitSummary(status) {
  return {
    schemaVersion: '',
    status,
    artifact: '',
    productionReady: false,
    noWriteBoundary: '',
    baselineId: '',
    projectId: '',
    targetSource: '',
    targetCount: 0,
    businessTypeGroupCount: 0,
    missingSampleCount: 0,
    invalidSampleCount: 0,
    businessTypeGroups: [],
    writesProductionTables: false,
    writesTasks: false,
    writesTaskDependencies: false,
    writesDurationSamples: false,
    writesRuntimePublication: false,
    invokesRuntimeWriters: false,
    performsRollback: false,
    blockers: [],
  }
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Operator Handoff Preflight',
    '',
    `- status: ${report.status}`,
    `- mayBuildCandidateRefreshPackage: ${report.mayBuildCandidateRefreshPackage}`,
    `- mayRunCandidateRefreshExecutionPreflight: ${report.mayRunCandidateRefreshExecutionPreflight}`,
    `- mayBuildCandidateRefreshAuthorizationPackage: ${report.mayBuildCandidateRefreshAuthorizationPackage}`,
    `- mayCheckCandidateRefreshExecutionReadinessSeal: ${report.mayCheckCandidateRefreshExecutionReadinessSeal}`,
    `- mayRunCandidateBaselineMaterialization: ${report.mayRunCandidateBaselineMaterialization}`,
    `- mayCheckCandidateBaselineMaterializationReadinessSeal: ${report.mayCheckCandidateBaselineMaterializationReadinessSeal}`,
    `- mayRunCandidateRefreshExecution: ${report.mayRunCandidateRefreshExecution}`,
    `- mayBuildDurationAssetUtilizationReport: ${report.mayBuildDurationAssetUtilizationReport}`,
    `- mayRunRuntimeSeedEvidencePipeline: ${report.mayRunRuntimeSeedEvidencePipeline}`,
    `- mayCheckRuntimeSeedImportReadinessSeal: ${report.mayCheckRuntimeSeedImportReadinessSeal}`,
    `- mayRunRuntimeSeedImportExecution: ${report.mayRunRuntimeSeedImportExecution}`,
    `- mayExecuteRuntimeSeedImportWrite: ${report.mayExecuteRuntimeSeedImportWrite}`,
    `- mayBuildReviewPackage: ${report.mayBuildReviewPackage}`,
    `- mayBuildDurationSampleCollectionPackage: ${report.mayBuildDurationSampleCollectionPackage}`,
    `- mayBuildCompletedTaskExport: ${report.mayBuildCompletedTaskExport}`,
    `- mayBuildRuntimeTaskAlignmentReviewEvidence: ${report.mayBuildRuntimeTaskAlignmentReviewEvidence}`,
    `- mayBuildRealDurationSampleMaterialFromTaskExport: ${report.mayBuildRealDurationSampleMaterialFromTaskExport}`,
    `- mayBuildRealDurationSampleMaterialTemplate: ${report.mayBuildRealDurationSampleMaterialTemplate}`,
    `- mayCheckRealDurationSampleCollectionKit: ${report.mayCheckRealDurationSampleCollectionKit}`,
    `- mayCheckRealDurationSampleMaterial: ${report.mayCheckRealDurationSampleMaterial}`,
    `- mayBuildRealDurationSampleSourceExport: ${report.mayBuildRealDurationSampleSourceExport}`,
    `- mayVerifyDurationSampleCoverage: ${report.mayVerifyDurationSampleCoverage}`,
    `- mayBuildRealDurationSampleMaterialFromCollectionKitPreflight: ${report.mayBuildRealDurationSampleMaterialFromCollectionKitPreflight}`,
    `- mayBuildRuntimeMaterialPackage: ${report.mayBuildRuntimeMaterialPackage}`,
    `- mayBuildRealProductionOutcomePackage: ${report.mayBuildRealProductionOutcomePackage}`,
    `- mayAcceptRealProductionOutcomeEvidence: ${report.mayAcceptRealProductionOutcomeEvidence}`,
    `- mayRunReviewDurationSourceExport: ${report.mayRunReviewDurationSourceExport}`,
    `- sourceExportMode: ${report.sourceExportMode}`,
    `- mayRunSupportingSourceExport: ${report.mayRunSupportingSourceExport}`,
    `- mayRunProductionSourceExport: ${report.mayRunProductionSourceExport}`,
    `- mayRunSourceExport: ${report.mayRunSourceExport}`,
    `- mayRunProductionEvidencePipeline: ${report.mayRunProductionEvidencePipeline}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- publicationKey: ${report.publicationKey}`,
    `- targetEnvironment: ${report.targetEnvironment}`,
    `- runtimeSeedImportWriteExecutionBlockers: ${report.runtimeSeedImportWriteExecutionBlockers.length > 0 ? report.runtimeSeedImportWriteExecutionBlockers.join(', ') : 'none'}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    `- runnableActionIds: ${report.actionReadiness.runnableActionIds.length > 0 ? report.actionReadiness.runnableActionIds.join(', ') : 'none'}`,
    `- blockedActionIds: ${report.actionReadiness.blockedActionIds.length > 0 ? report.actionReadiness.blockedActionIds.join(', ') : 'none'}`,
    `- deferredActionIds: ${report.actionReadiness.deferredActionIds.length > 0 ? report.actionReadiness.deferredActionIds.join(', ') : 'none'}`,
    `- writeExecutionRunnableActionIds: ${report.writeExecutionReadiness.runnableActionIds.length > 0 ? report.writeExecutionReadiness.runnableActionIds.join(', ') : 'none'}`,
    `- writeExecutionBlockedActionIds: ${report.writeExecutionReadiness.blockedActionIds.length > 0 ? report.writeExecutionReadiness.blockedActionIds.join(', ') : 'none'}`,
    `- writeExecutionDeferredActionIds: ${report.writeExecutionReadiness.deferredActionIds.length > 0 ? report.writeExecutionReadiness.deferredActionIds.join(', ') : 'none'}`,
    `- candidateRefreshPackageBlockers: ${report.candidateRefreshPackageBlockers.length > 0 ? report.candidateRefreshPackageBlockers.join(', ') : 'none'}`,
    `- candidateRefreshExecutionPreflightBlockers: ${report.candidateRefreshExecutionPreflightBlockers.length > 0 ? report.candidateRefreshExecutionPreflightBlockers.join(', ') : 'none'}`,
    `- candidateRefreshAuthorizationPackageBlockers: ${report.candidateRefreshAuthorizationPackageBlockers.length > 0 ? report.candidateRefreshAuthorizationPackageBlockers.join(', ') : 'none'}`,
    `- candidateRefreshExecutionReadinessSealBlockers: ${report.candidateRefreshExecutionReadinessSealBlockers.length > 0 ? report.candidateRefreshExecutionReadinessSealBlockers.join(', ') : 'none'}`,
    `- candidateBaselineMaterializationBlockers: ${report.candidateBaselineMaterializationBlockers.length > 0 ? report.candidateBaselineMaterializationBlockers.join(', ') : 'none'}`,
    `- candidateBaselineMaterializationReadinessSealBlockers: ${report.candidateBaselineMaterializationReadinessSealBlockers.length > 0 ? report.candidateBaselineMaterializationReadinessSealBlockers.join(', ') : 'none'}`,
    `- candidateRefreshExecutionBlockers: ${report.candidateRefreshExecutionBlockers.length > 0 ? report.candidateRefreshExecutionBlockers.join(', ') : 'none'}`,
    `- durationAssetUtilizationBlockers: ${report.durationAssetUtilizationBlockers.length > 0 ? report.durationAssetUtilizationBlockers.join(', ') : 'none'}`,
    `- runtimeSeedEvidencePipelineBlockers: ${report.runtimeSeedEvidencePipelineBlockers.length > 0 ? report.runtimeSeedEvidencePipelineBlockers.join(', ') : 'none'}`,
    `- runtimeSeedImportReadinessSealBlockers: ${report.runtimeSeedImportReadinessSealBlockers.length > 0 ? report.runtimeSeedImportReadinessSealBlockers.join(', ') : 'none'}`,
    `- runtimeSeedImportExecutionBlockers: ${report.runtimeSeedImportExecutionBlockers.length > 0 ? report.runtimeSeedImportExecutionBlockers.join(', ') : 'none'}`,
    `- runtimeSeedRepairPlanStatus: ${text(report.runtimeSeedRepairPlan?.status) || 'unknown'}`,
    `- runtimeSeedRepairPlanRequiredStepIds: ${arrayOfText(report.runtimeSeedRepairPlan?.requiredStepIds).length > 0 ? arrayOfText(report.runtimeSeedRepairPlan?.requiredStepIds).join(', ') : 'none'}`,
    `- runtimeSeedRepairPlanBlockedStepIds: ${arrayOfText(report.runtimeSeedRepairPlan?.blockedStepIds).length > 0 ? arrayOfText(report.runtimeSeedRepairPlan?.blockedStepIds).join(', ') : 'none'}`,
    `- reviewPackageBlockers: ${report.reviewPackageBlockers.length > 0 ? report.reviewPackageBlockers.join(', ') : 'none'}`,
    `- pmReviewRecordBlockers: ${report.pmReviewRecordBlockers.length > 0 ? report.pmReviewRecordBlockers.join(', ') : 'none'}`,
    `- durationSampleCollectionPackageBlockers: ${report.durationSampleCollectionPackageBlockers.length > 0 ? report.durationSampleCollectionPackageBlockers.join(', ') : 'none'}`,
    `- realDurationSampleCollectionKitStatus: ${report.realDurationSampleCollectionKit.status}`,
    `- realDurationSampleCollectionKitTargetCount: ${report.realDurationSampleCollectionKit.targetCount}`,
    `- realDurationSampleCollectionKitBusinessTypeGroupCount: ${report.realDurationSampleCollectionKit.businessTypeGroupCount}`,
    `- realDurationSampleCollectionKitNoWriteBoundary: ${report.realDurationSampleCollectionKit.noWriteBoundary || 'missing'}`,
    `- realDurationSampleCollectionKitBlockers: ${report.realDurationSampleCollectionKit.blockers.length > 0 ? report.realDurationSampleCollectionKit.blockers.join(', ') : 'none'}`,
    `- realDurationSampleCollectionKitPreflightBlockers: ${report.realDurationSampleCollectionKitPreflightBlockers.length > 0 ? report.realDurationSampleCollectionKitPreflightBlockers.join(', ') : 'none'}`,
    `- completedTaskExportBlockers: ${report.completedTaskExportBlockers.length > 0 ? report.completedTaskExportBlockers.join(', ') : 'none'}`,
    `- runtimeTaskAlignmentReviewEvidenceBlockers: ${report.runtimeTaskAlignmentReviewEvidenceBlockers.length > 0 ? report.runtimeTaskAlignmentReviewEvidenceBlockers.join(', ') : 'none'}`,
    `- realDurationSampleMaterialFromTaskExportBlockers: ${report.realDurationSampleMaterialFromTaskExportBlockers.length > 0 ? report.realDurationSampleMaterialFromTaskExportBlockers.join(', ') : 'none'}`,
    `- realDurationSampleMaterialPreflightBlockers: ${report.realDurationSampleMaterialPreflightBlockers.length > 0 ? report.realDurationSampleMaterialPreflightBlockers.join(', ') : 'none'}`,
    `- realDurationSampleMaterialTemplateBlockers: ${report.realDurationSampleMaterialTemplateBlockers.length > 0 ? report.realDurationSampleMaterialTemplateBlockers.join(', ') : 'none'}`,
    `- realDurationSampleSourceExportBlockers: ${report.realDurationSampleSourceExportBlockers.length > 0 ? report.realDurationSampleSourceExportBlockers.join(', ') : 'none'}`,
    `- durationSampleCoverageBlockers: ${report.durationSampleCoverageBlockers.length > 0 ? report.durationSampleCoverageBlockers.join(', ') : 'none'}`,
    `- runtimeMaterialPackageBlockers: ${report.runtimeMaterialPackageBlockers.length > 0 ? report.runtimeMaterialPackageBlockers.join(', ') : 'none'}`,
    `- realProductionOutcomePackageBlockers: ${report.realProductionOutcomePackageBlockers.length > 0 ? report.realProductionOutcomePackageBlockers.join(', ') : 'none'}`,
    `- realProductionOutcomeEvidenceBlockers: ${report.realProductionOutcomeEvidenceBlockers.length > 0 ? report.realProductionOutcomeEvidenceBlockers.join(', ') : 'none'}`,
    `- reviewDurationSourceExportBlockers: ${report.reviewDurationSourceExportBlockers.length > 0 ? report.reviewDurationSourceExportBlockers.join(', ') : 'none'}`,
    `- sourceExportBlockers: ${report.sourceExportBlockers.length > 0 ? report.sourceExportBlockers.join(', ') : 'none'}`,
    `- productionSourceExportBlockers: ${report.productionSourceExportBlockers.length > 0 ? report.productionSourceExportBlockers.join(', ') : 'none'}`,
    `- productionEvidencePipelineBlockers: ${report.productionEvidencePipelineBlockers.length > 0 ? report.productionEvidencePipelineBlockers.join(', ') : 'none'}`,
    `- candidateRefreshPackagePlaceholderFindings: ${report.candidateRefreshPackagePlaceholderFindings.length}`,
    `- candidateRefreshExecutionPreflightPlaceholderFindings: ${report.candidateRefreshExecutionPreflightPlaceholderFindings.length}`,
    `- candidateRefreshAuthorizationPackagePlaceholderFindings: ${report.candidateRefreshAuthorizationPackagePlaceholderFindings.length}`,
    `- candidateRefreshExecutionReadinessSealPlaceholderFindings: ${report.candidateRefreshExecutionReadinessSealPlaceholderFindings.length}`,
    `- candidateBaselineMaterializationPlaceholderFindings: ${report.candidateBaselineMaterializationPlaceholderFindings.length}`,
    `- candidateBaselineMaterializationReadinessSealPlaceholderFindings: ${report.candidateBaselineMaterializationReadinessSealPlaceholderFindings.length}`,
    `- candidateRefreshExecutionPlaceholderFindings: ${report.candidateRefreshExecutionPlaceholderFindings.length}`,
    `- durationAssetUtilizationPlaceholderFindings: ${report.durationAssetUtilizationPlaceholderFindings.length}`,
    `- runtimeSeedEvidencePipelinePlaceholderFindings: ${report.runtimeSeedEvidencePipelinePlaceholderFindings.length}`,
    `- runtimeSeedImportReadinessSealPlaceholderFindings: ${report.runtimeSeedImportReadinessSealPlaceholderFindings.length}`,
    `- runtimeSeedImportExecutionPlaceholderFindings: ${report.runtimeSeedImportExecutionPlaceholderFindings.length}`,
    `- reviewPackagePlaceholderFindings: ${report.reviewPackagePlaceholderFindings.length}`,
    `- pmReviewRecordPlaceholderFindings: ${report.pmReviewRecordPlaceholderFindings.length}`,
    `- durationSampleCollectionPackagePlaceholderFindings: ${report.durationSampleCollectionPackagePlaceholderFindings.length}`,
    `- completedTaskExportPlaceholderFindings: ${report.completedTaskExportPlaceholderFindings.length}`,
    `- runtimeTaskAlignmentReviewEvidencePlaceholderFindings: ${report.runtimeTaskAlignmentReviewEvidencePlaceholderFindings.length}`,
    `- realDurationSampleMaterialFromTaskExportPlaceholderFindings: ${report.realDurationSampleMaterialFromTaskExportPlaceholderFindings.length}`,
    `- realDurationSampleMaterialTemplatePlaceholderFindings: ${report.realDurationSampleMaterialTemplatePlaceholderFindings.length}`,
    `- realDurationSampleCollectionKitPreflightPlaceholderFindings: ${report.realDurationSampleCollectionKitPreflightPlaceholderFindings.length}`,
    `- realDurationSampleSourceExportPlaceholderFindings: ${report.realDurationSampleSourceExportPlaceholderFindings.length}`,
    `- realDurationSampleMaterialPreflightPlaceholderFindings: ${report.realDurationSampleMaterialPreflightPlaceholderFindings.length}`,
    `- durationSampleCoveragePlaceholderFindings: ${report.durationSampleCoveragePlaceholderFindings.length}`,
    `- runtimeMaterialPackagePlaceholderFindings: ${report.runtimeMaterialPackagePlaceholderFindings.length}`,
    `- realProductionOutcomePackagePlaceholderFindings: ${report.realProductionOutcomePackagePlaceholderFindings.length}`,
    `- reviewDurationSourceExportPlaceholderFindings: ${report.reviewDurationSourceExportPlaceholderFindings.length}`,
    `- sourceExportPlaceholderFindings: ${report.sourceExportPlaceholderFindings.length}`,
    `- activePlaceholderFindingCount: ${report.activePlaceholderFindingCount}`,
    `- deferredPlaceholderFindingCount: ${report.deferredPlaceholderFindingCount}`,
    `- mutationBoundary: writesProductionTables=false, writesTasks=false, writesTaskDependencies=false, writesDurationSamples=false, invokesRuntimeWriters=false, writesRuntimePublication=false`,
  ]
  const completedTaskExport = readRecord(report.completedTaskExport)
  const blockedActionDetails = [
    ...(Array.isArray(report.actionReadiness?.blockedActionDetails)
      ? report.actionReadiness.blockedActionDetails
      : []),
    ...(Array.isArray(report.writeExecutionReadiness?.blockedActionDetails)
      ? report.writeExecutionReadiness.blockedActionDetails
      : []),
  ]
  if (blockedActionDetails.length > 0) {
    lines.push(
      '',
      '## Blocked Action Next Requirements',
      '',
      '| actionId | envUnlocks | requiredFlags | operatorFields | evidenceInputs | environmentTargets | verification |',
      '|---|---|---|---|---|---|---|',
    )
    for (const detail of blockedActionDetails) {
      const requirements = readRecord(detail.nextRequirements)
      lines.push([
        escapeTable(detail.actionId),
        escapeTable(formatEnvUnlocks(requirements.envUnlocks)),
        escapeTable(formatRequiredFlags(requirements.requiredFlags)),
        escapeTable(formatOperatorFields(requirements.operatorFields)),
        escapeTable(formatEvidenceInputs(requirements.evidenceInputs)),
        escapeTable(formatEnvironmentTargets(requirements.requiredEnvironmentTargets)),
        escapeTable(arrayOfText(requirements.verificationCommands).join(', ') || 'none'),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  if (text(completedTaskExport.status) && text(completedTaskExport.status) !== 'not_generated') {
    lines.push(
      '',
      '## Completed Task Export Alignment',
      '',
      `- status: ${text(completedTaskExport.status)}`,
      `- requiredStableCodeCount: ${readNumber(completedTaskExport.requiredStableCodeCount)}`,
      `- rawTaskCount: ${readNumber(completedTaskExport.rawTaskCount)}`,
      `- exportedTaskCount: ${readNumber(completedTaskExport.exportedTaskCount)}`,
      `- invalidTaskCount: ${readNumber(completedTaskExport.invalidTaskCount)}`,
      `- titleMismatchCount: ${readNumber(completedTaskExport.titleMismatchCount)}`,
      `- titleMatchedDifferentStableCodeCount: ${readNumber(completedTaskExport.titleMatchedDifferentStableCodeCount)}`,
      `- missingStableCodeCount: ${readNumber(completedTaskExport.missingStableCodeCount)}`,
      `- missingStableCodes: ${arrayOfText(completedTaskExport.missingStableCodes).length > 0 ? arrayOfText(completedTaskExport.missingStableCodes).join(', ') : 'none'}`,
      `- recommendedNextAction: ${text(completedTaskExport.recommendedNextAction) || 'none'}`,
      `- blockers: ${arrayOfText(completedTaskExport.blockers).length > 0 ? arrayOfText(completedTaskExport.blockers).join(', ') : 'none'}`,
    )
    const invalidTaskExamples = Array.isArray(completedTaskExport.invalidTaskExamples)
      ? completedTaskExport.invalidTaskExamples
      : []
    if (invalidTaskExamples.length > 0) {
      lines.push('', '| taskId | stableCode | title | expectedTitle | matchingCodeByTitle | action | blockers |', '|---|---|---|---|---|---|---|')
      for (const task of invalidTaskExamples) {
        lines.push(`| ${escapeTable(task.id)} | ${escapeTable(task.stableCode)} | ${escapeTable(task.title)} | ${escapeTable(task.expectedTitle)} | ${escapeTable(task.matchingRequestedStableCodeByTitle)} | ${escapeTable(task.recommendedAction)} | ${escapeTable(arrayOfText(task.blockers).join(', '))} |`)
      }
    }
  }
  lines.push(
    '',
    '## Placeholder Findings',
    '',
    '| actionId | gate | placeholder |',
    '|---|---|---|',
  )
  for (const finding of report.placeholderFindings) {
    lines.push(`| ${escapeTable(finding.actionId)} | ${escapeTable(finding.gate)} | ${escapeTable(finding.placeholder)} |`)
  }
  if (report.placeholderFindings.length === 0) lines.push('| none | none | none |')
  return `${lines.join('\n')}\n`
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function normalizeRepairStep(step) {
  const record = readRecord(step)
  return {
    id: text(record.id),
    status: text(record.status),
    blockerCodes: arrayOfText(record.blockerCodes ?? record.blocker_codes),
    title: text(record.title),
    commands: arrayOfText(record.commands),
    verificationCommands: arrayOfText(record.verificationCommands ?? record.verification_commands),
    notes: arrayOfText(record.notes),
  }
}

function normalizeRuntimeSeedRepairPlan(repairPlan) {
  const record = readRecord(repairPlan)
  const orderedSteps = Array.isArray(record.orderedSteps ?? record.ordered_steps)
    ? (record.orderedSteps ?? record.ordered_steps).map((step) => normalizeRepairStep(step))
    : []
  const status = text(record.status)
  const requiredStepIds = arrayOfText(record.requiredStepIds ?? record.required_step_ids)
  const blockedStepIds = arrayOfText(record.blockedStepIds ?? record.blocked_step_ids)
  const orderedStepCount = readNumber(record.orderedStepCount ?? record.ordered_step_count ?? orderedSteps.length)
  return {
    status,
    targetClass: text(record.targetClass ?? record.target_class),
    noAutoInstall: record.noAutoInstall === true || record.no_auto_install === true,
    requiredStepIds,
    blockedStepIds,
    orderedStepCount,
    orderedSteps,
  }
}

function buildActionReadiness(actionSequence, definitions) {
  const actionById = new Map((Array.isArray(actionSequence) ? actionSequence : [])
    .map((action) => [text(action.id), action])
    .filter(([actionId]) => actionId))
  const actions = definitions
    .map(([actionId, runnable, blockers, deferredBy]) => {
      const action = actionById.get(actionId)
      if (!action) return null
      const normalizedBlockers = arrayOfText(blockers)
      const normalizedDeferredBy = arrayOfText(deferredBy)
      const status = normalizedDeferredBy.length > 0
        ? 'deferred'
        : Boolean(runnable) && normalizedBlockers.length === 0
          ? 'runnable'
          : 'blocked'
      return {
        actionId,
        gate: text(action.gate),
        status,
        runnable: status === 'runnable',
        deferred: status === 'deferred',
        blockers: normalizedBlockers,
        deferredBy: normalizedDeferredBy,
      }
    })
    .filter(Boolean)
  return {
    runnableActionIds: actions.filter((action) => action.runnable).map((action) => action.actionId),
    blockedActionIds: actions.filter((action) => action.status === 'blocked').map((action) => action.actionId),
    deferredActionIds: actions.filter((action) => action.status === 'deferred').map((action) => action.actionId),
    blockedActionDetails: actions
      .filter((action) => action.status === 'blocked')
      .map((action) => ({
        actionId: action.actionId,
        gate: action.gate,
        blockers: action.blockers,
        nextRequirements: buildBlockedActionNextRequirements(action),
      })),
    actions,
  }
}

function buildBlockedActionNextRequirements(action) {
  const blockers = new Set(arrayOfText(action.blockers))
  const actionId = text(action.actionId)
  const requirements = {
    envUnlocks: [],
    requiredFlags: [],
    operatorFields: [],
    evidenceInputs: [],
    requiredEnvironmentTargets: [],
    verificationCommands: [],
  }

  const hasAny = (...codes) => codes.some((code) => blockers.has(code))

  if (actionId === 'candidate_baseline_materialization') {
    if (hasAny('candidate_baseline_materialization_unlock_required')) {
      requirements.envUnlocks.push({
        variable: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
        value: '1',
        blockerCodes: ['candidate_baseline_materialization_unlock_required'],
      })
    }
    if (hasAny('candidate_baseline_materialization_execute_mode_required')) {
      requirements.requiredFlags.push({
        flag: '--mode',
        value: 'execute',
        blockerCodes: ['candidate_baseline_materialization_execute_mode_required'],
      })
    }
    if (hasAny('candidate_baseline_materialization_allow_flag_required')) {
      requirements.requiredFlags.push({
        flag: '--allow-materialization',
        blockerCodes: ['candidate_baseline_materialization_allow_flag_required'],
      })
    }
    if (requirements.envUnlocks.length > 0 || requirements.requiredFlags.length > 0) {
      requirements.verificationCommands.push('node project-testing/tools/check-default-master-plan-candidate-baseline-materialization-readiness.mjs')
    }
  }

  if (actionId === 'candidate_refresh_execution') {
    if (hasAny('candidate_refresh_execution_unlock_required', 'candidate_refresh_unlock_required')) {
      requirements.envUnlocks.push({
        variable: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
        value: '1',
        blockerCodes: blockers.has('candidate_refresh_execution_unlock_required')
          ? ['candidate_refresh_execution_unlock_required']
          : ['candidate_refresh_unlock_required'],
      })
    }
    if (hasAny('candidate_refresh_execution_allow_refresh_required')) {
      requirements.requiredFlags.push({
        flag: '--allow-refresh',
        blockerCodes: ['candidate_refresh_execution_allow_refresh_required'],
      })
    }
    if (hasAny('candidate_refresh_execute_mode_required')) {
      requirements.requiredFlags.push({
        flag: '--mode',
        value: 'execute',
        blockerCodes: ['candidate_refresh_execute_mode_required'],
      })
    }
    if (hasAny('candidate_refresh_operator_approval_required')) {
      requirements.operatorFields.push({
        field: '--operator-approval-ref',
        blockerCodes: ['candidate_refresh_operator_approval_required'],
      })
    }
    if (hasAny('candidate_refresh_refreshed_by_required')) {
      requirements.operatorFields.push({
        field: '--refreshed-by',
        blockerCodes: ['candidate_refresh_refreshed_by_required'],
      })
    }
    if (requirements.envUnlocks.length > 0 || requirements.requiredFlags.length > 0 || requirements.operatorFields.length > 0) {
      requirements.verificationCommands.push('node project-testing/tools/check-default-master-plan-candidate-refresh-execution-readiness.mjs')
    }
  }

  if (actionId === 'real_duration_sample_source_export') {
    if (hasAny('real_duration_sample_material_preflight_checked_by_required')) {
      requirements.operatorFields.push({
        field: '--checked-by',
        blockerCodes: ['real_duration_sample_material_preflight_checked_by_required'],
      })
    }
    if (hasAny('real_duration_sample_material_preflight_not_ready')) {
      requirements.evidenceInputs.push({
        artifact: 'real-duration-sample-material-preflight.json',
        requiredStatus: 'ready_for_source_export',
        blockerCodes: ['real_duration_sample_material_preflight_not_ready'],
      })
    }
    if (hasAny('real_duration_sample_source_export_sample_material_missing')) {
      requirements.evidenceInputs.push({
        artifact: 'real-duration-sample-material.json',
        requiredStatus: 'operator_supplied_real_samples_complete',
        blockerCodes: ['real_duration_sample_source_export_sample_material_missing'],
      })
    }
    if (hasAny('real_duration_sample_source_export_material_preflight_missing')) {
      requirements.evidenceInputs.push({
        artifact: 'real-duration-sample-material-preflight.json',
        requiredStatus: 'present',
        blockerCodes: ['real_duration_sample_source_export_material_preflight_missing'],
      })
    }
    if (hasAny('real_duration_sample_material_preflight_accepted_real_duration_sample_material_coverage_incomplete')) {
      requirements.evidenceInputs.push({
        artifact: 'real-duration-sample-material.json',
        requiredStatus: 'accepted_real_duration_sample_material_coverage_complete',
        blockerCodes: ['real_duration_sample_material_preflight_accepted_real_duration_sample_material_coverage_incomplete'],
      })
    }
    if (requirements.evidenceInputs.length > 0 || requirements.operatorFields.length > 0) {
      requirements.verificationCommands.push('npm run evidence:default-master-plan:real-duration-sample-preflight')
    }
  }

  if (actionId === 'runtime_seed_import_execution') {
    if (hasAny(
      'runtime_seed_import_execution_allow_import_required',
      'runtime_seed_import_execution_runtime_seed_import_execution_allow_import_required',
    )) {
      requirements.requiredFlags.push({
        flag: '--allow-import',
        blockerCodes: [...[...blockers].filter((blocker) => [
          'runtime_seed_import_execution_allow_import_required',
          'runtime_seed_import_execution_runtime_seed_import_execution_allow_import_required',
        ].includes(blocker))],
      })
    }
    if (hasAny(
      'runtime_seed_import_execution_seed_smoke_user_id_required',
      'runtime_seed_import_execution_runtime_seed_import_seed_smoke_user_id_required',
    )) {
      requirements.operatorFields.push({
        field: '--seed-smoke-user-id',
        blockerCodes: [...[...blockers].filter((blocker) => [
          'runtime_seed_import_execution_seed_smoke_user_id_required',
          'runtime_seed_import_execution_runtime_seed_import_seed_smoke_user_id_required',
        ].includes(blocker))],
      })
    }
    if (hasAny(
      'runtime_seed_import_execution_local_duration_asset_seed_import_unlock_required',
      'runtime_seed_import_execution_runtime_seed_import_unlock_not_present',
      'runtime_seed_import_execution_local_supabase_must_be_reachable_before_seed_import',
    )) {
      requirements.envUnlocks.push({
        variable: 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT',
        value: '1',
        blockerCodes: [...[...blockers].filter((blocker) => [
          'runtime_seed_import_execution_local_duration_asset_seed_import_unlock_required',
          'runtime_seed_import_execution_runtime_seed_import_unlock_not_present',
          'runtime_seed_import_execution_local_supabase_must_be_reachable_before_seed_import',
        ].includes(blocker))],
      })
    }
    if (hasAny('runtime_seed_import_execution_post_import_verification_file_required')) {
      requirements.evidenceInputs.push({
        artifact: 'runtime-seed-post-import-verification.json',
        requiredStatus: 'runtime_seed_post_import_verified',
        blockerCodes: ['runtime_seed_import_execution_post_import_verification_file_required'],
      })
    }
    if (requirements.envUnlocks.length > 0 || requirements.requiredFlags.length > 0 || requirements.operatorFields.length > 0 || requirements.evidenceInputs.length > 0) {
      requirements.verificationCommands.push('node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs')
    }
  }
  if (actionId === 'production_evidence_pipeline') {
    if (hasAny(
      'production_or_live_source_export_required_for_production_ready',
      'production_or_live_target_required_for_real_production_outcome_evidence',
    )) {
      requirements.requiredEnvironmentTargets.push({
        target: 'production_or_live',
        blockerCodes: [
          ...[...blockers].filter((blocker) => [
            'production_or_live_source_export_required_for_production_ready',
            'production_or_live_target_required_for_real_production_outcome_evidence',
          ].includes(blocker)),
        ],
      })
    }
    if (hasAny(
      'real_production_outcome_material_required',
      'production_pipeline_command_real_production_outcome_missing',
      'production_or_live_source_export_required_for_production_ready',
      'production_or_live_target_required_for_real_production_outcome_evidence',
    )) {
      requirements.evidenceInputs.push({
        artifact: 'real-production-outcome.json',
        requiredStatus: 'pass',
        blockerCodes: [...[...blockers].filter((blocker) => [
          'real_production_outcome_material_required',
          'production_pipeline_command_real_production_outcome_missing',
          'production_or_live_source_export_required_for_production_ready',
          'production_or_live_target_required_for_real_production_outcome_evidence',
        ].includes(blocker))],
      })
    }
    if (hasAny('handoff_current_blockers_not_empty')) {
      requirements.evidenceInputs.push({
        artifact: 'operator-handoff.json',
        requiredStatus: 'currentBlockers_empty',
        blockerCodes: ['handoff_current_blockers_not_empty'],
      })
    }
    if (hasAny('handoff_not_production_ready')) {
      requirements.evidenceInputs.push({
        artifact: 'readiness.json',
        requiredStatus: 'productionReady_true',
        blockerCodes: ['handoff_not_production_ready'],
      })
    }
    if (requirements.evidenceInputs.length > 0 || requirements.requiredEnvironmentTargets.length > 0) {
      requirements.verificationCommands.push('npm run evidence:default-master-plan:operator-handoff-preflight')
      requirements.verificationCommands.push('npm run evidence:default-master-plan:real-evidence-gaps')
    }
  }

  return requirements
}

function isCandidateRefreshActiveBlocker(blocker) {
  const normalized = text(blocker)
  return normalized === 'candidate_baseline_refresh_required_before_runtime_publication'
    || normalized === 'candidate_refresh_db_connection_failed'
    || normalized === 'candidate_refresh_db_execution_failed'
    || normalized === 'candidate_refresh_target_baseline_not_found'
    || normalized === 'candidate_refresh_execution_failed'
    || normalized === 'candidate_refresh_unlock_required'
    || normalized === 'candidate_refresh_operator_approval_required'
    || normalized.startsWith('candidate_refresh_execution_')
}

function isSourceExportPlaceholderFinding(finding) {
  if (isReviewDurationSourceExportPlaceholderFinding(finding)) return false
  if (isReviewPackagePlaceholderFinding(finding)) return false
  if (isDurationAssetUtilizationPlaceholderFinding(finding)) return false
  if (isRealDurationSampleSourceExportPlaceholderFinding(finding)) return false
  if (isDurationSampleCoveragePlaceholderFinding(finding)) return false
  const actionId = text(finding.actionId)
  const gate = text(finding.gate)
  const command = text(finding.command)
  return actionId === 'source_export_collect'
    || gate === 'source_export_collection'
    || command.includes('evidence:default-master-plan:export-sources')
    || command.includes('export-default-master-plan-production-sources')
}

function isReviewPackagePlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'pm_review_package'
    || command.includes('evidence:default-master-plan:review-package')
    || command.includes('build-default-master-plan-review-package')
}

function isCandidateRefreshPackagePlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'candidate_refresh_package'
    || command.includes('evidence:default-master-plan:candidate-refresh-package')
    || command.includes('build-default-master-plan-candidate-refresh-package')
}

function isCandidateRefreshExecutionPreflightPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'candidate_refresh_execution_preflight'
    || command.includes('evidence:default-master-plan:candidate-refresh-preflight')
    || command.includes('check-default-master-plan-candidate-refresh-execution-preflight')
}

function isCandidateRefreshAuthorizationPackagePlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'candidate_refresh_authorization_package'
    || command.includes('build-default-master-plan-candidate-refresh-authorization-package')
}

function isCandidateRefreshExecutionReadinessSealPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'candidate_refresh_execution_readiness_seal'
    || command.includes('check-default-master-plan-candidate-refresh-execution-readiness')
}

function isCandidateBaselineMaterializationPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'candidate_baseline_materialization'
    || command.includes('evidence:default-master-plan:candidate-baseline-materialization')
    || command.includes('run-default-master-plan-candidate-baseline-materialization')
}

function isCandidateBaselineMaterializationReadinessSealPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'candidate_baseline_materialization_readiness_seal'
    || command.includes('check-default-master-plan-candidate-baseline-materialization-readiness')
}

function isCandidateRefreshExecutionPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'candidate_refresh_execution'
    || command.includes('evidence:default-master-plan:candidate-refresh-execution')
    || command.includes('run-default-master-plan-candidate-refresh-execution')
}

function isDurationAssetUtilizationPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'duration_asset_utilization'
    || command.includes('evidence:default-master-plan:duration-asset-utilization')
    || command.includes('build-default-master-plan-duration-asset-utilization-report')
}

function isRuntimeSeedEvidencePipelinePlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'runtime_seed_evidence_pipeline'
    || command.includes('evidence:default-master-plan:runtime-seed-pipeline')
    || command.includes('run-default-master-plan-runtime-seed-evidence-pipeline')
}

function isRuntimeSeedImportReadinessSealPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'runtime_seed_import_readiness_seal'
    || command.includes('check-default-master-plan-runtime-seed-import-readiness')
}

function isRuntimeSeedImportExecutionPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'runtime_seed_import_execution'
    || command.includes('evidence:default-master-plan:runtime-seed-import-execution')
    || command.includes('run-default-master-plan-runtime-seed-import-execution')
}

function isPmReviewRecordPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'pm_review_record'
    || command.includes('evidence:default-master-plan:record-review')
    || command.includes('record-default-master-plan-review-export')
}

function isOfflineDevelopmentQualityReviewPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  return actionId.startsWith('pm_review_')
    || isPmReviewRecordPlaceholderFinding(finding)
    || isReviewPackagePlaceholderFinding(finding)
}

function isReviewDurationSourceExportPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'duration_source_export_collect'
    || actionId === 'review_duration_source_export_collect'
    || (command.includes('evidence:default-master-plan:export-sources') && /--phase (?:duration|review-duration)/.test(command))
    || (command.includes('export-default-master-plan-production-sources') && /--phase (?:duration|review-duration)/.test(command))
}

function isDurationSampleCollectionPackagePlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'duration_sample_collection_package'
    || command.includes('evidence:default-master-plan:duration-sample-package')
    || command.includes('build-default-master-plan-duration-sample-collection-package')
}

function isRealDurationSampleMaterialFromCollectionKitPreflightPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'real_duration_sample_material_from_collection_kit_preflight'
    || command.includes('build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight')
}

function isCompletedTaskExportPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'completed_task_export'
    || command.includes('evidence:default-master-plan:completed-task-export')
    || command.includes('build-default-master-plan-completed-task-export')
}

function isRuntimeCandidateAlignmentPreflightPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'runtime_candidate_alignment_preflight'
    || command.includes('evidence:default-master-plan:runtime-candidate-alignment')
    || command.includes('build-default-master-plan-runtime-candidate-alignment-preflight')
}

function isRuntimeTaskAlignmentRefreshPackagePlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'runtime_task_alignment_refresh_package'
    || command.includes('evidence:default-master-plan:runtime-task-alignment-refresh-package')
    || command.includes('build-default-master-plan-runtime-task-alignment-refresh-package')
}

function isRuntimeTaskAlignmentReviewEvidencePlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'runtime_task_alignment_review_evidence'
    || command.includes('evidence:default-master-plan:runtime-task-alignment-review-evidence')
    || command.includes('build-default-master-plan-runtime-task-alignment-review-evidence')
}

function isRealDurationSampleMaterialFromTaskExportPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'real_duration_sample_material_from_task_export'
    || command.includes('evidence:default-master-plan:real-duration-sample-from-task-export')
    || command.includes('build-default-master-plan-real-duration-sample-material-from-task-export')
}

function isRealDurationSampleSourceExportPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'real_duration_sample_source_export'
    || command.includes('evidence:default-master-plan:real-duration-sample-export')
    || command.includes('build-default-master-plan-real-duration-sample-source-export')
}
function isRealDurationSampleMaterialPreflightPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'real_duration_sample_material_preflight'
    || command.includes('evidence:default-master-plan:real-duration-sample-preflight')
    || command.includes('check-default-master-plan-real-duration-sample-material-preflight')
}


function isRealDurationSampleMaterialTemplatePlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'real_duration_sample_material_template'
    || command.includes('evidence:default-master-plan:real-duration-sample-template')
    || command.includes('build-default-master-plan-real-duration-sample-material-template')
}

function isRealDurationSampleCollectionKitPreflightPlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'real_duration_sample_collection_kit_preflight'
    || command.includes('check-default-master-plan-real-duration-sample-collection-kit-preflight')
}

function isDurationSampleCoveragePlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'duration_sample_coverage'
    || command.includes('evidence:default-master-plan:duration-sample-coverage')
    || command.includes('verify-default-master-plan-duration-sample-coverage')
}

function isRuntimeMaterialPackagePlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'runtime_material_package'
    || command.includes('evidence:default-master-plan:runtime-material-package')
    || command.includes('build-default-master-plan-runtime-material-package')
}

function isCandidateBaselineMaterializationBlocker(blocker) {
  return text(blocker).startsWith('candidate_baseline_materialization_')
}

function isCandidateRefreshExecutionBlocker(blocker) {
  const normalized = text(blocker)
  if (!normalized || normalized === 'candidate_baseline_refresh_required_before_runtime_publication') return false
  if (normalized.startsWith('candidate_refresh_package_')) return false
  return normalized === 'candidate_refresh_db_connection_failed'
    || normalized === 'candidate_refresh_db_execution_failed'
    || normalized === 'candidate_refresh_target_baseline_not_found'
    || normalized === 'candidate_refresh_execution_failed'
    || normalized === 'candidate_refresh_unlock_required'
    || normalized === 'candidate_refresh_operator_approval_required'
    || normalized === 'candidate_refresh_refreshed_by_required'
    || normalized === 'candidate_refresh_execute_mode_required'
    || normalized.startsWith('candidate_refresh_execution_')
}

function isRealProductionOutcomePackagePlaceholderFinding(finding) {
  const actionId = text(finding.actionId)
  const command = text(finding.command)
  return actionId === 'real_production_outcome_package'
    || command.includes('evidence:default-master-plan:real-outcome-package')
    || command.includes('build-default-master-plan-real-production-outcome-package')
}

function arrayOfText(value) {
  if (!Array.isArray(value)) return []
  return value.map(text).filter(Boolean)
}

function isLegacyRuntimePmReviewBlocker(value) {
  const blocker = text(value).toLowerCase()
  return blocker === 'project_manager_review_required'
    || blocker === 'project_manager_review_evidence'
    || blocker === 'candidate_default_master_plan_review_missing'
    || blocker.startsWith('pm_review_')
    || blocker.startsWith('project_manager_review_')
    || blocker.startsWith('candidate_governance_review_')
    || blocker.startsWith('review_notes_')
}

function firstText(...values) {
  return text(values.find((value) => text(value)) ?? '')
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function extractFlagValue(command, flag) {
  const parts = text(command).split(/\s+/).filter(Boolean)
  const index = parts.indexOf(flag)
  if (index < 0) return ''
  const value = text(parts[index + 1])
  if (!value || value.startsWith('--')) return ''
  return value
}

function isProductionReadyEnvironment(value) {
  return ['production', 'live'].includes(text(value).toLowerCase())
}

function buildCommandIdentityBlockers(command, expected, prefix) {
  if (!text(command)) return [`${prefix}_command_required`]
  const checks = [
    ['--baseline-id', 'baselineId', 'baseline_id'],
    ['--project-id', 'projectId', 'project_id'],
    ['--publication-key', 'publicationKey', 'publication_key'],
  ]
  const blockers = []
  for (const [flag, key, label] of checks) {
    const expectedValue = text(expected[key])
    if (!expectedValue) continue
    const actualValue = text(extractFlagValue(command, flag))
    if (!actualValue) {
      blockers.push(`${prefix}_${label}_missing`)
    } else if (actualValue !== expectedValue) {
      blockers.push(`${prefix}_${label}_mismatch`)
    }
  }
  return blockers
}

function buildCommandEnvironmentBlockers(command, expectedEnvironment, prefix) {
  const expectedValue = text(expectedEnvironment)
  if (!expectedValue || !text(command)) return []
  const actualValue = text(extractFlagValue(command, '--environment'))
  if (!actualValue) return [`${prefix}_environment_missing`]
  if (actualValue !== expectedValue) return [`${prefix}_environment_mismatch`]
  return []
}

function buildRequiredActionCommandBlockers(command, { prefix, scriptName, npmScriptName }) {
  const normalizedCommand = text(command)
  if (!normalizedCommand) return [`${prefix}_command_required`]
  if (
    scriptName
    && !normalizedCommand.includes(scriptName)
    && (!npmScriptName || !normalizedCommand.includes(npmScriptName))
  ) {
    return [`${prefix}_command_script_mismatch`]
  }
  return []
}

function buildRequiredFlagBlockers(command, flags, prefix) {
  const normalizedCommand = text(command)
  if (!normalizedCommand) return []
  return flags
    .filter(([flag]) => !text(extractFlagValue(normalizedCommand, flag)))
    .map(([, label]) => `${prefix}_${label}_missing`)
}

function buildDurationSampleCollectionScopeBlockers(command) {
  const normalizedCommand = text(command)
  if (!normalizedCommand) return []
  const profileScope = text(extractFlagValue(normalizedCommand, '--profile-scope'))
  const businessType = text(extractFlagValue(normalizedCommand, '--business-type'))
    || text(extractFlagValue(normalizedCommand, '--business-types'))
  if (businessType) {
    return [
      profileScope === 'target' ? null : 'duration_sample_collection_package_profile_scope_target_required',
    ].filter(Boolean)
  }
  return [
    profileScope === 'all' ? null : 'duration_sample_collection_package_profile_scope_all_required',
    hasFlag(normalizedCommand, '--profile-only') ? null : 'duration_sample_collection_package_profile_only_required',
  ].filter(Boolean)
}

function hasFlag(command, flag) {
  return text(command).split(/\s+/).filter(Boolean).includes(flag)
}

function buildRuntimeSeedImportWriteExecutionBlockers({
  handoffRuntimeSeedImportExecution,
  currentBlockers,
  required,
}) {
  if (!required) return []
  const payload = readRecord(handoffRuntimeSeedImportExecution)
  const payloadPresent = Object.keys(payload).length > 0
  const importGate = readRecord(payload.importGate ?? payload.import_gate)
  const postImportVerification = readRecord(payload.postImportVerification ?? payload.post_import_verification)
  const executionControl = readRecord(payload.executionControl ?? payload.execution_control)
  const blockers = [
    payloadPresent ? null : 'runtime_seed_import_execution_report_required',
    text(payload.status) && text(payload.status) !== 'runtime_seed_import_execution_completed'
      ? `runtime_seed_import_execution_status_${text(payload.status)}`
      : null,
    importGate.importAllowed === false || importGate.import_allowed === false
      ? 'runtime_seed_import_execution_import_gate_not_allowed'
      : null,
    executionControl.executionAllowed === false || executionControl.execution_allowed === false
      ? 'runtime_seed_import_execution_execution_not_allowed'
      : null,
    executionControl.allowImportFlagPresent === false || executionControl.allow_import_flag_present === false
      ? 'runtime_seed_import_execution_allow_import_required'
      : null,
    payloadPresent && !text(executionControl.seedSmokeUserId ?? executionControl.seed_smoke_user_id)
      ? 'runtime_seed_import_execution_seed_smoke_user_id_required'
      : null,
    payloadPresent && (postImportVerification.provided === false || Object.keys(postImportVerification).length === 0)
      ? 'runtime_seed_import_execution_post_import_verification_file_required'
      : null,
    text(postImportVerification.status) && text(postImportVerification.status) !== 'runtime_seed_post_import_verified'
      ? `runtime_seed_import_execution_post_import_status_${text(postImportVerification.status)}`
      : null,
    postImportVerification.activeStandardWorkDurationSeedReady === false || postImportVerification.active_standard_work_duration_seed_ready === false
      ? 'runtime_seed_import_execution_active_standard_work_seed_not_ready'
      : null,
    postImportVerification.activeT2RhythmTemplateReady === false || postImportVerification.active_t2_rhythm_template_ready === false
      ? 'runtime_seed_import_execution_active_t2_rhythm_template_not_ready'
      : null,
    ...arrayOfText(payload.blockers).map(normalizeRuntimeSeedImportWriteExecutionBlocker),
    ...arrayOfText(importGate.blockers).map(normalizeRuntimeSeedImportWriteExecutionBlocker),
    ...arrayOfText(postImportVerification.blockers).map(normalizeRuntimeSeedImportWriteExecutionBlocker),
    ...arrayOfText(currentBlockers)
      .filter((blocker) => blocker.startsWith('runtime_seed_import_execution_'))
      .map(normalizeRuntimeSeedImportWriteExecutionBlocker),
  ].filter(Boolean)
  return [...new Set(blockers)]
}

function normalizeRuntimeSeedImportWriteExecutionBlocker(blocker) {
  const normalized = text(blocker)
  if (!normalized) return ''
  const prefix = 'runtime_seed_import_execution_'
  if (normalized.startsWith(prefix)) {
    const suffix = normalized.slice(prefix.length)
    if (suffix.startsWith(prefix)) return `${prefix}${suffix.slice(prefix.length)}`
    if (suffix === 'runtime_seed_import_gate_not_allowed') return `${prefix}import_gate_not_allowed`
    if (suffix === 'runtime_seed_import_seed_smoke_user_id_required') return `${prefix}seed_smoke_user_id_required`
    if (suffix === 'runtime_seed_import_execution_allow_import_required') return `${prefix}allow_import_required`
    return normalized
  }
  if (normalized === 'runtime_seed_import_gate_not_allowed') return `${prefix}import_gate_not_allowed`
  if (normalized === 'runtime_seed_import_execution_allow_import_required') return `${prefix}allow_import_required`
  if (normalized === 'runtime_seed_import_seed_smoke_user_id_required') return `${prefix}seed_smoke_user_id_required`
  if (normalized.startsWith('runtime_seed_post_import_')) return `${prefix}${normalized}`
  if (normalized.startsWith('local_')) return `${prefix}${normalized}`
  return `${prefix}${normalized}`
}
function buildRuntimeSeedEvidencePipelineReadinessBlockers({
  readinessCheckCommand,
  runtimeSeedEvidencePipelineCommand,
  handoffRuntimeSeedEvidencePipeline,
  required,
}) {
  if (!required) return []
  const readinessCommand = text(readinessCheckCommand)
  if (!readinessCommand) return []
  const readinessRuntimeSeedPath = text(extractFlagValue(readinessCommand, '--runtime-seed-evidence-pipeline'))
  const expectedRuntimeSeedPath = text(handoffRuntimeSeedEvidencePipeline?.artifact)
    || text(extractFlagValue(runtimeSeedEvidencePipelineCommand, '--output'))
  if (!readinessRuntimeSeedPath) return ['readiness_check_runtime_seed_evidence_pipeline_missing']
  if (
    expectedRuntimeSeedPath
    && !PLACEHOLDER_PATTERN.test(expectedRuntimeSeedPath)
    && !PLACEHOLDER_PATTERN.test(readinessRuntimeSeedPath)
    && !sameCommandPath(readinessRuntimeSeedPath, expectedRuntimeSeedPath)
  ) {
    return ['readiness_check_runtime_seed_evidence_pipeline_mismatch']
  }
  return []
}

async function buildRealDurationSampleCollectionKitPreflightInputBlockers(command) {
  const collectionKitPath = text(extractFlagValue(command, '--collection-kit'))
  const blockers = []
  if (
    collectionKitPath
    && !PLACEHOLDER_PATTERN.test(collectionKitPath)
    && !(await fileExists(collectionKitPath))
  ) {
    blockers.push('real_duration_sample_collection_kit_preflight_collection_kit_missing')
  }
  return blockers
}

async function buildRealDurationSampleMaterialPreflightInputBlockers(command) {
  const collectionPackagePath = text(extractFlagValue(command, '--collection-package'))
  const sampleMaterialPath = text(extractFlagValue(command, '--sample-material'))
  const blockers = []
  if (collectionPackagePath && !(await fileExists(collectionPackagePath))) {
    blockers.push('real_duration_sample_material_preflight_collection_package_missing')
  }
  if (sampleMaterialPath && !(await fileExists(sampleMaterialPath))) {
    blockers.push('real_duration_sample_material_preflight_sample_material_missing')
  }
  return blockers
}

async function buildCompletedTaskExportInputBlockers(command) {
  const collectionPackagePath = text(extractFlagValue(command, '--collection-package'))
  const rawTasksPath = text(extractFlagValue(command, '--raw-tasks'))
  const blockers = []
  if (collectionPackagePath && !PLACEHOLDER_PATTERN.test(collectionPackagePath) && !(await fileExists(collectionPackagePath))) {
    blockers.push('completed_task_export_collection_package_missing')
  }
  if (rawTasksPath && !PLACEHOLDER_PATTERN.test(rawTasksPath) && !(await fileExists(rawTasksPath))) {
    blockers.push('completed_task_export_raw_tasks_missing')
  }
  blockers.push(...await buildRawCompletedTasksSourceExportBlockers(rawTasksPath))
  return blockers
}

async function buildRuntimeCandidateAlignmentPreflightInputBlockers(command) {
  const candidateBaselinePath = text(extractFlagValue(command, '--candidate-baseline'))
  const rawTasksPath = text(extractFlagValue(command, '--raw-tasks'))
  const blockers = []
  if (candidateBaselinePath && !PLACEHOLDER_PATTERN.test(candidateBaselinePath) && !(await fileExists(candidateBaselinePath))) {
    blockers.push('runtime_candidate_alignment_preflight_candidate_baseline_missing')
  }
  if (rawTasksPath && !PLACEHOLDER_PATTERN.test(rawTasksPath) && !(await fileExists(rawTasksPath))) {
    blockers.push('runtime_candidate_alignment_preflight_raw_tasks_missing')
  }
  return blockers
}

async function buildRuntimeTaskAlignmentRefreshPackageInputBlockers(command) {
  const runtimeCandidateAlignmentPreflightPath = text(extractFlagValue(command, '--runtime-candidate-alignment-preflight'))
  const blockers = []
  if (
    runtimeCandidateAlignmentPreflightPath
    && !PLACEHOLDER_PATTERN.test(runtimeCandidateAlignmentPreflightPath)
    && !(await fileExists(runtimeCandidateAlignmentPreflightPath))
  ) {
    blockers.push('runtime_task_alignment_refresh_package_runtime_candidate_alignment_preflight_missing')
  }
  return blockers
}

async function buildRealDurationSampleMaterialFromCollectionKitPreflightInputBlockers(command) {
  const collectionPackagePath = text(extractFlagValue(command, '--collection-package'))
  const collectionKitPreflightPath = text(extractFlagValue(command, '--collection-kit-preflight'))
  const blockers = []
  if (collectionPackagePath && !PLACEHOLDER_PATTERN.test(collectionPackagePath) && !(await fileExists(collectionPackagePath))) {
    blockers.push('real_duration_sample_material_from_collection_kit_preflight_collection_package_missing')
  }
  if (collectionKitPreflightPath && !PLACEHOLDER_PATTERN.test(collectionKitPreflightPath) && !(await fileExists(collectionKitPreflightPath))) {
    blockers.push('real_duration_sample_material_from_collection_kit_preflight_collection_kit_preflight_missing')
  }
  return blockers
}

async function buildRuntimeTaskAlignmentReviewEvidenceInputBlockers(command) {
  const refreshPackagePath = text(extractFlagValue(command, '--runtime-task-alignment-refresh-package'))
  const reviewDecisionsPath = text(extractFlagValue(command, '--review-decisions'))
  const blockers = []
  if (
    refreshPackagePath
    && !PLACEHOLDER_PATTERN.test(refreshPackagePath)
    && !(await fileExists(refreshPackagePath))
  ) {
    blockers.push('runtime_task_alignment_review_evidence_refresh_package_missing')
  }
  if (
    reviewDecisionsPath
    && !PLACEHOLDER_PATTERN.test(reviewDecisionsPath)
    && !(await fileExists(reviewDecisionsPath))
  ) {
    blockers.push('runtime_task_alignment_review_evidence_review_decisions_missing')
  }
  return blockers
}

async function buildRawCompletedTasksSourceExportBlockers(rawTasksPath) {
  const normalizedRawTasksPath = text(rawTasksPath)
  if (!normalizedRawTasksPath || PLACEHOLDER_PATTERN.test(normalizedRawTasksPath)) return []
  const manifestPath = path.join(path.dirname(resolveCommandPath(normalizedRawTasksPath)), 'source-exports-manifest.json')
  const manifest = await readJsonIfPresent(manifestPath)
  if (!manifest) return []
  const rawCompletedTasks = readRecord(readRecord(manifest.sourceExports ?? manifest.source_exports).rawCompletedTasks)
  const rawCompletedTasksPath = text(rawCompletedTasks.path)
  if (rawCompletedTasksPath && !sameCommandPath(rawCompletedTasksPath, normalizedRawTasksPath)) return []
  const sourceBlockers = arrayOfText(rawCompletedTasks.blockers)
  if (sourceBlockers.length === 0) return []
  return [
    'completed_task_export_raw_tasks_source_export_blocked',
    ...sourceBlockers.map((blocker) => `completed_task_export_raw_tasks_source_export_${blocker}`),
  ]
}

async function buildRealDurationSampleMaterialFromTaskExportInputBlockers(command) {
  const collectionPackagePath = text(extractFlagValue(command, '--collection-package'))
  const completedTaskExportPath = text(extractFlagValue(command, '--completed-task-export'))
  const blockers = []
  if (collectionPackagePath && !PLACEHOLDER_PATTERN.test(collectionPackagePath) && !(await fileExists(collectionPackagePath))) {
    blockers.push('real_duration_sample_material_from_task_export_collection_package_missing')
  }
  if (completedTaskExportPath && !PLACEHOLDER_PATTERN.test(completedTaskExportPath) && !(await fileExists(completedTaskExportPath))) {
    blockers.push('real_duration_sample_material_from_task_export_completed_task_export_missing')
  }
  return blockers
}

function buildRealDurationSampleMaterialFromTaskExportDependencyBlockers(currentBlockers) {
  const blockers = arrayOfText(currentBlockers)
  return [
    blockers.some((blocker) => blocker.startsWith('completed_task_export_'))
      ? 'real_duration_sample_material_from_task_export_completed_task_export_not_ready'
      : null,
    blockers.some((blocker) => blocker.startsWith('runtime_candidate_alignment_'))
      ? 'real_duration_sample_material_from_task_export_runtime_candidate_alignment_not_ready'
      : null,
    blockers.some((blocker) => blocker.startsWith('runtime_task_alignment_refresh_package_'))
      ? 'real_duration_sample_material_from_task_export_runtime_task_alignment_refresh_package_not_ready'
      : null,
    blockers.some((blocker) => blocker.startsWith('runtime_task_alignment_review_evidence_'))
      ? 'real_duration_sample_material_from_task_export_runtime_task_alignment_review_not_ready'
      : null,
  ].filter(Boolean)
}

async function fileExists(filePath) {
  try {
    await readFile(resolveCommandPath(filePath), 'utf8')
    return true
  } catch {
    return false
  }
}

async function buildRealDurationSampleSourceExportMaterialPreflightBlockers(command) {
  const materialPreflightPath = text(extractFlagValue(command, '--material-preflight'))
  if (!materialPreflightPath) return []
  const collectionPackagePath = text(extractFlagValue(command, '--collection-package'))
  const sampleMaterialPath = text(extractFlagValue(command, '--sample-material'))
  const payload = await readJsonIfPresent(materialPreflightPath)
  if (!payload) return ['real_duration_sample_material_preflight_report_missing']
  const mutationBoundary = payload.mutationBoundary && typeof payload.mutationBoundary === 'object'
    ? payload.mutationBoundary
    : {}
  const materialPreflightBlockers = arrayOfText(payload.blockers)
    .map((blocker) => `real_duration_sample_material_preflight_${blocker}`)

  return [
    text(payload.status) === 'ready_for_source_export'
      ? null
      : 'real_duration_sample_material_preflight_not_ready',
    mutationBoundary.writesDurationSamples === false
      ? null
      : 'real_duration_sample_material_preflight_no_write_boundary_missing',
    mutationBoundary.writesProductionTables === false
      ? null
      : 'real_duration_sample_material_preflight_production_write_boundary_missing',
    materialPreflightRefMatches(payload.collectionPackageRef, 'duration_sample_collection_package', collectionPackagePath)
      ? null
      : 'real_duration_sample_material_preflight_collection_package_ref_mismatch',
    materialPreflightRefMatches(payload.sampleMaterialRef, 'real_duration_sample_material', sampleMaterialPath)
      ? null
      : 'real_duration_sample_material_preflight_sample_material_ref_mismatch',
    ...materialPreflightBlockers,
  ].filter(Boolean)
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(resolveCommandPath(filePath), 'utf8'))
  } catch {
    return null
  }
}

function materialPreflightRefMatches(value, prefix, expectedPath) {
  const normalizedValue = text(value)
  const normalizedExpectedPath = text(expectedPath)
  if (!normalizedValue || !normalizedExpectedPath) return false
  if (!normalizedValue.startsWith(`${prefix}:`)) return false
  const refWithoutHash = normalizedValue.slice(prefix.length + 1).split('#')[0]
  return sameCommandPath(refWithoutHash, normalizedExpectedPath)
}

function buildReviewRecordModeBlockers(command) {
  const normalizedCommand = text(command)
  if (!normalizedCommand) return []
  const mode = text(extractFlagValue(normalizedCommand, '--mode'))
  if (mode === 'execute') return []
  return ['pm_review_record_execute_mode_required']
}

function buildSourceExportManifestBindingBlockers(sourceExportCommand, productionPipelineCommand, prefix) {
  const normalizedSourceExportCommand = text(sourceExportCommand)
  const normalizedProductionPipelineCommand = text(productionPipelineCommand)
  if (!normalizedSourceExportCommand || !normalizedProductionPipelineCommand) return []
  const pipelineManifest = text(extractFlagValue(normalizedProductionPipelineCommand, '--source-manifest'))
  if (!pipelineManifest) return []
  const sourceExportOutputRoot = text(extractFlagValue(normalizedSourceExportCommand, '--output-root'))
  const expectedManifest = path.join(sourceExportOutputRoot ? resolveCommandPath(sourceExportOutputRoot) : DEFAULT_SOURCE_EXPORT_ROOT, 'source-exports-manifest.json')
  return sameCommandPath(pipelineManifest, expectedManifest) ? [] : [`${prefix}_source_manifest_mismatch`]
}

function buildCommandSourceManifestBindingBlockers(referenceCommand, command, prefix) {
  const normalizedReferenceCommand = text(referenceCommand)
  const normalizedCommand = text(command)
  if (!normalizedReferenceCommand || !normalizedCommand) return []
  const referenceManifest = text(extractFlagValue(normalizedReferenceCommand, '--source-manifest'))
  const commandManifest = text(extractFlagValue(normalizedCommand, '--source-manifest'))
  if (!referenceManifest || !commandManifest) return []
  return sameCommandPath(commandManifest, referenceManifest) ? [] : [`${prefix}_source_manifest_mismatch`]
}

function sameCommandPath(left, right) {
  return normalizeCommandPath(left) === normalizeCommandPath(right)
}

function normalizeCommandPath(value) {
  const normalizedValue = text(value)
  if (!normalizedValue) return ''
  return path.normalize(resolveCommandPath(normalizedValue)).toLowerCase()
}

function resolveCommandPath(value) {
  const normalizedValue = text(value)
  return path.isAbsolute(normalizedValue) ? normalizedValue : path.resolve(REPO_ROOT, normalizedValue)
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function escapeTable(value) {
  return text(value).replaceAll('|', '\\|')
}

function formatEnvUnlocks(value) {
  const formatted = arrayOfRecords(value)
    .map((unlock) => {
      const variable = text(unlock.variable)
      if (!variable) return ''
      const expectedValue = text(unlock.value)
      return expectedValue ? `${variable}=${expectedValue}` : variable
    })
    .filter(Boolean)
  return formatted.length > 0 ? formatted.join(', ') : 'none'
}

function formatRequiredFlags(value) {
  const formatted = arrayOfRecords(value)
    .map((requirement) => {
      const flag = text(requirement.flag)
      if (!flag) return ''
      const expectedValue = text(requirement.value)
      return expectedValue ? `${flag} ${expectedValue}` : flag
    })
    .filter(Boolean)
  return formatted.length > 0 ? formatted.join(', ') : 'none'
}

function formatOperatorFields(value) {
  const formatted = arrayOfRecords(value)
    .map((requirement) => text(requirement.field))
    .filter(Boolean)
  return formatted.length > 0 ? formatted.join(', ') : 'none'
}

function formatEvidenceInputs(value) {
  const formatted = arrayOfRecords(value)
    .map((requirement) => {
      const artifact = text(requirement.artifact)
      const requiredStatus = text(requirement.requiredStatus)
      if (!artifact) return ''
      return requiredStatus ? `${artifact}:${requiredStatus}` : artifact
    })
    .filter(Boolean)
  return formatted.length > 0 ? formatted.join(', ') : 'none'
}

function formatEnvironmentTargets(value) {
  const formatted = arrayOfRecords(value)
    .map((requirement) => text(requirement.target))
    .filter(Boolean)
  return formatted.length > 0 ? formatted.join(', ') : 'none'
}

function arrayOfRecords(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(readRecord)
    .filter((record) => Object.keys(record).length > 0)
}

function text(value) {
  return String(value ?? '').trim()
}

function printHelp() {
  console.log(`Usage: node project-testing/tools/check-default-master-plan-operator-handoff-preflight.mjs [--handoff <operator-handoff.json>] [--output <preflight.json>]`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight(options)
    console.log(JSON.stringify({
      status: report.status,
      mayBuildCandidateRefreshPackage: report.mayBuildCandidateRefreshPackage,
      mayBuildCandidateRefreshAuthorizationPackage: report.mayBuildCandidateRefreshAuthorizationPackage,
      mayCheckCandidateRefreshExecutionReadinessSeal: report.mayCheckCandidateRefreshExecutionReadinessSeal,
      mayCheckCandidateBaselineMaterializationReadinessSeal: report.mayCheckCandidateBaselineMaterializationReadinessSeal,
      mayBuildDurationAssetUtilizationReport: report.mayBuildDurationAssetUtilizationReport,
      mayRunRuntimeSeedEvidencePipeline: report.mayRunRuntimeSeedEvidencePipeline,
      mayCheckRuntimeSeedImportReadinessSeal: report.mayCheckRuntimeSeedImportReadinessSeal,
      mayRunRuntimeSeedImportExecution: report.mayRunRuntimeSeedImportExecution,
      mayExecuteRuntimeSeedImportWrite: report.mayExecuteRuntimeSeedImportWrite,
      mayBuildReviewPackage: report.mayBuildReviewPackage,
      mayBuildDurationSampleCollectionPackage: report.mayBuildDurationSampleCollectionPackage,
      mayBuildCompletedTaskExport: report.mayBuildCompletedTaskExport,
      mayRunRuntimeCandidateAlignmentPreflight: report.mayRunRuntimeCandidateAlignmentPreflight,
      mayBuildRuntimeTaskAlignmentRefreshPackage: report.mayBuildRuntimeTaskAlignmentRefreshPackage,
      mayBuildRuntimeTaskAlignmentReviewEvidence: report.mayBuildRuntimeTaskAlignmentReviewEvidence,
      mayBuildRealDurationSampleMaterialFromTaskExport: report.mayBuildRealDurationSampleMaterialFromTaskExport,
      mayBuildRealDurationSampleMaterialTemplate: report.mayBuildRealDurationSampleMaterialTemplate,
      mayBuildRealDurationSampleSourceExport: report.mayBuildRealDurationSampleSourceExport,
      mayCheckRealDurationSampleCollectionKit: report.mayCheckRealDurationSampleCollectionKit,
      mayVerifyDurationSampleCoverage: report.mayVerifyDurationSampleCoverage,
      mayCheckRealDurationSampleMaterial: report.mayCheckRealDurationSampleMaterial,
      mayBuildRuntimeMaterialPackage: report.mayBuildRuntimeMaterialPackage,
      mayBuildRealProductionOutcomePackage: report.mayBuildRealProductionOutcomePackage,
      mayAcceptRealProductionOutcomeEvidence: report.mayAcceptRealProductionOutcomeEvidence,
      mayRunReviewDurationSourceExport: report.mayRunReviewDurationSourceExport,
      sourceExportMode: report.sourceExportMode,
      mayRunSupportingSourceExport: report.mayRunSupportingSourceExport,
      mayRunProductionSourceExport: report.mayRunProductionSourceExport,
      mayRunSourceExport: report.mayRunSourceExport,
      mayRunProductionEvidencePipeline: report.mayRunProductionEvidencePipeline,
      runnableActionIds: report.actionReadiness.runnableActionIds,
      blockedActionIds: report.actionReadiness.blockedActionIds,
      deferredActionIds: report.actionReadiness.deferredActionIds,
      writeExecutionRunnableActionIds: report.writeExecutionReadiness.runnableActionIds,
      writeExecutionBlockedActionIds: report.writeExecutionReadiness.blockedActionIds,
      writeExecutionDeferredActionIds: report.writeExecutionReadiness.deferredActionIds,
      blockers: report.blockers,
      placeholderFindingCount: report.placeholderFindings.length,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
