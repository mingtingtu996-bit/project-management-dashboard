export const PLANNING_BOOTSTRAP_PATHS = [
  'template_to_baseline',
] as const

export type PlanningBootstrapPath = (typeof PLANNING_BOOTSTRAP_PATHS)[number]

export interface PlanningBootstrapProjectLike {
  id?: string | null
  name?: string | null
  status?: string | null
  current_phase?: string | null
  default_wbs_generated?: boolean | null
  project_type?: string | null
  building_type?: string | null
  structure_type?: string | null
  planned_start_date?: string | null
  start_date?: string | null
  actual_start_date?: string | null
}

export interface PlanningBootstrapChecklistItem {
  key: string
  title: string
  detail: string
}

export interface PlanningBootstrapLearnMoreSection {
  heading: string
  body: string
}

export interface PlanningBootstrapLearnMore {
  title: string
  sections: PlanningBootstrapLearnMoreSection[]
}

export interface PlanningBootstrapGuide {
  project_id: string
  project_name: string
  status_label: string
  mode: PlanningBootstrapPath
  title: string
  subtitle: string
  quickActions: Array<{ path: PlanningBootstrapPath; label: string; description: string }>
  checklist: PlanningBootstrapChecklistItem[]
  learnMore: PlanningBootstrapLearnMore
}

export interface PlanningBootstrapContext {
  guide: PlanningBootstrapGuide
  project: PlanningBootstrapProjectLike
  taskCount: number
  milestoneCount: number
}

function normalizeProjectStatus(status?: string | null): string {
  switch (String(status ?? '').trim()) {
    case '进行中':
    case 'in_progress':
    case 'active':
      return '进行中'
    case '已完成':
    case 'completed':
    case 'done':
      return '已完成'
    case '已暂停':
    case 'paused':
    case 'archived':
      return '已暂停'
    case '未开始':
    case 'planning':
    case 'pending':
    case 'not_started':
    default:
      return '未开始'
  }
}

function normalizeProjectName(project: PlanningBootstrapProjectLike): string {
  return String(project.name ?? '').trim() || '未命名项目'
}

function projectPhaseLabel(project: PlanningBootstrapProjectLike): string {
  const currentPhase = String(project.current_phase ?? '').trim()
  if (currentPhase === 'construction') return '施工阶段'
  if (currentPhase === 'completion') return '收尾阶段'
  if (currentPhase === 'delivery') return '交付阶段'
  if (currentPhase === 'pre-construction') return '前期阶段'
  return '计划编制'
}

export function resolvePlanningBootstrapMode(project: PlanningBootstrapProjectLike): PlanningBootstrapPath {
  normalizeProjectStatus(project.status)
  return 'template_to_baseline'
}

function buildQuickActions(): PlanningBootstrapGuide['quickActions'] {
  return [
    {
      path: 'template_to_baseline',
      label: 'WBS 模板 -> 项目基线',
      description: '把可复用的结构整理成可直接确认的项目基线。',
    },
  ]
}

function buildLearnMore(): PlanningBootstrapLearnMore {
  return {
    title: '四层时间线怎么理解',
    sections: [
      {
        heading: '项目基线',
        body: '先定下来的主计划骨架，用来作为后续确认、变更和对比的基准。',
      },
      {
        heading: '月度计划',
        body: '每个月要真正推进的具体安排，通常比基线更细。',
      },
      {
        heading: '当前项目计划时间',
        body: '系统整理后的最新计划时间，反映当前认可的排期。',
      },
      {
        heading: '项目实际执行时间',
        body: '现场真实发生的时间，后续复盘和偏差分析都会看这层。',
      },
    ],
  }
}

function buildChecklist(mode: PlanningBootstrapPath): PlanningBootstrapChecklistItem[] {
  void mode
  return [
    {
      key: 'pick',
      title: '选择模板',
      detail: '先选一套可复用结构作为起点。',
    },
    {
      key: 'generate',
      title: '生成项目基线',
      detail: '把模板转成项目可直接使用的基线骨架。',
    },
    {
      key: 'confirm',
      title: '确认后启用',
      detail: '确认无误后再进入后续计划编制。',
    },
  ]
}

export function buildPlanningBootstrapGuide(params: {
  project: PlanningBootstrapProjectLike
  taskCount: number
  milestoneCount: number
}): PlanningBootstrapGuide {
  const mode = resolvePlanningBootstrapMode(params.project)
  const projectName = normalizeProjectName(params.project)
  const statusLabel = normalizeProjectStatus(params.project.status)
  const projectPhase = projectPhaseLabel(params.project)

  return {
    project_id: String(params.project.id ?? ''),
    project_name: projectName,
    status_label: statusLabel,
    mode,
    title: '计划编制启用与 WBS 模板',
    subtitle: `把 WBS 模板并入计划编制，统一处理 ${projectPhase} 的启用、冷启动和沉淀。`,
    quickActions: buildQuickActions(),
    checklist: buildChecklist(mode),
    learnMore: buildLearnMore(),
  }
}

export class PlanningBootstrapService {
  buildContext(params: {
    project: PlanningBootstrapProjectLike
    tasks: unknown[]
    milestones: unknown[]
  }): PlanningBootstrapContext {
    const guide = buildPlanningBootstrapGuide({
      project: params.project,
      taskCount: params.tasks.length,
      milestoneCount: params.milestones.length,
    })

    return {
      guide,
      project: params.project,
      taskCount: params.tasks.length,
      milestoneCount: params.milestones.length,
    }
  }
}
