import { create } from 'zustand'
import { Project, Task, Risk, Milestone, Invitation, ProjectMember, User, TaskCondition, TaskObstacle, TaskDelayHistory, AcceptancePlan } from '@/lib/supabase'

interface AppState {
  // 当前用户
  currentUser: User | null
  setCurrentUser: (user: Partial<User> | null) => void

  // 当前项目
  currentProject: Project | null
  setCurrentProject: (project: Project | null) => void

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
}

export const useStore = create<AppState>((set) => ({
  // 当前用户
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user as User | null }),

  // 当前项目
  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project }),

  // 项目列表
  projects: [],
  setProjects: (projects) => set({ projects }),
  addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),
  updateProject: (id, updates) => set((state) => ({
    projects: state.projects.map(p => p.id === id ? { ...p, ...updates } : p)
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

  // 邀请码
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
  connectionMode: 'websocket',
  setConnectionMode: (mode) => set({ connectionMode: mode }),
}))

// ─── 优化：添加选择器函数，避免订阅整个 store ─────────────────────────────────
// 使用方式：const tasks = useTasks() 代替 const { tasks } = useStore()

export const useCurrentUser = () => useStore(state => state.currentUser)
export const useSetCurrentUser = () => useStore(state => state.setCurrentUser)

export const useCurrentProject = () => useStore(state => state.currentProject)
export const useSetCurrentProject = () => useStore(state => state.setCurrentProject)

export const useProjects = () => useStore(state => state.projects)
export const useSetProjects = () => useStore(state => state.setProjects)
export const useAddProject = () => useStore(state => state.addProject)
export const useUpdateProject = () => useStore(state => state.updateProject)
export const useDeleteProject = () => useStore(state => state.deleteProject)

export const useTasks = () => useStore(state => state.tasks)
export const useSetTasks = () => useStore(state => state.setTasks)
export const useAddTask = () => useStore(state => state.addTask)
export const useUpdateTask = () => useStore(state => state.updateTask)
export const useDeleteTask = () => useStore(state => state.deleteTask)

export const useRisks = () => useStore(state => state.risks)
export const useSetRisks = () => useStore(state => state.setRisks)
export const useAddRisk = () => useStore(state => state.addRisk)
export const useUpdateRisk = () => useStore(state => state.updateRisk)
export const useDeleteRisk = () => useStore(state => state.deleteRisk)

export const useMilestones = () => useStore(state => state.milestones)
export const useSetMilestones = () => useStore(state => state.setMilestones)
export const useAddMilestone = () => useStore(state => state.addMilestone)
export const useUpdateMilestone = () => useStore(state => state.updateMilestone)

export const useConditions = () => useStore(state => state.conditions)
export const useSetConditions = () => useStore(state => state.setConditions)

export const useObstacles = () => useStore(state => state.obstacles)
export const useSetObstacles = () => useStore(state => state.setObstacles)

export const useAcceptancePlans = () => useStore(state => state.acceptancePlans)
export const useSetAcceptancePlans = () => useStore(state => state.setAcceptancePlans)

export const useInvitations = () => useStore(state => state.invitations)
export const useSetInvitations = () => useStore(state => state.setInvitations)

export const useMembers = () => useStore(state => state.members)
export const useSetMembers = () => useStore(state => state.setMembers)

export const useSidebarOpen = () => useStore(state => state.sidebarOpen)
export const useSetSidebarOpen = () => useStore(state => state.setSidebarOpen)

export const useConnectionMode = () => useStore(state => state.connectionMode)
export const useSetConnectionMode = () => useStore(state => state.setConnectionMode)
