export type V14231ReadinessRouteMetadata = {
  routePath: string
  componentName: string
  importPath: string
  sourcePath: string
  pageKey: string
  readinessBinding: 'page-boundary' | 'domain-data-status' | 'stable-workspace' | 'action-level-readiness'
}

export const V14231_READINESS_ROUTE_METADATA = [
  {
    routePath: '/workspace',
    componentName: 'WorkspacePage',
    importPath: '@/pages/WorkspacePage',
    sourcePath: 'src/pages/WorkspacePage.tsx',
    pageKey: 'Workspace / 待办',
    readinessBinding: 'stable-workspace',
  },
  {
    routePath: '/company',
    componentName: 'CompanyCockpit',
    importPath: '@/pages/CompanyCockpit',
    sourcePath: 'src/pages/CompanyCockpit.tsx',
    pageKey: 'CompanyCockpit',
    readinessBinding: 'page-boundary',
  },
  {
    routePath: '/admin/duration-accuracy',
    componentName: 'DurationAccuracyAdmin',
    importPath: '@/pages/DurationAccuracyAdmin',
    sourcePath: 'src/pages/DurationAccuracyAdmin.tsx',
    pageKey: 'DurationAccuracyAdmin / 工期准度后台',
    readinessBinding: 'domain-data-status',
  },
  {
    routePath: '/admin/duration-assets',
    componentName: 'DurationAssetsAdmin',
    importPath: '@/pages/DurationAssetsAdmin',
    sourcePath: 'src/pages/DurationAssetsAdmin.tsx',
    pageKey: 'DurationAssetsAdmin / \u5de5\u671f\u8d44\u4ea7\u6cbb\u7406',
    readinessBinding: 'action-level-readiness',
  },
  {
    routePath: '/admin/rule-assets/governance-workbench',
    componentName: 'RuleAssetGovernanceWorkbenchAdmin',
    importPath: '@/pages/RuleAssetGovernanceWorkbenchAdmin',
    sourcePath: 'src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx',
    pageKey: '规则资产 / 治理工作台',
    readinessBinding: 'action-level-readiness',
  },
  {
    routePath: 'dashboard',
    componentName: 'Dashboard',
    importPath: '@/pages/Dashboard',
    sourcePath: 'src/pages/Dashboard.tsx',
    pageKey: 'Dashboard 项目总览',
    readinessBinding: 'page-boundary',
  },
  {
    routePath: 'gantt',
    componentName: 'GanttView',
    importPath: '@/pages/GanttView',
    sourcePath: 'src/pages/GanttView.tsx',
    pageKey: 'Gantt / Planning',
    readinessBinding: 'page-boundary',
  },
  {
    routePath: 'reports',
    componentName: 'Reports',
    importPath: '@/pages/Reports',
    sourcePath: 'src/pages/Reports.tsx',
    pageKey: 'Reports',
    readinessBinding: 'page-boundary',
  },
  {
    routePath: 'task-summary',
    componentName: 'TaskSummary',
    importPath: '@/pages/TaskSummary',
    sourcePath: 'src/pages/TaskSummary.tsx',
    pageKey: 'TaskSummary',
    readinessBinding: 'page-boundary',
  },
] as const satisfies readonly V14231ReadinessRouteMetadata[]
