import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/apiClient'
import {
  formatDurationMetric,
  normalizeDurationMetricDto,
  type DurationMetricDto,
} from '@/lib/durationMetric'

import { formatCriticalPathCount } from './userFacingTerms'

// Critical path frontend contract:
// - Backend CriticalPathSnapshot / CriticalPathSummaryModel is the source of truth for UI.
// - This module only provides snapshot DTOs, summary formatting, override API helpers,
//   and compatibility utilities for fallback analysis / tests.

export type CriticalSource = 'auto' | 'manual_attention' | 'manual_insert' | 'hybrid'

export interface TaskNode {
  id: string
  name: string
  duration: number
  startDate?: Date
  endDate?: Date
  dependencies: string[]
}

export interface CriticalPathEdge {
  id: string
  fromTaskId: string
  toTaskId: string
  source: 'dependency' | 'manual_link'
  isPrimary: boolean
  dependencyType?: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays?: number
}

export interface CriticalTaskSnapshot {
  taskId: string
  title: string
  /** @deprecated Use float. */
  floatDays: number
  float: DurationMetricDto | null
  /** @deprecated Use duration. */
  durationDays: number
  duration: DurationMetricDto | null
  /** @deprecated Use freeFloat. */
  freeFloatDays?: number
  freeFloat: DurationMetricDto | null
  isAutoCritical: boolean
  isManualAttention: boolean
  isManualInserted: boolean
  chainIndex?: number
}

export interface CriticalChainSnapshot {
  id: string
  source: CriticalSource
  taskIds: string[]
  /** @deprecated Use totalDuration. */
  totalDurationDays: number
  totalDuration: DurationMetricDto | null
  displayLabel: string
}

export interface CriticalTaskNetworkSchedule {
  taskId: string
  earliestStartOffsetDays: number
  earliestFinishOffsetDays: number
  latestStartOffsetDays: number
  latestFinishOffsetDays: number
  /** @deprecated Use float. */
  floatDays: number
  float: DurationMetricDto | null
  /** @deprecated Use freeFloat. */
  freeFloatDays: number
  freeFloat: DurationMetricDto | null
  /** @deprecated Use duration. */
  durationDays: number
  duration: DurationMetricDto | null
  isAutoCritical: boolean
}

export interface CriticalPathSnapshot {
  projectId: string
  autoTaskIds: string[]
  manualAttentionTaskIds: string[]
  manualInsertedTaskIds: string[]
  primaryChain: CriticalChainSnapshot | null
  alternateChains: CriticalChainSnapshot[]
  displayTaskIds: string[]
  edges: CriticalPathEdge[]
  tasks: CriticalTaskSnapshot[]
  networkSchedule?: CriticalTaskNetworkSchedule[]
  /** @deprecated Use projectDuration. */
  projectDurationDays: number
  projectDuration: DurationMetricDto | null
  calculatedAt?: string
  lastSuccessfulCalculatedAt?: string | null
  calculationStatus?: 'fresh' | 'cached_after_failure' | 'empty_after_failure'
  calculationFailureMessage?: string | null
  calculationFailedAt?: string | null
  hasCycleDetected?: boolean
  cycleTaskIds?: string[]
}

export interface CriticalPathOverrideInput {
  taskId: string
  mode: 'manual_attention' | 'manual_insert'
  anchorType?: 'before' | 'after' | 'between' | null
  leftTaskId?: string | null
  rightTaskId?: string | null
  reason?: string | null
}

export interface CriticalPathOverrideRecord {
  id: string
  project_id: string
  task_id: string
  mode: 'manual_attention' | 'manual_insert'
  anchor_type?: 'before' | 'after' | 'between' | null
  left_task_id?: string | null
  right_task_id?: string | null
  reason?: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface CriticalPathAnalysis {
  taskMap: Map<string, TaskNode>
  topologicalOrder: string[]
  orderedTaskIds: string[]
  autoTaskIds: string[]
  earliestStart: Map<string, number>
  earliestFinish: Map<string, number>
  latestStart: Map<string, number>
  latestFinish: Map<string, number>
  float: Map<string, number>
  projectDurationDays: number
}

export interface CriticalPathSummaryModel {
  snapshot: CriticalPathSnapshot
  summaryText: string
  primaryTaskCount: number
  alternateChainCount: number
  manualAttentionCount: number
  manualInsertedCount: number
  displayTaskCount: number
  projectDuration: DurationMetricDto | null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(readString).map((item) => item.trim()).filter(Boolean)
    : []
}

function readLegacyNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeCriticalPathDurationMetric(value: unknown): DurationMetricDto | null {
  const metric = normalizeDurationMetricDto(value)
  return metric?.unit === 'construction_production_day' ? metric : null
}

export function formatCriticalPathDurationMetric(metric: DurationMetricDto | null | undefined) {
  return formatDurationMetric(metric, {
    expectedUnit: 'construction_production_day',
    unavailableLabel: '生产日口径不可用',
  })
}

function normalizeCriticalChain(value: unknown): CriticalChainSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = readRecord(value)
  const source = raw.source === 'manual_attention'
    || raw.source === 'manual_insert'
    || raw.source === 'hybrid'
    ? raw.source
    : 'auto'
  return {
    ...(raw as unknown as CriticalChainSnapshot),
    id: readString(raw.id),
    source,
    taskIds: readStringArray(raw.taskIds),
    totalDurationDays: readLegacyNumber(raw.totalDurationDays),
    totalDuration: normalizeCriticalPathDurationMetric(raw.totalDuration),
    displayLabel: readString(raw.displayLabel),
  }
}

function normalizeCriticalTask(value: unknown): CriticalTaskSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = readRecord(value)
  const taskId = readString(raw.taskId).trim()
  if (!taskId) return null
  return {
    ...(raw as unknown as CriticalTaskSnapshot),
    taskId,
    title: readString(raw.title),
    floatDays: readLegacyNumber(raw.floatDays),
    float: normalizeCriticalPathDurationMetric(raw.float),
    durationDays: readLegacyNumber(raw.durationDays),
    duration: normalizeCriticalPathDurationMetric(raw.duration),
    freeFloatDays: raw.freeFloatDays == null ? undefined : readLegacyNumber(raw.freeFloatDays),
    freeFloat: normalizeCriticalPathDurationMetric(raw.freeFloat),
    isAutoCritical: raw.isAutoCritical === true,
    isManualAttention: raw.isManualAttention === true,
    isManualInserted: raw.isManualInserted === true,
  }
}

function normalizeNetworkScheduleTask(value: unknown): CriticalTaskNetworkSchedule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = readRecord(value)
  const taskId = readString(raw.taskId).trim()
  if (!taskId) return null
  return {
    ...(raw as unknown as CriticalTaskNetworkSchedule),
    taskId,
    earliestStartOffsetDays: readLegacyNumber(raw.earliestStartOffsetDays),
    earliestFinishOffsetDays: readLegacyNumber(raw.earliestFinishOffsetDays),
    latestStartOffsetDays: readLegacyNumber(raw.latestStartOffsetDays),
    latestFinishOffsetDays: readLegacyNumber(raw.latestFinishOffsetDays),
    floatDays: readLegacyNumber(raw.floatDays),
    float: normalizeCriticalPathDurationMetric(raw.float),
    freeFloatDays: readLegacyNumber(raw.freeFloatDays),
    freeFloat: normalizeCriticalPathDurationMetric(raw.freeFloat),
    durationDays: readLegacyNumber(raw.durationDays),
    duration: normalizeCriticalPathDurationMetric(raw.duration),
    isAutoCritical: raw.isAutoCritical === true,
  }
}

export function normalizeCriticalPathSnapshot(value: unknown): CriticalPathSnapshot {
  const raw = readRecord(value)
  const primaryChain = normalizeCriticalChain(raw.primaryChain)
  const alternateChains = Array.isArray(raw.alternateChains)
    ? raw.alternateChains.map(normalizeCriticalChain).filter((item): item is CriticalChainSnapshot => item !== null)
    : []
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map(normalizeCriticalTask).filter((item): item is CriticalTaskSnapshot => item !== null)
    : []
  const networkSchedule = Array.isArray(raw.networkSchedule)
    ? raw.networkSchedule.map(normalizeNetworkScheduleTask).filter((item): item is CriticalTaskNetworkSchedule => item !== null)
    : []

  return {
    ...(raw as unknown as CriticalPathSnapshot),
    projectId: readString(raw.projectId),
    autoTaskIds: readStringArray(raw.autoTaskIds),
    manualAttentionTaskIds: readStringArray(raw.manualAttentionTaskIds),
    manualInsertedTaskIds: readStringArray(raw.manualInsertedTaskIds),
    primaryChain,
    alternateChains,
    displayTaskIds: readStringArray(raw.displayTaskIds),
    edges: Array.isArray(raw.edges) ? raw.edges as unknown as CriticalPathEdge[] : [],
    tasks,
    networkSchedule,
    projectDurationDays: readLegacyNumber(raw.projectDurationDays),
    projectDuration: normalizeCriticalPathDurationMetric(raw.projectDuration),
  }
}

export function summarizeCriticalPathSnapshot(snapshot: CriticalPathSnapshot | null | undefined): string {
  if (!snapshot) return ''

  const primaryTaskCount = snapshot.primaryChain?.taskIds.length ?? snapshot.displayTaskIds.length
  if (primaryTaskCount === 0) {
    return '无关键路径'
  }

  const summaryParts = [formatCriticalPathCount(primaryTaskCount), `工期 ${formatCriticalPathDurationMetric(snapshot.projectDuration)}`]

  if (snapshot.alternateChains.length > 0) {
    summaryParts.push(`备选 ${snapshot.alternateChains.length} 条`)
  }

  if (snapshot.manualAttentionTaskIds.length > 0) {
    summaryParts.push(`关注 ${snapshot.manualAttentionTaskIds.length} 项`)
  }

  if (snapshot.manualInsertedTaskIds.length > 0) {
    summaryParts.push(`插链 ${snapshot.manualInsertedTaskIds.length} 项`)
  }

  return summaryParts.join('，')
}

export function buildCriticalPathSummaryModel(
  snapshot: CriticalPathSnapshot | null | undefined,
): CriticalPathSummaryModel | null {
  if (!snapshot) return null

  const primaryTaskCount = snapshot.primaryChain?.taskIds.length ?? snapshot.displayTaskIds.length

  return {
    snapshot,
    summaryText: summarizeCriticalPathSnapshot(snapshot),
    primaryTaskCount,
    alternateChainCount: snapshot.alternateChains.length,
    manualAttentionCount: snapshot.manualAttentionTaskIds.length,
    manualInsertedCount: snapshot.manualInsertedTaskIds.length,
    displayTaskCount: snapshot.displayTaskIds.length,
    projectDuration: snapshot.projectDuration,
  }
}

export async function fetchCriticalPathSnapshot(
  projectId: string,
  options?: RequestInit,
): Promise<CriticalPathSnapshot> {
  return normalizeCriticalPathSnapshot(await apiGet<unknown>(`/api/projects/${projectId}/critical-path`, options))
}

export async function refreshCriticalPathSnapshot(
  projectId: string,
  options?: RequestInit,
): Promise<CriticalPathSnapshot> {
  return normalizeCriticalPathSnapshot(await apiPost<unknown>(`/api/projects/${projectId}/critical-path/refresh`, undefined, options))
}

export async function listCriticalPathOverrides(
  projectId: string,
  options?: RequestInit,
): Promise<CriticalPathOverrideRecord[]> {
  return await apiGet<CriticalPathOverrideRecord[]>(`/api/projects/${projectId}/critical-path/overrides`, options)
}

export async function createCriticalPathOverride(
  projectId: string,
  input: CriticalPathOverrideInput,
  options?: RequestInit,
): Promise<CriticalPathOverrideRecord> {
  return await apiPost<CriticalPathOverrideRecord>(`/api/projects/${projectId}/critical-path/overrides`, {
    task_id: input.taskId,
    mode: input.mode,
    anchor_type: input.anchorType ?? null,
    left_task_id: input.leftTaskId ?? null,
    right_task_id: input.rightTaskId ?? null,
    reason: input.reason ?? null,
  }, options)
}

export async function deleteCriticalPathOverride(
  projectId: string,
  overrideId: string,
  options?: RequestInit,
): Promise<void> {
  await apiDelete(`/api/projects/${projectId}/critical-path/overrides/${overrideId}`, options)
}

export async function updateCriticalPathOverride(
  projectId: string,
  overrideId: string,
  input: CriticalPathOverrideInput,
  options?: RequestInit,
): Promise<CriticalPathOverrideRecord> {
  return await apiPatch<CriticalPathOverrideRecord>(`/api/projects/${projectId}/critical-path/overrides/${overrideId}`, {
    task_id: input.taskId,
    mode: input.mode,
    anchor_type: input.anchorType ?? null,
    left_task_id: input.leftTaskId ?? null,
    right_task_id: input.rightTaskId ?? null,
    reason: input.reason ?? null,
  }, options)
}
