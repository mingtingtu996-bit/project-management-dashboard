import { apiDelete, apiGet, apiPost } from '@/lib/apiClient'

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
}

export interface CriticalTaskSnapshot {
  taskId: string
  title: string
  floatDays: number
  durationDays: number
  isAutoCritical: boolean
  isManualAttention: boolean
  isManualInserted: boolean
  chainIndex?: number
}

export interface CriticalChainSnapshot {
  id: string
  source: CriticalSource
  taskIds: string[]
  totalDurationDays: number
  displayLabel: string
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
  projectDurationDays: number
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
  projectDurationDays: number
}

export function summarizeCriticalPathSnapshot(snapshot: CriticalPathSnapshot | null | undefined): string {
  if (!snapshot) return ''

  const primaryTaskCount = snapshot.primaryChain?.taskIds.length ?? snapshot.displayTaskIds.length
  if (primaryTaskCount === 0) {
    return '无关键路径'
  }

  const summaryParts = [formatCriticalPathCount(primaryTaskCount), `工期 ${snapshot.projectDurationDays} 天`]

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
    projectDurationDays: snapshot.projectDurationDays,
  }
}

export async function fetchCriticalPathSnapshot(
  projectId: string,
  options?: RequestInit,
): Promise<CriticalPathSnapshot> {
  return await apiGet<CriticalPathSnapshot>(`/api/projects/${projectId}/critical-path`, options)
}

export async function refreshCriticalPathSnapshot(
  projectId: string,
  options?: RequestInit,
): Promise<CriticalPathSnapshot> {
  return await apiPost<CriticalPathSnapshot>(`/api/projects/${projectId}/critical-path/refresh`, undefined, options)
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
