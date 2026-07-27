export type ProjectTaskAttributionInput = {
  id: string
  title?: string | null
  parent_id?: string | null
  wbs_level?: number | string | null
  sort_order?: number | string | null
  engineering_category_id?: string | null
  engineering_category_name?: string | null
  specialty_type?: string | null
}

export type ProjectTaskAttribution = {
  divisionId: string | null
  divisionName: string | null
  divisionSortOrder: number
  subdivisionId: string | null
  subdivisionName: string | null
  subdivisionSortOrder: number
  specialtyId: string | null
  specialtyName: string | null
  specialtySortOrder: number
  specialtySource: 'engineering_category' | 'business_label' | 'unassigned'
  degradationReasons: string[]
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeLevel(value: unknown) {
  const level = Number(value)
  return Number.isFinite(level) ? level : null
}

function normalizeSortOrder(value: unknown) {
  const sortOrder = Number(value)
  return Number.isFinite(sortOrder) ? sortOrder : 0
}

type CanonicalSpecialty = {
  id: string
  name: string
}

function specialtyAliasKey(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\s_-]+/g, '')
}

const CANONICAL_SPECIALTIES: Array<CanonicalSpecialty & { aliases: string[] }> = [
  { id: 'foundation', name: '地基基础', aliases: ['foundation', '地基基础'] },
  { id: 'structure', name: '主体结构', aliases: ['structure', '主体结构'] },
  { id: 'mep', name: '机电安装', aliases: ['mep', '机电', '机电安装', '机电安装工程'] },
  { id: 'decoration', name: '装饰装修', aliases: ['decoration', '装饰装修'] },
  { id: 'curtain_wall', name: '幕墙工程', aliases: ['curtain_wall', '幕墙', '幕墙工程'] },
  { id: 'landscape', name: '园林景观', aliases: ['landscape', '园林景观'] },
  { id: 'steel', name: '钢结构', aliases: ['steel', '钢结构'] },
  { id: 'waterproof', name: '防水工程', aliases: ['waterproof', '防水', '防水工程'] },
  { id: 'other', name: '其他专项', aliases: ['other', '其他专项'] },
]

const SPECIALTY_BY_ALIAS = new Map(
  CANONICAL_SPECIALTIES.flatMap((specialty) => specialty.aliases.map((alias) => [
    specialtyAliasKey(alias),
    { id: specialty.id, name: specialty.name },
  ] as const)),
)

function resolveCanonicalSpecialty(...values: string[]) {
  for (const value of values) {
    const canonical = SPECIALTY_BY_ALIAS.get(specialtyAliasKey(value))
    if (canonical) return canonical
  }
  return null
}

function specialtyLabelKey(value: string) {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || encodeURIComponent(value.toLocaleLowerCase('en-US'))
}

export function buildProjectTaskAttributionProjection(
  tasks: ProjectTaskAttributionInput[],
): Map<string, ProjectTaskAttribution> {
  const taskLookup = new Map(
    tasks
      .filter((task) => normalizeText(task.id))
      .map((task) => [normalizeText(task.id), task] as const),
  )
  const projection = new Map<string, ProjectTaskAttribution>()

  for (const task of tasks) {
    const taskId = normalizeText(task.id)
    if (!taskId) continue

    const lineage: ProjectTaskAttributionInput[] = [task]
    const visited = new Set([taskId])
    let current: ProjectTaskAttributionInput | undefined = task
    let parentCycleDetected = false

    while (current) {
      const parentId = normalizeText(current.parent_id)
      if (!parentId) break
      if (visited.has(parentId)) {
        parentCycleDetected = true
        break
      }
      visited.add(parentId)
      const parent = taskLookup.get(parentId)
      if (!parent) break
      lineage.unshift(parent)
      current = parent
    }

    const division = lineage.find((item) => normalizeLevel(item.wbs_level) === 1) ?? null
    const subdivision = lineage.find((item) => normalizeLevel(item.wbs_level) === 2) ?? null
    const engineeringCategoryId = normalizeText(task.engineering_category_id)
    const engineeringCategoryName = normalizeText(task.engineering_category_name)
    const specialtyLabel = normalizeText(task.specialty_type)
    const degradationReasons: string[] = []

    if (parentCycleDetected) degradationReasons.push('wbs_parent_cycle')
    if (!division) degradationReasons.push('missing_division_attribution')
    if (!subdivision) degradationReasons.push('missing_subdivision_attribution')

    let specialtyId: string | null = null
    let specialtyName: string | null = null
    let specialtySource: ProjectTaskAttribution['specialtySource'] = 'unassigned'
    if (engineeringCategoryId) {
      const canonical = resolveCanonicalSpecialty(engineeringCategoryName, engineeringCategoryId)
      specialtyId = canonical?.id ?? engineeringCategoryId
      specialtyName = canonical?.name ?? (engineeringCategoryName || specialtyLabel || engineeringCategoryId)
      specialtySource = 'engineering_category'
    } else if (specialtyLabel) {
      const canonical = resolveCanonicalSpecialty(specialtyLabel)
      specialtyId = canonical?.id ?? `specialty-label:${specialtyLabelKey(specialtyLabel)}`
      specialtyName = canonical?.name ?? specialtyLabel
      specialtySource = 'business_label'
      degradationReasons.push('specialty_business_label_fallback')
    } else {
      degradationReasons.push('missing_specialty_attribution')
    }

    projection.set(taskId, {
      divisionId: division ? normalizeText(division.id) : null,
      divisionName: division ? normalizeText(division.title) || null : null,
      divisionSortOrder: division ? normalizeSortOrder(division.sort_order) : 0,
      subdivisionId: subdivision ? normalizeText(subdivision.id) : null,
      subdivisionName: subdivision ? normalizeText(subdivision.title) || null : null,
      subdivisionSortOrder: subdivision ? normalizeSortOrder(subdivision.sort_order) : 0,
      specialtyId,
      specialtyName,
      specialtySortOrder: 0,
      specialtySource,
      degradationReasons,
    })
  }

  return projection
}
