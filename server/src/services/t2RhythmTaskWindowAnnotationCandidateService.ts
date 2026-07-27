import type { T2RhythmScheduleCandidatePackage } from './t2DivisionRhythmTemplateRegistryService.js'
import type { T2RhythmReplayTaskActualRow } from './t2RhythmTemplateReplayEvidenceService.js'
import { orderedInclusiveDurationDays } from '../utils/durationDays.js'

export type T2RhythmTaskWindowAnnotationCandidate = {
  taskId: string
  proposedWindowCode: string
  proposedWindowRole: string
  confidence: 'high' | 'medium' | 'low'
  score: number
  matchSignals: string[]
  reviewReasonCodes: string[]
  requiresManualApproval: true
  autoWriteAllowed: false
}

export type T2RhythmTaskWindowAnnotationGap = {
  taskId: string
  reasonCodes: string[]
  requiresManualReview: true
}

export type T2RhythmTaskWindowAnnotationCandidateReport = {
  source: 't2_task_window_annotation_candidate_report'
  projectId: string
  status: 'candidate_ready_for_manual_review' | 'insufficient_annotation_signal'
  taskRowsRead: number
  annotationCandidateCount: number
  annotationGapCount: number
  canFeedReplayEvidence: false
  annotationCandidates: T2RhythmTaskWindowAnnotationCandidate[]
  annotationGaps: T2RhythmTaskWindowAnnotationGap[]
  governance: {
    readerOnly: true
    writesStandardTaskMetadata: false
    writesTaskDependencies: false
    writesPlanDates: false
    candidateOnly: true
    requiresManualApproval: true
  }
}

export type T2RhythmTaskWindowAnnotationCandidateInput = {
  projectId: string
  candidatePackage: T2RhythmScheduleCandidatePackage
  taskRows: T2RhythmReplayTaskActualRow[]
}

const ROLE_KEYWORDS: Record<string, string[]> = {
  floor_control_line: ['控制线', '放线', '测量放线', '轴线'],
  vertical_rebar_embed: ['竖向钢筋', '墙柱钢筋', '钢筋绑扎', '预埋', '插筋'],
  vertical_formwork: ['竖向模板', '墙柱模板', '铝模', '模板安装'],
  horizontal_formwork_support: ['水平模板', '梁板模板', '支模', '支撑架'],
  horizontal_rebar_embed: ['水平钢筋', '梁板钢筋', '板筋', '管线预埋'],
  concrete_pour: ['混凝土浇筑', '砼浇筑', '浇筑', '混凝土'],
  early_curing_strip_gate: ['养护', '拆模', '早拆', '强度'],
  floor_handover_quality_closeout: ['移交', '实测实量', '质量验收', '验收'],
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readTaskId(task: T2RhythmReplayTaskActualRow) {
  return normalizeText(task.id) || 'unknown'
}

function readTaskSearchText(task: T2RhythmReplayTaskActualRow) {
  const metadata = task.standard_task_metadata ?? task.standardTaskMetadata ?? task.metadata ?? {}
  return [
    task.title,
    task.standard_work_code,
    task.standardWorkCode,
    task.standard_work_name,
    task.standardWorkName,
    task.specialty_type,
    task.specialtyType,
    metadata.stableCode,
    metadata.standardWorkCode,
    metadata.standard_work_code,
    metadata.standardWorkName,
    metadata.standard_work_name,
    metadata.raw_task_title,
    metadata.task_title,
  ].map(normalizeText).filter(Boolean).join(' ').toLowerCase()
}

function readTaskMetadata(task: T2RhythmReplayTaskActualRow) {
  return {
    ...(task.metadata && typeof task.metadata === 'object' && !Array.isArray(task.metadata) ? task.metadata : {}),
    ...(task.standard_task_metadata && typeof task.standard_task_metadata === 'object' && !Array.isArray(task.standard_task_metadata) ? task.standard_task_metadata : {}),
    ...(task.standardTaskMetadata && typeof task.standardTaskMetadata === 'object' && !Array.isArray(task.standardTaskMetadata) ? task.standardTaskMetadata : {}),
  } as Record<string, unknown>
}

function readMetadataWindowRole(task: T2RhythmReplayTaskActualRow) {
  const metadata = readTaskMetadata(task)
  return normalizeText(
    metadata.t2RhythmWindowRole
    ?? metadata.t2_rhythm_window_role
    ?? metadata.rhythmWindowRole
    ?? metadata.rhythm_window_role
    ?? metadata.windowRole
    ?? metadata.window_role,
  )
}

function durationSignal(task: T2RhythmReplayTaskActualRow, expectedDurationDays: number) {
  const actualDuration = orderedInclusiveDurationDays(task.actual_start_date ?? task.actualStartDate, task.actual_end_date ?? task.actualEndDate)
  const plannedDuration = orderedInclusiveDurationDays(
    task.planned_start_date ?? task.plannedStartDate ?? task.start_date,
    task.planned_end_date ?? task.plannedEndDate ?? task.end_date,
  )
  const duration = actualDuration ?? plannedDuration
  if (duration === null) return { matched: false, reasonCode: 'missing_duration_dates' }
  const tolerance = Math.max(1, Math.ceil(expectedDurationDays * 0.5))
  return {
    matched: Math.abs(duration - expectedDurationDays) <= tolerance,
    reasonCode: 'duration_outside_t2_window_band',
  }
}

function scoreWindow(task: T2RhythmReplayTaskActualRow, window: T2RhythmScheduleCandidatePackage['packageWindows'][number]) {
  const text = readTaskSearchText(task)
  const keywords = ROLE_KEYWORDS[window.role] ?? []
  const keywordMatched = keywords.some((keyword) => text.includes(keyword.toLowerCase()))
  const metadataRoleMatched = readMetadataWindowRole(task) === window.role
  const duration = durationSignal(task, window.durationDays)
  const matchSignals = [
    metadataRoleMatched ? `metadata_window_role:${window.role}` : null,
    keywordMatched ? `title_keyword:${window.role}` : null,
    duration.matched ? 'duration_match' : null,
  ].filter((item): item is string => Boolean(item))
  return {
    score: (metadataRoleMatched ? 80 : 0) + (keywordMatched ? 70 : 0) + (duration.matched ? 20 : 0),
    matchSignals,
    missingReasons: [
      metadataRoleMatched || keywordMatched ? null : 'no_t2_window_keyword_match',
      duration.matched ? null : duration.reasonCode,
    ].filter((item): item is string => Boolean(item)),
  }
}

function confidenceFromScore(score: number): T2RhythmTaskWindowAnnotationCandidate['confidence'] {
  if (score >= 90) return 'high'
  if (score >= 70) return 'medium'
  return 'low'
}

export function buildT2RhythmTaskWindowAnnotationCandidateReport(
  input: T2RhythmTaskWindowAnnotationCandidateInput,
): T2RhythmTaskWindowAnnotationCandidateReport {
  const annotationCandidates: T2RhythmTaskWindowAnnotationCandidate[] = []
  const annotationGaps: T2RhythmTaskWindowAnnotationGap[] = []
  const durationBearingWindows = input.candidatePackage.packageWindows.filter((window) => window.durationBearing)

  for (const task of input.taskRows) {
    const taskId = readTaskId(task)
    const ranked = durationBearingWindows
      .map((window) => ({ window, ...scoreWindow(task, window) }))
      .sort((left, right) => right.score - left.score)
    const best = ranked[0]
    if (best && best.score >= 70) {
      annotationCandidates.push({
        taskId,
        proposedWindowCode: best.window.windowCode,
        proposedWindowRole: best.window.role,
        confidence: confidenceFromScore(best.score),
        score: best.score,
        matchSignals: best.matchSignals,
        reviewReasonCodes: best.missingReasons,
        requiresManualApproval: true,
        autoWriteAllowed: false,
      })
      continue
    }

    const reasonCodes = Array.from(new Set(best?.missingReasons.length
      ? best.missingReasons
      : ['no_t2_window_keyword_match', 'duration_outside_t2_window_band']))
    annotationGaps.push({
      taskId,
      reasonCodes,
      requiresManualReview: true,
    })
  }

  return {
    source: 't2_task_window_annotation_candidate_report',
    projectId: input.projectId,
    status: annotationCandidates.length > 0 ? 'candidate_ready_for_manual_review' : 'insufficient_annotation_signal',
    taskRowsRead: input.taskRows.length,
    annotationCandidateCount: annotationCandidates.length,
    annotationGapCount: annotationGaps.length,
    canFeedReplayEvidence: false,
    annotationCandidates,
    annotationGaps,
    governance: {
      readerOnly: true,
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      candidateOnly: true,
      requiresManualApproval: true,
    },
  }
}
