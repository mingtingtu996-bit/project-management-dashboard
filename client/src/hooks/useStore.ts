import { create } from 'zustand'
import {
  Project,
  Task,
  Risk,
  Milestone,
  Invitation,
  ProjectMember,
  User,
  TaskCondition,
  TaskObstacle,
  TaskDelayHistory,
  AcceptancePlan,
  DelayRequest,
  ChangeLogRecord,
  TaskProgressSnapshot,
} from '@/lib/supabase'

export type ScopeDimensionKey = 'building' | 'specialty' | 'phase' | 'region'

export interface ScopeDimensionSection {
  key: ScopeDimensionKey
  label: string
  description?: string
  options: string[]
  selected: string[]
}

export type ScopeDraft = Record<ScopeDimensionKey, string[]>

function resolveInitialConnectionMode(): 'websocket' | 'polling' {
  if (
    typeof window !== 'undefined'
    && import.meta.env.PROD
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    && window.location.port === '4173'
  ) {
    return 'polling'
  }

  return 'websocket'
}

export interface ParticipantUnitRecord {
  id: string
  project_id?: string | null
  unit_name: string
  unit_type: string
  contact_name?: string | null
  contact_role?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  version: number
  created_at?: string
  updated_at?: string
}

export interface NotificationRecord {
  id: string
  projectId?: string
  type: string
  severity?: string
  title: string
  content: string
  isRead: boolean
  isMuted: boolean
  muteExpired?: boolean
  mutedUntil?: string
  isBroadcast?: boolean
  sourceEntityType?: string
  sourceEntityId?: string
  category?: string
  assignee?: string
  taskId?: string
  milestoneId?: string
  data?: Record<string, unknown>
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt?: string
  status?: string
}

export interface WarningRecord {
  id: string
  task_id?: string
  project_id?: string
  source_type?: string
  warning_signature?: string
  warning_type: string
  warning_level: 'info' | 'warning' | 'critical'
  title: string
  description: string
  created_at?: string
  updated_at?: string
  is_acknowledged?: boolean
  status?: string | null
  chain_id?: string | null
  first_seen_at?: string | null
  acknowledged_at?: string | null
  muted_until?: string | null
  escalated_to_risk_id?: string | null
  escalated_at?: string | null
  is_escalated?: boolean
  resolved_at?: string | null
  resolved_source?: string | null
}

export type RealtimeConnectionState =
  | 'idle'
  | 'polling'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

export interface RealtimeEventRecord {
  type: string
  channel?: string | null
  projectId?: string | null
  userId?: string | null
  entityType?: string | null
  entityId?: string | null
  ids?: string[]
  payload?: Record<string, unknown> | null
  timestamp: string
}

export interface IssueRecord {
  id: string
  title: string
  description?: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'investigating' | 'resolved' | 'closed'
  pendingManualClose?: boolean
  version?: number
  sourceType: string
  sourceLabel: string
  category?: string
  taskId?: string
  chainId?: string | null
  createdAt?: string
  source: 'issues'
}

export type ProblemRecord = TaskObstacle

export type DelayRequestRecord = DelayRequest
export type ChangeLogEntry = ChangeLogRecord
export type TaskProgressSnapshotRecord = TaskProgressSnapshot

export type SharedSliceKey =
  | 'notifications'
  | 'warnings'
  | 'issueRows'
  | 'problemRows'
  | 'delayRequests'
  | 'changeLogs'
  | 'taskProgressSnapshots'

export interface SharedSliceStatusState {
  loading: boolean
  error: string | null
}

/** Alias used by contract tests */
export type SharedSliceStatus = SharedSliceStatusState
export type SharedSliceStatusMap = Record<SharedSliceKey, SharedSliceStatus>

function createInitialSharedSliceStatus(): SharedSliceStatusMap {
  return {
    notifications: { loading: false, error: null },
    warnings: { loading: false, error: null },
    issueRows: { loading: false, error: null },
    problemRows: { loading: false, error: null },
    delayRequests: { loading: false, error: null },
    changeLogs: { loading: false, error: null },
    taskProgressSnapshots: { loading: false, error: null },
  }
}

interface AppState {
  // 当前用户
  currentUser: User | null
  setCurrentUser: (user: Partial<User> | null) => void

  // 当前项目
  currentProject: Project | null
  setCurrentProject: (project: Project | null) => void
  hydratedProjectId: string | null
  setHydratedProjectId: (projectId: string | null) => void

  // 项目列表
  projects: Project[]
  setProjects: (projects: Project[]) => void
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  deleteProject: (id: string) => void

  // 任务列表
  tasks: Task[]
  setTasks: (tasks: Task[]) => void
  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  deleteTask: (id: string) => void

  // 风险列表
  risks: Risk[]
  setRisks: (risks: Risk[]) => void
  addRisk: (risk: Risk) => void
  updateRisk: (id: string, updates: Partial<Risk>) => void
  deleteRisk: (id: string) => void

  // 里程碑列表
  milestones: Milestone[]
  setMilestones: (milestones: Milestone[]) => void
  addMilestone: (milestone: Milestone) => void
  updateMilestone: (id: string, updates: Partial<Milestone>) => void

  // 卡点管理
  conditions: TaskCondition[]
  setConditions: (conditions: TaskCondition[]) => void
  addCondition: (condition: TaskCondition) => void
  updateCondition: (id: string, updates: Partial<TaskCondition>) => void
  deleteCondition: (id: string) => void

  // 阻碍管理
  obstacles: TaskObstacle[]
  setObstacles: (obstacles: TaskObstacle[]) => void
  addObstacle: (obstacle: TaskObstacle) => void
  updateObstacle: (id: string, updates: Partial<TaskObstacle>) => void
  deleteObstacle: (id: string) => void

  // 验收计划
  acceptancePlans: AcceptancePlan[]
  setAcceptancePlans: (plans: AcceptancePlan[]) => void
  addAcceptancePlan: (plan: AcceptancePlan) => void
  updateAcceptancePlan: (id: string, updates: Partial<AcceptancePlan>) => void
  deleteAcceptancePlan: (id: string) => void
  notifications: NotificationRecord[]
  setNotifications: (notifications: NotificationRecord[]) => void
  warnings: WarningRecord[]
  setWarnings: (warnings: WarningRecord[]) => void
  issueRows: IssueRecord[]
  setIssueRows: (issueRows: IssueRecord[]) => void
  problemRows: ProblemRecord[]
  setProblemRows: (problemRows: ProblemRecord[]) => void
  delayRequests: DelayRequestRecord[]
  setDelayRequests: (delayRequests: DelayRequestRecord[]) => void
  changeLogs: ChangeLogEntry[]
  setChangeLogs: (changeLogs: ChangeLogEntry[]) => void
  taskProgressSnapshots: TaskProgressSnapshotRecord[]
  setTaskProgressSnapshots: (taskProgressSnapshots: TaskProgressSnapshotRecord[]) => void
  sharedSliceStatus: Record<SharedSliceKey, SharedSliceStatusState>
  setSharedSliceStatus: (slice: SharedSliceKey, patch: Partial<SharedSliceStatusState>) => void
  participantUnits: ParticipantUnitRecord[]
  setParticipantUnits: (units: ParticipantUnitRecord[]) => void
  scopeDimensions: ScopeDimensionSection[]
  setScopeDimensions: (sections: ScopeDimensionSection[]) => void

  // 邀请码
  invitations: Invitation[]
  setInvitations: (invitations: Invitation[]) => void
  addInvitation: (invitation: Invitation) => void
  revokeInvitation: (code: string) => void

  // 项目成员
  members: ProjectMember[]
  setMembers: (members: ProjectMember[]) => void
  addMember: (member: ProjectMember) => void

  // UI状态
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void

  // 连接模式
  connectionMode: 'websocket' | 'polling'
  setConnectionMode: (mode: 'websocket' | 'polling') => void
  realtimeConnectionState: RealtimeConnectionState
  setRealtimeConnectionState: (state: RealtimeConnectionState) => void
  lastRealtimeEvent: RealtimeEventRecord | null
  setLastRealtimeEvent: (event: RealtimeEventRecord | null) => void
}

export const useStore = create<AppState>((set) => ({
  // 当前用户
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user as User | null }),

  // 当前项目
  currentProject: null,
  hydratedProjectId: null,
  setCurrentProject: (project) => set({
    currentProject: project,
    notifications: [],
    warnings: [],
    issueRows: [],
    problemRows: [],
    delayRequests: [],
    changeLogs: [],
    taskProgressSnapshots: [],
    sharedSliceStatus: createInitialSharedSliceStatus(),
    participantUnits: [],
    scopeDimensions: [],
  }),
  setHydratedProjectId: (projectId) => set({ hydratedProjectId: projectId }),

  // 项目列表
  projects: [],
  setProjects: (projects) => set({ projects }),
  addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),
  updateProject: (id, updates) => set((state) => ({
    projects: state.projects.map(p => p.id === id ? { ...p, ...updates } : p),
    currentProject: state.currentProject?.id === id ? { ...state.currentProject, ...updates } : state.currentProject,
  })),
  deleteProject: (id) => set((state) => ({
    projects: state.projects.filter(p => p.id !== id)
  })),

  // 任务列表
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  updateTask: (id, updates) => set((state) => ({
    tasks: state.tasks.map(t => t.id === id ? { ...t, ...updates } : t)
  })),
  deleteTask: (id) => set((state) => ({
    tasks: state.tasks.filter(t => t.id !== id)
  })),

  // 风险列表
  risks: [],
  setRisks: (risks) => set({ risks }),
  addRisk: (risk) => set((state) => ({ risks: [...state.risks, risk] })),
  updateRisk: (id, updates) => set((state) => ({
    risks: state.risks.map(r => r.id === id ? { ...r, ...updates } : r)
  })),
  deleteRisk: (id) => set((state) => ({
    risks: state.risks.filter(r => r.id !== id)
  })),

  // 里程碑列表
  milestones: [],
  setMilestones: (milestones) => set({ milestones }),
  addMilestone: (milestone) => set((state) => ({ milestones: [...state.milestones, milestone] })),
  updateMilestone: (id, updates) => set((state) => ({
    milestones: state.milestones.map(m => m.id === id ? { ...m, ...updates } : m)
  })),

  // 卡点管理
  conditions: [],
  setConditions: (conditions) => set({ conditions }),
  addCondition: (condition) => set((state) => ({ conditions: [...state.conditions, condition] })),
  updateCondition: (id, updates) => set((state) => ({
    conditions: state.conditions.map(c => c.id === id ? { ...c, ...updates } : c)
  })),
  deleteCondition: (id) => set((state) => ({
    conditions: state.conditions.filter(c => c.id !== id)
  })),

  // 阻碍管理
  obstacles: [],
  setObstacles: (obstacles) => set({ obstacles }),
  addObstacle: (obstacle) => set((state) => ({ obstacles: [...state.obstacles, obstacle] })),
  updateObstacle: (id, updates) => set((state) => ({
    obstacles: state.obstacles.map(o => o.id === id ? { ...o, ...updates } : o)
  })),
  deleteObstacle: (id) => set((state) => ({
    obstacles: state.obstacles.filter(o => o.id !== id)
  })),

  // 验收计划
  acceptancePlans: [],
  setAcceptancePlans: (acceptancePlans) => set({ acceptancePlans }),
  addAcceptancePlan: (plan) => set((state) => ({ acceptancePlans: [...state.acceptancePlans, plan] })),
  updateAcceptancePlan: (id, updates) => set((state) => ({
    acceptancePlans: state.acceptancePlans.map(p => p.id === id ? { ...p, ...updates } : p)
  })),
  deleteAcceptancePlan: (id) => set((state) => ({
    acceptancePlans: state.acceptancePlans.filter(p => p.id !== id)
  })),

  // 验收计划
  notifications: [],
  setNotifications: (notifications) => set({ notifications }),
  warnings: [],
  setWarnings: (warnings) => set({ warnings }),
  issueRows: [],
  setIssueRows: (issueRows) => set({ issueRows }),
  problemRows: [],
  setProblemRows: (problemRows) => set({ problemRows }),
  delayRequests: [],
  setDelayRequests: (delayRequests) => set({ delayRequests }),
  changeLogs: [],
  setChangeLogs: (changeLogs) => set({ changeLogs }),
  taskProgressSnapshots: [],
  setTaskProgressSnapshots: (taskProgressSnapshots) => set({ taskProgressSnapshots }),
  sharedSliceStatus: createInitialSharedSliceStatus(),
  setSharedSliceStatus: (slice, patch) => set((state) => ({
    sharedSliceStatus: {
      ...state.sharedSliceStatus,
      [slice]: {
        ...state.sharedSliceStatus[slice],
        ...patch,
      },
    },
  })),

  // 邀请码
  participantUnits: [],
  setParticipantUnits: (participantUnits) => set({ participantUnits }),
  scopeDimensions: [],
  setScopeDimensions: (scopeDimensions) => set({ scopeDimensions }),
  invitations: [],
  setInvitations: (invitations) => set({ invitations }),
  addInvitation: (invitation) => set((state) => ({ invitations: [...state.invitations, invitation] })),
  revokeInvitation: (code) => set((state) => ({
    invitations: state.invitations.map(i => i.invitation_code === code ? { ...i, is_revoked: true } : i)
  })),

  // 项目成员
  members: [],
  setMembers: (members) => set({ members }),
  addMember: (member) => set((state) => ({ members: [...state.members, member] })),

  // UI状态
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // 连接模式
  connectionMode: resolveInitialConnectionMode(),
  setConnectionMode: (mode) => set({ connectionMode: mode }),
  realtimeConnectionState: 'idle',
  setRealtimeConnectionState: (realtimeConnectionState) => set({ realtimeConnectionState }),
  lastRealtimeEvent: null,
  setLastRealtimeEvent: (lastRealtimeEvent) => set({ lastRealtimeEvent }),
}))

// ─── 优化：添加选择器函数，避免订阅整个 store ─────────────────────────────────
// 使用方式：const tasks = useTasks() 代替 const { tasks } = useStore()

// ─── Project domain selectors ───────────────────────────────────────────

type ProjectScopeSnapshot = {
  project: Project
  tasks: Task[]
  risks: Risk[]
  conditions: TaskCondition[]
  obstacles: TaskObstacle[]
}

function resolveProjectId(state: AppState, projectId?: string | null): string {
  const resolvedProjectId = projectId ?? state.currentProject?.id ?? null
  if (!resolvedProjectId) {
    throw new Error('[useStore] project context is required')
  }
  return resolvedProjectId
}

function assertProjectExists(state: AppState, projectId: string): Project {
  const fromProjects = state.projects.find((project) => project.id === projectId)
  if (fromProjects) return fromProjects

  if (state.currentProject?.id === projectId) {
    return state.currentProject
  }

  throw new Error(`[useStore] project not found: ${projectId}`)
}

function resolveProjectIdIfReady(state: AppState, projectId?: string | null): string | null {
  return projectId ?? state.currentProject?.id ?? null
}

export function selectProjectById(state: AppState, projectId?: string | null): Project {
  const resolvedProjectId = resolveProjectId(state, projectId)
  return assertProjectExists(state, resolvedProjectId)
}

export function selectProjectTasks(state: AppState, projectId?: string | null): Task[] {
  const resolvedProjectId = resolveProjectId(state, projectId)
  assertProjectExists(state, resolvedProjectId)
  return state.tasks.filter((task) => task.project_id === resolvedProjectId)
}

export function selectProjectRisks(state: AppState, projectId?: string | null): Risk[] {
  const resolvedProjectId = resolveProjectId(state, projectId)
  assertProjectExists(state, resolvedProjectId)
  return state.risks.filter((risk) => risk.project_id === resolvedProjectId)
}

export function selectProjectConditions(state: AppState, projectId?: string | null): TaskCondition[] {
  const projectTasks = selectProjectTasks(state, projectId)
  const taskIds = new Set(projectTasks.map((task) => task.id).filter(Boolean))
  return state.conditions.filter((condition) => condition.task_id && taskIds.has(condition.task_id))
}

export function selectProjectObstacles(state: AppState, projectId?: string | null): TaskObstacle[] {
  const projectTasks = selectProjectTasks(state, projectId)
  const taskIds = new Set(projectTasks.map((task) => task.id).filter(Boolean))
  return state.obstacles.filter((obstacle) => obstacle.task_id && taskIds.has(obstacle.task_id))
}

export function selectProjectAcceptancePlans(state: AppState, projectId?: string | null): AcceptancePlan[] {
  const resolvedProjectId = resolveProjectId(state, projectId)
  assertProjectExists(state, resolvedProjectId)
  return state.acceptancePlans.filter((plan) => plan.project_id === resolvedProjectId)
}

export function selectParticipantUnits(state: AppState): ParticipantUnitRecord[] {
  return state.participantUnits
}

export function selectScopeDimensions(state: AppState): ScopeDimensionSection[] {
  return state.scopeDimensions
}

export function selectProjectScope(state: AppState, projectId?: string | null): ProjectScopeSnapshot {
  const resolvedProjectId = resolveProjectId(state, projectId)
  const project = assertProjectExists(state, resolvedProjectId)

  return {
    project,
    tasks: state.tasks.filter((task) => task.project_id === resolvedProjectId),
    risks: state.risks.filter((risk) => risk.project_id === resolvedProjectId),
    conditions: selectProjectConditions(state, resolvedProjectId),
    obstacles: selectProjectObstacles(state, resolvedProjectId),
  }
}

export function selectProjectTasksOrEmpty(state: AppState, projectId?: string | null): Task[] {
  const resolvedProjectId = resolveProjectIdIfReady(state, projectId)
  if (!resolvedProjectId) return []
  return state.tasks.filter((task) => task.project_id === resolvedProjectId)
}

export function selectProjectAcceptancePlansOrEmpty(state: AppState, projectId?: string | null): AcceptancePlan[] {
  const resolvedProjectId = resolveProjectIdIfReady(state, projectId)
  if (!resolvedProjectId) return []
  return state.acceptancePlans.filter((plan) => plan.project_id === resolvedProjectId)
}

export function selectProjectScopeOrEmpty(
  state: AppState,
  projectId?: string | null,
): ProjectScopeSnapshot | null {
  const resolvedProjectId = resolveProjectIdIfReady(state, projectId)
  if (!resolvedProjectId) return null

  const project =
    state.projects.find((item) => item.id === resolvedProjectId) ||
    (state.currentProject?.id === resolvedProjectId ? state.currentProject : null) ||
    ({ id: resolvedProjectId } as Project)

  return {
    project,
    tasks: state.tasks.filter((task) => task.project_id === resolvedProjectId),
    risks: state.risks.filter((risk) => risk.project_id === resolvedProjectId),
    conditions: state.conditions.filter((condition) => {
      if (!condition.task_id) return false
      return state.tasks.some((task) => task.id === condition.task_id && task.project_id === resolvedProjectId)
    }),
    obstacles: state.obstacles.filter((obstacle) => {
      if (!obstacle.task_id) return false
      return state.tasks.some((task) => task.id === obstacle.task_id && task.project_id === resolvedProjectId)
    }),
  }
}

export const useCurrentProjectId = () => useStore((state) => state.currentProject?.id ?? null)
export const useHydratedProjectId = () => useStore((state) => state.hydratedProjectId)
export const useProjectById = (projectId?: string | null) => useStore((state) => selectProjectById(state, projectId))
export const useProjectTasks = (projectId?: string | null) => useStore((state) => selectProjectTasks(state, projectId))
export const useProjectRisks = (projectId?: string | null) => useStore((state) => selectProjectRisks(state, projectId))
export const useProjectConditions = (projectId?: string | null) => useStore((state) => selectProjectConditions(state, projectId))
export const useProjectObstacles = (projectId?: string | null) => useStore((state) => selectProjectObstacles(state, projectId))
export const useProjectAcceptancePlans = (projectId?: string | null) =>
  useStore((state) => selectProjectAcceptancePlans(state, projectId))
export const useProjectScope = (projectId?: string | null) => useStore((state) => selectProjectScope(state, projectId))
export const useParticipantUnits = () => useStore((state) => selectParticipantUnits(state))
export const useScopeDimensions = () => useStore((state) => selectScopeDimensions(state))
export const useNotifications = () => useStore((state) => state.notifications)
export const useWarnings = () => useStore((state) => state.warnings)
export const useIssueRows = () => useStore((state) => state.issueRows)
export const useProblemRows = () => useStore((state) => state.problemRows)
export const useDelayRequests = () => useStore((state) => state.delayRequests)
export const useChangeLogs = () => useStore((state) => state.changeLogs)
export const useTaskProgressSnapshots = () => useStore((state) => state.taskProgressSnapshots)
export const useSharedSliceStatus = (slice?: SharedSliceKey) =>
  useStore((state) => (slice ? state.sharedSliceStatus[slice] : state.sharedSliceStatus))

// 鈹€鈹€鈹€ Shared slice selectors 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export const useCurrentUser = () => useStore((state) => state.currentUser)
export const useSetCurrentUser = () => useStore((state) => state.setCurrentUser)

export const useCurrentProject = () => useStore((state) => state.currentProject)
export const useSetCurrentProject = () => useStore((state) => state.setCurrentProject)
export const useSetHydratedProjectId = () => useStore((state) => state.setHydratedProjectId)

export const useProjects = () => useStore((state) => state.projects)
export const useSetProjects = () => useStore((state) => state.setProjects)
export const useAddProject = () => useStore((state) => state.addProject)
export const useUpdateProject = () => useStore((state) => state.updateProject)
export const useDeleteProject = () => useStore((state) => state.deleteProject)

export const useTasks = () => useStore((state) => state.tasks)
export const useSetTasks = () => useStore((state) => state.setTasks)
export const useAddTask = () => useStore((state) => state.addTask)
export const useUpdateTask = () => useStore((state) => state.updateTask)
export const useDeleteTask = () => useStore((state) => state.deleteTask)

export const useRisks = () => useStore((state) => state.risks)
export const useSetRisks = () => useStore((state) => state.setRisks)
export const useAddRisk = () => useStore((state) => state.addRisk)
export const useUpdateRisk = () => useStore((state) => state.updateRisk)
export const useDeleteRisk = () => useStore((state) => state.deleteRisk)

export const useMilestones = () => useStore((state) => state.milestones)
export const useSetMilestones = () => useStore((state) => state.setMilestones)
export const useAddMilestone = () => useStore((state) => state.addMilestone)
export const useUpdateMilestone = () => useStore((state) => state.updateMilestone)

export const useConditions = () => useStore((state) => state.conditions)
export const useSetConditions = () => useStore((state) => state.setConditions)

export const useObstacles = () => useStore((state) => state.obstacles)
export const useSetObstacles = () => useStore((state) => state.setObstacles)

export const useSetNotifications = () => useStore((state) => state.setNotifications)
export const useSetWarnings = () => useStore((state) => state.setWarnings)
export const useSetIssueRows = () => useStore((state) => state.setIssueRows)
export const useSetProblemRows = () => useStore((state) => state.setProblemRows)
export const useSetDelayRequests = () => useStore((state) => state.setDelayRequests)
export const useSetChangeLogs = () => useStore((state) => state.setChangeLogs)
export const useSetTaskProgressSnapshots = () => useStore((state) => state.setTaskProgressSnapshots)
export const useSetSharedSliceStatus = () => useStore((state) => state.setSharedSliceStatus)

export const useAcceptancePlans = () => useStore((state) => state.acceptancePlans)
export const useSetAcceptancePlans = () => useStore((state) => state.setAcceptancePlans)

export const useInvitations = () => useStore((state) => state.invitations)
export const useSetInvitations = () => useStore((state) => state.setInvitations)

export const useMembers = () => useStore((state) => state.members)
export const useSetMembers = () => useStore((state) => state.setMembers)

export const useSidebarOpen = () => useStore((state) => state.sidebarOpen)
export const useSetSidebarOpen = () => useStore((state) => state.setSidebarOpen)

export const useConnectionMode = () => useStore((state) => state.connectionMode)
export const useSetConnectionMode = () => useStore((state) => state.setConnectionMode)
export const useRealtimeConnectionState = () => useStore((state) => state.realtimeConnectionState)
export const useSetRealtimeConnectionState = () => useStore((state) => state.setRealtimeConnectionState)
export const useLastRealtimeEvent = () => useStore((state) => state.lastRealtimeEvent)
export const useSetLastRealtimeEvent = () => useStore((state) => state.setLastRealtimeEvent)
