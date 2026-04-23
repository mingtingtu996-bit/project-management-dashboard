import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  Calendar,
  Flag,
  FolderKanban,
  GanttChart,
  LayoutDashboard,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { PermissionAction } from '@/lib/permissions'

export type NavigationPermission = PermissionAction

export interface NavigationChildItem {
  key: string
  label: string
  href: string
  permission?: NavigationPermission
}

export interface NavigationItem {
  key: string
  label: string
  href: string
  icon: LucideIcon
  permission?: NavigationPermission
  children?: NavigationChildItem[]
}

export interface ShellNavigationMeta {
  title: string
  contextLabel: string
}

export type NotificationTargetKey =
  | 'dashboard'
  | 'planning'
  | 'tasks'
  | 'task-summary'
  | 'risks'
  | 'license'
  | 'special'
  | 'reports'
  | 'project-home'

export interface NotificationTarget {
  key: NotificationTargetKey
  label: string
  href: string
}

export interface NotificationLike {
  projectId?: string
  sourceEntityType?: string
  source_entity_type?: string
  sourceEntityId?: string
  source_entity_id?: string
  taskId?: string
  task_id?: string
  milestoneId?: string
  milestone_id?: string
  title: string
  content?: string
  message?: string
  type?: string
  category?: string
  severity?: string
}

export const PROJECT_NAVIGATION_LABELS = {
  dashboard: '\u4eea\u8868\u76d8',
  reports: '\u62a5\u8868\u5206\u6790',
  milestones: '\u91cc\u7a0b\u7891',
  tasks: '\u4efb\u52a1\u7ba1\u7406',
  taskList: '\u4efb\u52a1\u5217\u8868',
  taskSummary: '\u4efb\u52a1\u603b\u7ed3',
  responsibility: '\u8d23\u4efb\u4e3b\u4f53',
  risks: '\u98ce\u9669\u4e0e\u95ee\u9898',
  wbsTemplates: 'WBS \u6a21\u677f',
  special: '\u4e13\u9879\u7ba1\u7406',
  preMilestones: '\u524d\u671f\u8bc1\u7167',
  drawings: '\u65bd\u5de5\u56fe\u7eb8',
  acceptance: '\u9a8c\u6536\u65f6\u95f4\u8f74',
  materials: '\u6750\u6599\u7ba1\u63a7',
  planning: '\u8ba1\u5212\u7f16\u5236',
  baseline: '\u9879\u76ee\u57fa\u7ebf',
  monthlyPlan: '\u6708\u5ea6\u8ba1\u5212',
  closeout: '\u6708\u672b\u5173\u8d26\u5de5\u4f5c\u53f0',
  revisionPool: '\u8ba1\u5212\u4fee\u8ba2\u5019\u9009',
  projectHome: '\u9879\u76ee\u603b\u89c8',
  notifications: '\u63d0\u9192\u4e2d\u5fc3',
  company: '\u516c\u53f8\u9a7e\u9a76\u8231',
} as const

export const COMPANY_NAVIGATION: NavigationItem[] = [
  { key: 'company', label: PROJECT_NAVIGATION_LABELS.company, href: '/company', icon: Building2 },
  { key: 'notifications', label: PROJECT_NAVIGATION_LABELS.notifications, href: '/notifications', icon: Bell },
]

export const PROJECT_NAVIGATION: NavigationItem[] = [
  { key: 'dashboard', label: PROJECT_NAVIGATION_LABELS.dashboard, href: '/projects/:id/dashboard', icon: LayoutDashboard, permission: 'view:project' },
  { key: 'milestones', label: PROJECT_NAVIGATION_LABELS.milestones, href: '/projects/:id/milestones', icon: Flag, permission: 'view:milestone' },
  {
    key: 'planning',
    label: PROJECT_NAVIGATION_LABELS.planning,
    href: '/projects/:id/planning/baseline',
    icon: FolderKanban,
    permission: 'view:task',
    children: [
      { key: 'planning-baseline', label: PROJECT_NAVIGATION_LABELS.baseline, href: '/projects/:id/planning/baseline', permission: 'view:task' },
      { key: 'planning-monthly', label: PROJECT_NAVIGATION_LABELS.monthlyPlan, href: '/projects/:id/planning/monthly', permission: 'view:task' },
      { key: 'planning-wbs-templates', label: PROJECT_NAVIGATION_LABELS.wbsTemplates, href: '/projects/:id/planning/wbs-templates', permission: 'view:task' },
    ],
  },
  {
    key: 'task-management',
    label: PROJECT_NAVIGATION_LABELS.tasks,
    href: '/projects/:id/gantt',
    icon: GanttChart,
    permission: 'view:task',
    children: [
      { key: 'gantt', label: PROJECT_NAVIGATION_LABELS.taskList, href: '/projects/:id/gantt', permission: 'view:task' },
      { key: 'task-summary', label: PROJECT_NAVIGATION_LABELS.taskSummary, href: '/projects/:id/task-summary', permission: 'view:task' },
    ],
  },
  { key: 'risks', label: PROJECT_NAVIGATION_LABELS.risks, href: '/projects/:id/risks', icon: AlertTriangle, permission: 'view:risk' },
  { key: 'reports', label: PROJECT_NAVIGATION_LABELS.reports, href: '/projects/:id/reports', icon: BarChart3, permission: 'view:reports' },
  {
    key: 'special-management',
    label: PROJECT_NAVIGATION_LABELS.special,
    href: '/projects/:id/pre-milestones',
    icon: Calendar,
    permission: 'view:project',
    children: [
      { key: 'pre-milestones', label: PROJECT_NAVIGATION_LABELS.preMilestones, href: '/projects/:id/pre-milestones', permission: 'view:project' },
      { key: 'drawings', label: PROJECT_NAVIGATION_LABELS.drawings, href: '/projects/:id/drawings', permission: 'view:project' },
      { key: 'materials', label: PROJECT_NAVIGATION_LABELS.materials, href: '/projects/:id/materials', permission: 'view:project' },
      { key: 'acceptance', label: PROJECT_NAVIGATION_LABELS.acceptance, href: '/projects/:id/acceptance', permission: 'view:project' },
    ],
  },
]

const PLANNING_TARGETS: Record<string, Pick<NotificationTarget, 'key' | 'label' | 'href'>> = {
  planning: {
    key: 'planning',
    label: PROJECT_NAVIGATION_LABELS.planning,
    href: '/projects/:id/planning/baseline',
  },
  baseline: {
    key: 'planning',
    label: PROJECT_NAVIGATION_LABELS.baseline,
    href: '/projects/:id/planning/baseline',
  },
  monthly_plan: {
    key: 'planning',
    label: PROJECT_NAVIGATION_LABELS.monthlyPlan,
    href: '/projects/:id/planning/monthly',
  },
  closeout: {
    key: 'planning',
    label: PROJECT_NAVIGATION_LABELS.closeout,
    href: '/projects/:id/planning/closeout',
  },
}

function resolveHref(href: string, projectId: string) {
  return href.replace(':id', projectId)
}

function normalizeText(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(' ').toLowerCase()
}

export function getShellNavigationMeta(pathname: string): ShellNavigationMeta {
  if (pathname === '/company') {
    return { title: PROJECT_NAVIGATION_LABELS.company, contextLabel: '\u516c\u53f8\u7ea7\u603b\u89c8' }
  }

  if (pathname === '/notifications') {
    return { title: PROJECT_NAVIGATION_LABELS.notifications, contextLabel: '\u63d0\u9192\u805a\u5408' }
  }

  if (pathname.includes('/reports')) {
    return { title: PROJECT_NAVIGATION_LABELS.reports, contextLabel: '\u7edf\u4e00\u5206\u6790\u5165\u53e3' }
  }

  if (pathname.includes('/dashboard')) {
    return { title: PROJECT_NAVIGATION_LABELS.dashboard, contextLabel: '\u9879\u76ee\u603b\u89c8' }
  }

  if (pathname.includes('/task-summary')) {
    return {
      title: `${PROJECT_NAVIGATION_LABELS.tasks} / ${PROJECT_NAVIGATION_LABELS.taskSummary}`,
      contextLabel: '\u4efb\u52a1\u7ed3\u679c\u603b\u7ed3',
    }
  }

  if (pathname.includes('/responsibility')) {
    return {
      title: `${PROJECT_NAVIGATION_LABELS.tasks} / ${PROJECT_NAVIGATION_LABELS.responsibility}`,
      contextLabel: '\u8d23\u4efb\u4e3b\u4f53\u5206\u6790',
    }
  }

  if (pathname.includes('/gantt')) {
    return {
      title: `${PROJECT_NAVIGATION_LABELS.tasks} / ${PROJECT_NAVIGATION_LABELS.taskList}`,
      contextLabel: '\u4efb\u52a1\u4e3b\u5de5\u4f5c\u53f0',
    }
  }

  if (pathname.includes('/risks')) {
    return { title: PROJECT_NAVIGATION_LABELS.risks, contextLabel: '\u5f02\u5e38\u94fe\u8def\u5de5\u4f5c\u53f0' }
  }

  if (pathname.includes('/milestones')) {
    return { title: PROJECT_NAVIGATION_LABELS.milestones, contextLabel: '\u5173\u952e\u8282\u70b9' }
  }

  if (pathname.includes('/planning/wbs-templates')) {
    return {
      title: `${PROJECT_NAVIGATION_LABELS.planning} / ${PROJECT_NAVIGATION_LABELS.wbsTemplates}`,
      contextLabel: PROJECT_NAVIGATION_LABELS.planning,
    }
  }

  if (pathname.includes('/wbs-templates')) {
    return { title: PROJECT_NAVIGATION_LABELS.wbsTemplates, contextLabel: '\u7ed3\u6784\u6a21\u677f' }
  }

  if (pathname.includes('/drawings')) {
    return {
      title: `${PROJECT_NAVIGATION_LABELS.special} / ${PROJECT_NAVIGATION_LABELS.drawings}`,
      contextLabel: PROJECT_NAVIGATION_LABELS.special,
    }
  }

  if (pathname.includes('/materials')) {
    return {
      title: `${PROJECT_NAVIGATION_LABELS.special} / ${PROJECT_NAVIGATION_LABELS.materials}`,
      contextLabel: PROJECT_NAVIGATION_LABELS.special,
    }
  }

  if (pathname.includes('/acceptance')) {
    return {
      title: `${PROJECT_NAVIGATION_LABELS.special} / ${PROJECT_NAVIGATION_LABELS.acceptance}`,
      contextLabel: PROJECT_NAVIGATION_LABELS.special,
    }
  }

  if (pathname.includes('/pre-milestones')) {
    return {
      title: `${PROJECT_NAVIGATION_LABELS.special} / ${PROJECT_NAVIGATION_LABELS.preMilestones}`,
      contextLabel: PROJECT_NAVIGATION_LABELS.special,
    }
  }

  if (pathname.includes('/planning/')) {
    return { title: PROJECT_NAVIGATION_LABELS.planning, contextLabel: PROJECT_NAVIGATION_LABELS.planning }
  }

  if (pathname === '/monitoring') {
    return { title: '\u76d1\u63a7\u4e2d\u5fc3', contextLabel: '\u9690\u85cf\u5de5\u5177 / \u76d1\u63a7\u5165\u53e3' }
  }

  if (pathname.includes('/team')) {
    return { title: '\u56e2\u961f\u6210\u5458', contextLabel: '\u8f85\u52a9\u80fd\u529b / \u56e2\u961f\u6210\u5458' }
  }

  if (pathname.startsWith('/projects/')) {
    return { title: PROJECT_NAVIGATION_LABELS.projectHome, contextLabel: PROJECT_NAVIGATION_LABELS.projectHome }
  }

  return { title: '\u5de5\u7a0b\u7ba1\u7406\u7cfb\u7edf', contextLabel: '\u5168\u5c40\u89c6\u56fe' }
}

function buildTarget(key: NotificationTargetKey, label: string, href: string, projectId: string): NotificationTarget {
  return { key, label, href: resolveHref(href, projectId) }
}

function getPlanningTarget(sourceEntityType: string, projectId: string): NotificationTarget {
  const target = PLANNING_TARGETS[sourceEntityType]
  if (target) {
    return buildTarget('planning', target.label, target.href, projectId)
  }

  return buildTarget('planning', PROJECT_NAVIGATION_LABELS.planning, '/projects/:id/planning/baseline', projectId)
}

function getSpecialManagementTarget(token: string, projectId: string): NotificationTarget {
  if (token.includes('图纸')) {
    return buildTarget('special', `${PROJECT_NAVIGATION_LABELS.special} / ${PROJECT_NAVIGATION_LABELS.drawings}`, '/projects/:id/drawings', projectId)
  }

  if (token.includes('验收') || token.includes('验收时间轴')) {
    return buildTarget('special', `${PROJECT_NAVIGATION_LABELS.special} / ${PROJECT_NAVIGATION_LABELS.acceptance}`, '/projects/:id/acceptance', projectId)
  }

  return buildTarget('special', `${PROJECT_NAVIGATION_LABELS.special} / ${PROJECT_NAVIGATION_LABELS.preMilestones}`, '/projects/:id/pre-milestones', projectId)
}

export function resolveNotificationTarget(notification: NotificationLike, currentProjectId?: string): NotificationTarget {
  const projectId = notification.projectId || currentProjectId
  const token = normalizeText(notification.title, notification.content, notification.message, notification.type, notification.category)
  const sourceEntityType = notification.sourceEntityType || notification.source_entity_type

  if (!projectId) {
    return {
      key: 'project-home',
      label: PROJECT_NAVIGATION_LABELS.notifications,
      href: '/notifications',
    }
  }

  if (sourceEntityType === 'planning_governance') {
    if (notification.category === 'planning_mapping_orphan' || /(mapping|orphan|映射|孤立)/.test(token)) {
      return buildTarget(
        'planning',
        `${PROJECT_NAVIGATION_LABELS.planning} / ${PROJECT_NAVIGATION_LABELS.baseline}`,
        '/projects/:id/planning/baseline',
        projectId,
      )
    }

    if (/(关账|closeout)/.test(token)) {
      return buildTarget(
        'planning',
        `${PROJECT_NAVIGATION_LABELS.planning} / ${PROJECT_NAVIGATION_LABELS.closeout}`,
        '/projects/:id/planning/closeout',
        projectId,
      )
    }

    return buildTarget(
      'planning',
      PROJECT_NAVIGATION_LABELS.planning,
      '/projects/:id/planning/baseline',
      projectId,
    )
  }

  if (sourceEntityType && PLANNING_TARGETS[sourceEntityType]) {
    return getPlanningTarget(sourceEntityType, projectId)
  }

  if (sourceEntityType === 'drawing_version') {
    return buildTarget(
      'special',
      `${PROJECT_NAVIGATION_LABELS.special} / ${PROJECT_NAVIGATION_LABELS.drawings}`,
      '/projects/:id/drawings',
      projectId,
    )
  }

  if (sourceEntityType === 'acceptance_plan') {
    return buildTarget(
      'special',
      `${PROJECT_NAVIGATION_LABELS.special} / ${PROJECT_NAVIGATION_LABELS.acceptance}`,
      '/projects/:id/acceptance',
      projectId,
    )
  }

  if (
    sourceEntityType === 'project_material' ||
    notification.category === 'materials' ||
    /材料|到场|逾期未到/.test(token)
  ) {
    return buildTarget(
      'special',
      `${PROJECT_NAVIGATION_LABELS.special} / ${PROJECT_NAVIGATION_LABELS.materials}`,
      '/projects/:id/materials',
      projectId,
    )
  }

  if (sourceEntityType === 'task_condition') {
    return buildTarget(
      'tasks',
      `${PROJECT_NAVIGATION_LABELS.tasks} / ${PROJECT_NAVIGATION_LABELS.taskList}`,
      '/projects/:id/gantt',
      projectId,
    )
  }

  if (sourceEntityType === 'task_summary') {
    return buildTarget(
      'task-summary',
      `${PROJECT_NAVIGATION_LABELS.tasks} / ${PROJECT_NAVIGATION_LABELS.taskSummary}`,
      '/projects/:id/task-summary',
      projectId,
    )
  }

  if (sourceEntityType === 'change_log') {
    return buildTarget('reports', PROJECT_NAVIGATION_LABELS.reports, '/projects/:id/reports?view=change_log', projectId)
  }

  if (sourceEntityType === 'report') {
    return buildTarget('reports', PROJECT_NAVIGATION_LABELS.reports, '/projects/:id/reports', projectId)
  }

  if (
    sourceEntityType === 'task' ||
    notification.taskId ||
    notification.task_id ||
    /任务|wbs|条件|阻碍|延期/.test(token)
  ) {
    return buildTarget(
      'tasks',
      `${PROJECT_NAVIGATION_LABELS.tasks} / ${PROJECT_NAVIGATION_LABELS.taskList}`,
      '/projects/:id/gantt',
      projectId,
    )
  }

  if (
    sourceEntityType === 'milestone' ||
    notification.milestoneId ||
    notification.milestone_id ||
    /里程碑|节点/.test(token)
  ) {
    return buildTarget('project-home', PROJECT_NAVIGATION_LABELS.milestones, '/projects/:id/milestones', projectId)
  }

  if (/(风险|问题|预警|告警)/.test(token) || notification.severity === 'warning' || notification.severity === 'critical') {
    return buildTarget('risks', PROJECT_NAVIGATION_LABELS.risks, '/projects/:id/risks', projectId)
  }

  if (/(证照|验收|图纸|许可|施工证|备案)/.test(token)) {
    return getSpecialManagementTarget(token, projectId)
  }

  if (/(reports|报表|分析|汇总)/.test(token)) {
    return buildTarget('reports', PROJECT_NAVIGATION_LABELS.reports, '/projects/:id/reports', projectId)
  }

  if (/(任务总结|完成总结|task summary)/.test(token)) {
    return buildTarget(
      'task-summary',
      `${PROJECT_NAVIGATION_LABELS.tasks} / ${PROJECT_NAVIGATION_LABELS.taskSummary}`,
      '/projects/:id/task-summary',
      projectId,
    )
  }

  if (/(dashboard|总览|概览|驾驶舱)/.test(token)) {
    return buildTarget('dashboard', PROJECT_NAVIGATION_LABELS.dashboard, '/projects/:id/dashboard', projectId)
  }

  return buildTarget('project-home', PROJECT_NAVIGATION_LABELS.projectHome, '/projects/:id', projectId)
}
