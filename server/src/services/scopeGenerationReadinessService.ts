export type ScopeGenerationReadinessIssue = {
  code:
    | 'BUILDING_NOT_CONFIGURED'
    | 'BASEMENT_LEVEL_COUNT_MISSING'
    | 'TEMPLATE_SCOPE_TARGET_MISSING'
  severity: 'blocking'
  title?: string
  message: string
  action: string
  impact?: string
  scopeName?: string
  source?: 'scope_model' | 'template_scope_assignment'
  details?: Record<string, unknown>
}

export type ScopeGenerationReadinessResult = {
  ready: boolean
  issues: ScopeGenerationReadinessIssue[]
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function readNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

type ScopeTreeReadinessNode = {
  type: string
  name: string
  metadata: Record<string, unknown>
  children: ScopeTreeReadinessNode[]
}

function normalizeScopeNode(nodeInput: unknown): ScopeTreeReadinessNode | null {
  const node = readRecord(nodeInput)
  const type = readText(node.type, node.objectType, node.object_type)
  const name = readText(node.name, node.objectName, node.object_name)
  if (!type || !name) return null
  return {
    type,
    name,
    metadata: readRecord(node.metadata),
    children: readArray(node.children)
      .map(normalizeScopeNode)
      .filter((child): child is ScopeTreeReadinessNode => Boolean(child)),
  }
}

function flattenScopeNodes(nodes: ScopeTreeReadinessNode[]) {
  const result: ScopeTreeReadinessNode[] = []
  const visit = (node: ScopeTreeReadinessNode) => {
    result.push(node)
    for (const child of node.children) visit(child)
  }
  for (const node of nodes) visit(node)
  return result
}

function hasDescendantType(node: ScopeTreeReadinessNode, types: Set<string>): boolean {
  for (const child of node.children) {
    if (types.has(child.type) || hasDescendantType(child, types)) return true
  }
  return false
}

function hasPositiveBasementLevelCount(node: ScopeTreeReadinessNode): boolean {
  const count = readNumber(node.metadata.basementLevelCount ?? node.metadata.basement_level_count)
  return count !== null && count > 0
}

function hasPositiveStandardFloorCount(node: ScopeTreeReadinessNode): boolean {
  const count = readNumber(node.metadata.standardFloorCount ?? node.metadata.standard_floor_count)
  return count !== null && count > 0
}

export function evaluateScopeGenerationReadiness(params: {
  scopeTree?: unknown[]
}): ScopeGenerationReadinessResult {
  const rootNodes = readArray(params.scopeTree)
    .map(normalizeScopeNode)
    .filter((node): node is ScopeTreeReadinessNode => Boolean(node))
  const nodes = flattenScopeNodes(rootNodes)
  const issues: ScopeGenerationReadinessIssue[] = []

  for (const node of nodes) {
    if (node.type === 'building') {
      const hasPhysicalBreakdown = hasDescendantType(node, new Set(['floor', 'physical_zone']))
      const hasDeclaredFloorCount = hasPositiveStandardFloorCount(node)
      const childrenComplete = readBoolean(node.metadata.childrenComplete ?? node.metadata.children_complete)
      if ((!hasPhysicalBreakdown && !hasDeclaredFloorCount) || childrenComplete === false) {
        issues.push({
          code: 'BUILDING_NOT_CONFIGURED',
          severity: 'blocking',
          scopeName: node.name,
          title: `${node.name}缺少楼层或施工分区`,
          message: `${node.name} 还没有配置楼层或施工分区，系统无法把主体、装饰、机电任务挂到具体空间。`,
          action: '请先在范围体量中为该楼栋配置楼层、塔楼/裙房或水平施工分区，再生成 WBS。',
          impact: '主体结构、二次结构、装饰、机电等标准工序暂不能自动挂到该楼栋。',
          source: 'scope_model',
          details: {
            objectType: node.type,
            hasPhysicalBreakdown,
            hasDeclaredFloorCount,
            childrenComplete,
          },
        })
      }
    }

    if (node.type === 'basement') {
      const hasBasementFloors = hasDescendantType(node, new Set(['floor']))
      if (!hasPositiveBasementLevelCount(node) && !hasBasementFloors) {
        issues.push({
          code: 'BASEMENT_LEVEL_COUNT_MISSING',
          severity: 'blocking',
          scopeName: node.name,
          title: `${node.name}缺少地下层数`,
          message: `${node.name} 缺少地下层数，无法生成基坑、防水和地下室相关工序。`,
          action: '请先填写地下室层数，或生成 B1/B2 等地下层，再生成 WBS。',
          impact: '基坑、地下室结构、防水、地下室机电等任务暂不能形成可靠范围。',
          source: 'scope_model',
          details: {
            objectType: node.type,
            hasBasementFloors,
          },
        })
      }
    }
  }

  return { ready: issues.length === 0, issues }
}

function readWarningMissingObjectLabel(warning: Record<string, unknown>) {
  const details = readRecord(warning.details)
  const explicitLabel = readText(details.missingObjectLabel, details.missing_object_label)
  if (explicitLabel) return explicitLabel
  const targetObjectType = readText(details.targetObjectType, details.target_object_type)
  if (targetObjectType === 'basement') return '地下室'
  if (targetObjectType === 'floor') return '特殊楼层'
  if (targetObjectType === 'physical_zone') return '工程区域'
  if (targetObjectType === 'functional_area') return '功能区域'
  return '对应空间'
}

export function evaluateGeneratedTemplateScopeReadiness(params: {
  governanceWarnings?: unknown[]
}): ScopeGenerationReadinessResult {
  const issues = readArray(params.governanceWarnings)
    .map(readRecord)
    .filter((warning) => readText(warning.code) === 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND')
    .map((warning): ScopeGenerationReadinessIssue => {
      const details = readRecord(warning.details)
      const missingObjectLabel = readWarningMissingObjectLabel(warning)
      const nodeCode = readText(warning.nodeCode, warning.node_code)
      return {
        code: 'TEMPLATE_SCOPE_TARGET_MISSING',
        severity: 'blocking',
        scopeName: missingObjectLabel,
        title: `${missingObjectLabel}缺少对应空间`,
        message: `模板需要挂到「${missingObjectLabel}」，但当前项目空间中没有对应对象。`,
        action: '请先补充对应的物理空间，或取消触发该专项模板后再生成 WBS。',
        impact: '相关标准或专项任务暂不能自动挂接，系统已停止生成以避免任务落到错误范围。',
        source: 'template_scope_assignment',
        details: {
          ...details,
          nodeCode: nodeCode || null,
        },
      }
    })

  return { ready: issues.length === 0, issues }
}

export function assertScopeGenerationReadiness(result: ScopeGenerationReadinessResult) {
  if (result.ready) return
  const firstIssue = result.issues[0]
  const message = firstIssue?.message ?? '项目空间模型还没有准备好，暂不能生成 WBS。'
  throw Object.assign(new Error(message), {
    statusCode: 422,
    code: 'SCOPE_MODEL_NOT_READY_FOR_WBS',
    details: {
      issues: result.issues,
    },
  })
}
