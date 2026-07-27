// v1.4.22.1 §10.7b: Governance algorithm for reconciling template recommendations
// with existing user-edited tasks. Preserves user durations/assignees/progress.
// 4 phases: match / add / rename_suggest / orphan

export type ReconcilePhase = 'match' | 'add' | 'rename_suggest' | 'orphan'

export interface ReconcileTaskEntry {
  taskId: string
  title: string
  wbsCode?: string | null
  standardWorkCode?: string | null
  itemPackCode?: string | null
  phase: ReconcilePhase
  /** Suggested new title if phase is rename_suggest */
  suggestedTitle?: string
  /** Similarity score 0-1 for fuzzy matching */
  similarity?: number
  /** Reason string for the classification */
  reason: string
}

export interface ReconcileResult {
  reconcileBatchId: string
  backupId: string
  entries: ReconcileTaskEntry[]
  summary: {
    match: number
    add: number
    rename_suggest: number
    orphan: number
    total: number
  }
  createdAt: string
}

export interface ReconcilePreviewInput {
  projectId: string
  existingTaskIds: string[]
  recommendedTemplateCodes: string[]
  recommendedTemplateNames: string[]
}

const SIMILARITY_THRESHOLD = 0.6

function fuzzySimilarity(a: string, b: string): number {
  const aNorm = a.toLowerCase().replace(/[^\w一-鿿]/g, '')
  const bNorm = b.toLowerCase().replace(/[^\w一-鿿]/g, '')
  if (aNorm === bNorm) return 1.0

  const aSet = new Set(aNorm.split(''))
  const bSet = new Set(bNorm.split(''))
  const intersection = new Set([...aSet].filter(x => bSet.has(x)))
  const union = new Set([...aSet, ...bSet])
  if (union.size === 0) return 0
  return intersection.size / union.size
}

/** Build a reconciliation preview without modifying any data. */
export function buildReconcilePreview(input: ReconcilePreviewInput): ReconcileResult {
  const entries: ReconcileTaskEntry[] = []
  const now = new Date().toISOString()
  const batchId = `reconcile_${Date.now()}`

  // Phase 1: Match — existing tasks that map to recommended templates
  // Phase 2: Add — recommended templates with no matching existing task
  // Phase 3: rename_suggest — similar but not exact match
  // Phase 4: orphan — existing tasks with no matching recommendation

  const matchedCodes = new Set<string>()
  const matchedTaskIds = new Set<string>()

  for (let i = 0; i < input.recommendedTemplateCodes.length; i++) {
    const code = input.recommendedTemplateCodes[i]
    const name = input.recommendedTemplateNames[i]
    let bestTaskId: string | null = null
    let bestSimilarity = 0

    for (const taskId of input.existingTaskIds) {
      const sim = fuzzySimilarity(name, taskId)
      if (sim > bestSimilarity) {
        bestSimilarity = sim
        bestTaskId = taskId
      }
    }

    if (bestTaskId && bestSimilarity >= SIMILARITY_THRESHOLD) {
      matchedCodes.add(code)
      matchedTaskIds.add(bestTaskId)
      entries.push({
        taskId: bestTaskId,
        title: name,
        wbsCode: code,
        phase: bestSimilarity >= 0.9 ? 'match' : 'rename_suggest',
        suggestedTitle: bestSimilarity < 0.9 ? name : undefined,
        similarity: bestSimilarity,
        reason: bestSimilarity >= 0.9 ? '标准名称精确匹配' : `与标准名称相似度 ${Math.round(bestSimilarity * 100)}%`,
      })
    } else {
      entries.push({
        taskId: `new_${i}`,
        title: name,
        wbsCode: code,
        phase: 'add',
        reason: '推荐新增，未有匹配的现有任务',
      })
    }
  }

  // Orphans: existing tasks not matched
  for (const taskId of input.existingTaskIds) {
    if (!matchedTaskIds.has(taskId)) {
      entries.push({
        taskId,
        title: taskId,
        phase: 'orphan',
        reason: '未在推荐模板中找到对应项，用户可保留或手动删除',
      })
    }
  }

  const summary = {
    match: entries.filter(e => e.phase === 'match').length,
    add: entries.filter(e => e.phase === 'add').length,
    rename_suggest: entries.filter(e => e.phase === 'rename_suggest').length,
    orphan: entries.filter(e => e.phase === 'orphan').length,
    total: entries.length,
  }

  return {
    reconcileBatchId: batchId,
    backupId: `backup_${batchId}`,
    entries,
    summary,
    createdAt: now,
  }
}
