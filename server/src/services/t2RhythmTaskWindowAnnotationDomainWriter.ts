export type T2RhythmTaskWindowAnnotationDomainWriterQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type T2RhythmTaskWindowAnnotationApprovedCandidate = {
  taskId: string
  proposedWindowCode: string
  proposedWindowRole: string
  confidence: string
  score: number
  matchSignals: string[]
  reviewReasonCodes: string[]
  requiresManualApproval: true
  autoWriteAllowed: false
}

export type T2RhythmTaskWindowAnnotationApprovedPackage = {
  candidateEventId: string | null
  assetKey: string
  sourceModule: string
  companyId: string | null
  projectId: string | null
  templateId: string | null
  selectedTemplateIds: string[]
  manualReviewApproval?: {
    candidateEventId: string | null
    approvedByUserId?: string | null
    approvedAt?: string | null
  } | null
  releaseExitHandoff?: {
    candidateEventId: string | null
    releaseRecordTarget: string | null
    rollbackTarget: string | null
    consumerVerificationRefs?: string[]
    impactMonitoringRefs?: string[]
    rollbackWriterRefs?: string[]
  } | null
  reviewPackage: {
    status: string
    annotationCandidateCount: number
    canFeedReplayEvidence: false
    writesStandardTaskMetadata: false
    writesTaskDependencies: false
    writesPlanDates: false
  }
  annotationCandidates: T2RhythmTaskWindowAnnotationApprovedCandidate[]
  annotationGaps: unknown[]
}

export type T2RhythmTaskWindowMetadataPatch = {
  taskId: string
  t2RhythmWindowCode: string
  t2RhythmWindowRole: string
  sourceCandidateEventId: string | null
  approvalCandidateEventId: string | null
  releaseExitHandoffCandidateEventId: string | null
  releaseRecordTarget: string | null
  rollbackTarget: string | null
}

export type ApplyT2RhythmTaskWindowAnnotationApprovedPackageResult = {
  source: 't2_rhythm_task_window_annotation_domain_writer'
  status: 'runtime_apply_ready' | 'runtime_apply_blocked'
  canPatchTaskWindowMetadata: boolean
  canFeedReplayEvidenceAfterNextDiagnostic: boolean
  candidateEventId: string | null
  approvalCandidateEventId: string | null
  releaseExitHandoffCandidateEventId: string | null
  releaseRecordTarget: string | null
  rollbackTarget: string | null
  patchedTaskCount: number
  metadataPatches: T2RhythmTaskWindowMetadataPatch[]
  releaseRecordPersisted: boolean
  writesStandardTaskMetadata: boolean
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesRuntimePublications: boolean
  reasons: string[]
  boundaryPolicy: string[]
}

export type ApplyT2RhythmTaskWindowAnnotationApprovedPackageInput = {
  package?: T2RhythmTaskWindowAnnotationApprovedPackage | null
  companyId?: string | null
  projectId?: string | null
  executedByUserId?: string | null
  executedAt?: string | null
  queryExec: T2RhythmTaskWindowAnnotationDomainWriterQueryExec
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function normalizeRefs(values: string[] | undefined) {
  return unique((values ?? []).map(normalizeText))
}

function boundaryPolicy() {
  return [
    'domain_writer_requires_manual_review_approval',
    'domain_writer_requires_release_exit_handoff',
    'domain_writer_patches_only_t2_standard_task_metadata',
    'domain_writer_does_not_write_task_dependencies_plan_dates_seed_or_baseline',
    'patched_metadata_can_feed_replay_only_after_next_diagnostic',
    'runtime_apply_requires_release_record_and_rollback_target',
  ]
}

function blocked(input: {
  pkg?: T2RhythmTaskWindowAnnotationApprovedPackage | null
  reasons: string[]
}): ApplyT2RhythmTaskWindowAnnotationApprovedPackageResult {
  const pkg = input.pkg ?? null
  return {
    source: 't2_rhythm_task_window_annotation_domain_writer',
    status: 'runtime_apply_blocked',
    canPatchTaskWindowMetadata: false,
    canFeedReplayEvidenceAfterNextDiagnostic: false,
    candidateEventId: pkg?.candidateEventId ?? null,
    approvalCandidateEventId: pkg?.manualReviewApproval?.candidateEventId ?? null,
    releaseExitHandoffCandidateEventId: pkg?.releaseExitHandoff?.candidateEventId ?? null,
    releaseRecordTarget: pkg?.releaseExitHandoff?.releaseRecordTarget ?? null,
    rollbackTarget: pkg?.releaseExitHandoff?.rollbackTarget ?? null,
    patchedTaskCount: 0,
    metadataPatches: [],
    releaseRecordPersisted: false,
    writesStandardTaskMetadata: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesRuntimePublications: false,
    reasons: unique(input.reasons),
    boundaryPolicy: boundaryPolicy(),
  }
}

function validatePackage(pkg?: T2RhythmTaskWindowAnnotationApprovedPackage | null) {
  const reasons: string[] = []
  if (!pkg) return ['annotation_package_required']
  if (!normalizeText(pkg.candidateEventId)) reasons.push('candidate_event_id_required')
  if (!normalizeText(pkg.templateId)) reasons.push('template_id_required')
  if (pkg.reviewPackage?.status !== 'approved_for_metadata_patch') reasons.push('review_package_not_approved_for_metadata_patch')
  if (pkg.reviewPackage?.writesStandardTaskMetadata !== false) reasons.push('review_package_write_boundary_unknown')
  if (pkg.reviewPackage?.writesTaskDependencies !== false) reasons.push('review_package_dependency_write_boundary_unknown')
  if (pkg.reviewPackage?.writesPlanDates !== false) reasons.push('review_package_plan_date_write_boundary_unknown')
  if (!pkg.manualReviewApproval?.candidateEventId) reasons.push('manual_review_approval_required')
  if (!pkg.releaseExitHandoff?.candidateEventId) reasons.push('release_exit_handoff_required')
  if (!pkg.releaseExitHandoff?.releaseRecordTarget) reasons.push('release_record_target_required')
  if (!pkg.releaseExitHandoff?.rollbackTarget) reasons.push('rollback_target_required')
  if (normalizeRefs(pkg.releaseExitHandoff?.consumerVerificationRefs).length < 1) reasons.push('consumer_verification_ref_required')
  if (normalizeRefs(pkg.releaseExitHandoff?.impactMonitoringRefs).length < 1) reasons.push('impact_monitoring_ref_required')
  if (normalizeRefs(pkg.releaseExitHandoff?.rollbackWriterRefs).length < 1) reasons.push('rollback_writer_ref_required')
  if (!Array.isArray(pkg.annotationCandidates) || pkg.annotationCandidates.length < 1) reasons.push('annotation_candidates_required')
  for (const candidate of pkg.annotationCandidates ?? []) {
    const taskId = normalizeText(candidate.taskId)
    const windowCode = normalizeText(candidate.proposedWindowCode)
    const windowRole = normalizeText(candidate.proposedWindowRole)
    if (!taskId) reasons.push('annotation_candidate_task_id_required')
    if (!windowCode) reasons.push(`annotation_candidate_window_code_required:${taskId || 'unknown_task'}`)
    if (!windowRole) reasons.push(`annotation_candidate_window_role_required:${taskId || 'unknown_task'}`)
    if (candidate.requiresManualApproval !== true) reasons.push(`annotation_candidate_manual_approval_flag_required:${taskId || 'unknown_task'}`)
    if (candidate.autoWriteAllowed !== false) reasons.push(`annotation_candidate_auto_write_must_remain_false:${taskId || 'unknown_task'}`)
  }
  return unique(reasons)
}

function buildMetadataPatch(input: {
  pkg: T2RhythmTaskWindowAnnotationApprovedPackage
  candidate: T2RhythmTaskWindowAnnotationApprovedCandidate
  executedByUserId: string | null
  executedAt: string
}) {
  const windowCode = normalizeText(input.candidate.proposedWindowCode)
  const windowRole = normalizeText(input.candidate.proposedWindowRole)
  return {
    t2RhythmWindowCode: windowCode,
    t2_rhythm_window_code: windowCode,
    rhythmWindowCode: windowCode,
    t2RhythmWindowRole: windowRole,
    t2_rhythm_window_role: windowRole,
    rhythmWindowRole: windowRole,
    t2RhythmTemplateId: normalizeText(input.pkg.templateId),
    t2_rhythm_template_id: normalizeText(input.pkg.templateId),
    t2RhythmAnnotationApproved: true,
    t2RhythmAnnotationSource: 't2_rhythm_task_window_annotation_domain_writer',
    t2RhythmAnnotationCandidateEventId: normalizeText(input.pkg.candidateEventId),
    t2RhythmAnnotationApprovalCandidateEventId: normalizeText(input.pkg.manualReviewApproval?.candidateEventId),
    t2RhythmAnnotationReleaseExitCandidateEventId: normalizeText(input.pkg.releaseExitHandoff?.candidateEventId),
    t2RhythmAnnotationReleaseRecordTarget: normalizeText(input.pkg.releaseExitHandoff?.releaseRecordTarget),
    t2RhythmAnnotationRollbackTarget: normalizeText(input.pkg.releaseExitHandoff?.rollbackTarget),
    t2RhythmAnnotationConfidence: normalizeText(input.candidate.confidence),
    t2RhythmAnnotationScore: Number(input.candidate.score) || 0,
    t2RhythmAnnotationReviewReasonCodes: input.candidate.reviewReasonCodes,
    t2RhythmAnnotationMatchSignals: input.candidate.matchSignals,
    t2RhythmCanFeedReplayAfterNextDiagnostic: true,
    t2RhythmAnnotatedByUserId: input.executedByUserId,
    t2RhythmAnnotatedAt: input.executedAt,
  }
}

function patchSummary(input: {
  pkg: T2RhythmTaskWindowAnnotationApprovedPackage
  candidate: T2RhythmTaskWindowAnnotationApprovedCandidate
}): T2RhythmTaskWindowMetadataPatch {
  return {
    taskId: normalizeText(input.candidate.taskId),
    t2RhythmWindowCode: normalizeText(input.candidate.proposedWindowCode),
    t2RhythmWindowRole: normalizeText(input.candidate.proposedWindowRole),
    sourceCandidateEventId: normalizeText(input.pkg.candidateEventId) || null,
    approvalCandidateEventId: normalizeText(input.pkg.manualReviewApproval?.candidateEventId) || null,
    releaseExitHandoffCandidateEventId: normalizeText(input.pkg.releaseExitHandoff?.candidateEventId) || null,
    releaseRecordTarget: normalizeText(input.pkg.releaseExitHandoff?.releaseRecordTarget) || null,
    rollbackTarget: normalizeText(input.pkg.releaseExitHandoff?.rollbackTarget) || null,
  }
}

async function patchTaskMetadata(input: {
  queryExec: T2RhythmTaskWindowAnnotationDomainWriterQueryExec
  projectId: string
  taskId: string
  metadataPatch: Record<string, unknown>
  executedAt: string
}) {
  await input.queryExec(
    `UPDATE public.tasks
        SET standard_task_metadata = COALESCE(standard_task_metadata, '{}'::jsonb) || $3::jsonb,
            updated_at = $4::timestamptz
      WHERE project_id = $1
        AND id = $2
        AND deleted_at IS NULL
      RETURNING id, standard_task_metadata`,
    [
      input.projectId,
      input.taskId,
      input.metadataPatch,
      input.executedAt,
    ],
  )
}

async function persistReleaseRecord(input: {
  queryExec: T2RhythmTaskWindowAnnotationDomainWriterQueryExec
  companyId: string | null
  projectId: string
  pkg: T2RhythmTaskWindowAnnotationApprovedPackage
  metadataPatches: T2RhythmTaskWindowMetadataPatch[]
  executedByUserId: string | null
  executedAt: string
}) {
  await input.queryExec(
    `INSERT INTO public.t2_rhythm_task_window_annotation_runtime_publications (
       publication_key,
       company_id,
       project_id,
       template_id,
       release_handoff_candidate_event_id,
       source_candidate_event_id,
       approval_candidate_event_id,
       runtime_publication_status,
       patched_task_count,
       metadata_patches,
       release_lineage,
       rollback_target,
       record_visibility_policy,
       published_by_user_id,
       published_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, 'runtime_published', $8, $9::jsonb, $10::jsonb, $11, 'backend_admin_governance_only', $12, $13::timestamptz
     )
     ON CONFLICT (publication_key)
     DO UPDATE SET
       runtime_publication_status = 'runtime_published',
       patched_task_count = EXCLUDED.patched_task_count,
       metadata_patches = EXCLUDED.metadata_patches,
       release_lineage = EXCLUDED.release_lineage,
       rollback_target = EXCLUDED.rollback_target,
       published_by_user_id = EXCLUDED.published_by_user_id,
       published_at = EXCLUDED.published_at
     RETURNING id`,
    [
      input.pkg.releaseExitHandoff?.releaseRecordTarget,
      input.companyId,
      input.projectId,
      input.pkg.templateId,
      input.pkg.releaseExitHandoff?.candidateEventId,
      input.pkg.candidateEventId,
      input.pkg.manualReviewApproval?.candidateEventId,
      input.metadataPatches.length,
      JSON.stringify(input.metadataPatches),
      JSON.stringify({
        source: 't2_rhythm_task_window_annotation_domain_writer',
        assetKey: input.pkg.assetKey,
        selectedTemplateIds: input.pkg.selectedTemplateIds,
        candidateEventId: input.pkg.candidateEventId,
        manualReviewApprovalCandidateEventId: input.pkg.manualReviewApproval?.candidateEventId,
        releaseExitHandoffCandidateEventId: input.pkg.releaseExitHandoff?.candidateEventId,
        consumerVerificationRefs: normalizeRefs(input.pkg.releaseExitHandoff?.consumerVerificationRefs),
        impactMonitoringRefs: normalizeRefs(input.pkg.releaseExitHandoff?.impactMonitoringRefs),
        rollbackWriterRefs: normalizeRefs(input.pkg.releaseExitHandoff?.rollbackWriterRefs),
        boundaryPolicy: boundaryPolicy(),
      }),
      input.pkg.releaseExitHandoff?.rollbackTarget,
      input.executedByUserId,
      input.executedAt,
    ],
  )
}

export async function applyT2RhythmTaskWindowAnnotationApprovedPackage(
  input: ApplyT2RhythmTaskWindowAnnotationApprovedPackageInput,
): Promise<ApplyT2RhythmTaskWindowAnnotationApprovedPackageResult> {
  const pkg = input.package ?? null
  const reasons = validatePackage(pkg)
  const projectId = normalizeText(input.projectId ?? pkg?.projectId)
  if (!projectId) reasons.push('project_id_required')
  if (reasons.length > 0 || !pkg) return blocked({ pkg, reasons })

  const executedAt = normalizeText(input.executedAt) || new Date().toISOString()
  const executedByUserId = normalizeText(input.executedByUserId) || null
  const companyId = normalizeText(input.companyId ?? pkg.companyId) || null
  const metadataPatches = pkg.annotationCandidates.map((candidate) => patchSummary({ pkg, candidate }))

  for (const candidate of pkg.annotationCandidates) {
    await patchTaskMetadata({
      queryExec: input.queryExec,
      projectId,
      taskId: normalizeText(candidate.taskId),
      metadataPatch: buildMetadataPatch({
        pkg,
        candidate,
        executedByUserId,
        executedAt,
      }),
      executedAt,
    })
  }

  await persistReleaseRecord({
    queryExec: input.queryExec,
    companyId,
    projectId,
    pkg,
    metadataPatches,
    executedByUserId,
    executedAt,
  })

  return {
    source: 't2_rhythm_task_window_annotation_domain_writer',
    status: 'runtime_apply_ready',
    canPatchTaskWindowMetadata: true,
    canFeedReplayEvidenceAfterNextDiagnostic: true,
    candidateEventId: pkg.candidateEventId,
    approvalCandidateEventId: pkg.manualReviewApproval?.candidateEventId ?? null,
    releaseExitHandoffCandidateEventId: pkg.releaseExitHandoff?.candidateEventId ?? null,
    releaseRecordTarget: pkg.releaseExitHandoff?.releaseRecordTarget ?? null,
    rollbackTarget: pkg.releaseExitHandoff?.rollbackTarget ?? null,
    patchedTaskCount: metadataPatches.length,
    metadataPatches,
    releaseRecordPersisted: true,
    writesStandardTaskMetadata: metadataPatches.length > 0,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesRuntimePublications: true,
    reasons: [],
    boundaryPolicy: boundaryPolicy(),
  }
}
