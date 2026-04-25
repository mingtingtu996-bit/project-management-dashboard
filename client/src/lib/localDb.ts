// 本地存储数据库适配器
// 替换Supabase，使用localStorage存储数据
// 类型安全版本

import { z } from 'zod'
import { safeJsonParse, safeStorageGet, safeStorageSet } from '@/lib/browserStorage'
import { generateUuid } from '@/lib/utils'

// ============================================
// 存储键定义
// ============================================
const STORAGE_KEYS = {
  users: 'pm_users',
  projects: 'pm_projects',
  tasks: 'pm_tasks',
  risks: 'pm_risks',
  milestones: 'pm_milestones',
  project_members: 'pm_project_members',
  invitations: 'pm_invitations',
}

// ============================================
// Zod Schema 定义（用于数据验证）
// ============================================

// 用户 Schema
export const UserSchema = z.object({
  id: z.string().uuid(),
  device_id: z.string(),
  display_name: z.string(),
  avatar_url: z.string().optional(),
  joined_at: z.string().datetime(),
  last_active: z.string().datetime(),
})

// 项目 Schema
export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(['active', 'archived', 'completed']).default('active'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  owner_id: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  version: z.number().optional(),
  primary_invitation_code: z.string().optional(),
  created_by: z.string().optional(),
  project_type: z.string().optional(),
  building_type: z.string().optional(),
  structure_type: z.string().optional(),
  building_count: z.number().optional(),
  above_ground_floors: z.number().optional(),
  underground_floors: z.number().optional(),
  support_method: z.string().optional(),
  total_area: z.number().optional(),
  planned_start_date: z.string().optional(),
  planned_end_date: z.string().optional(),
  actual_start_date: z.string().optional(),
  actual_end_date: z.string().optional(),
  total_investment: z.number().optional(),
  health_score: z.number().optional(),
  health_status: z.string().optional(),
})


// 任务 Schema
export const TaskSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'completed']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  progress: z.number().min(0).max(100).default(0),
  assignee: z.string().optional(),
  assignee_user_id: z.string().uuid().optional().nullable(),
  assignee_unit: z.string().optional(),
  dependencies: z.array(z.string().uuid()).default([]),
  is_milestone: z.boolean().default(false),
  milestone_level: z.number().min(1).max(3).optional(),  // 里程碑层级：1=一级(amber)/2=二级(blue)/3=三级(gray)
  milestone_order: z.number().default(0),  // 同级排序
  parent_id: z.string().uuid().optional(),  // 父任务ID（WBS树形结构）
  version: z.number().default(1),
  updated_by: z.string().uuid().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

// 风险 Schema
export const RiskSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  title: z.string(),
  description: z.string().optional(),
  level: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  status: z.enum(['identified', 'monitoring', 'mitigated', 'occurred']).default('identified'),
  probability: z.number().min(0).max(100).default(50),
  impact: z.number().min(0).max(100).default(50),
  mitigation: z.string().optional(),
  task_id: z.string().uuid().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

// 里程碑 Schema
export const MilestoneSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  title: z.string(),
  description: z.string().optional(),
  target_date: z.string(),
  status: z.enum(['pending', 'completed', 'delayed']).default('pending'),
  completed_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
})

// 项目成员 Schema
export const ProjectMemberSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  user_id: z.string().uuid(),
  invitation_code_id: z.string().uuid().optional(),
  permission_level: z.enum(['viewer', 'editor', 'owner']).default('editor'),
  joined_at: z.string().datetime(),
  last_activity: z.string().datetime(),
  is_active: z.boolean().default(true),
})

// 邀请码 Schema
export const InvitationSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  invitation_code: z.string(),
  permission_level: z.enum(['viewer', 'editor', 'owner']).default('editor'),
  created_by: z.string().uuid().optional(),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
  is_revoked: z.boolean().default(false),
  used_count: z.number().default(0),
  max_uses: z.number().optional(),
})

// ============================================
// TypeScript 类型推断
// ============================================

export type User = z.infer<typeof UserSchema>
export type Project = z.infer<typeof ProjectSchema>
export type Task = z.infer<typeof TaskSchema>
export type Risk = z.infer<typeof RiskSchema>
export type Milestone = z.infer<typeof MilestoneSchema>
export type ProjectMember = z.infer<typeof ProjectMemberSchema>
export type Invitation = z.infer<typeof InvitationSchema>

// ============================================
// 辅助函数
// ============================================

function getItems<T>(key: string): T[] {
  const data = safeStorageGet(localStorage, key)
  return safeJsonParse<T[]>(data, [], key)
}

function setItems<T>(key: string, items: T[]): void {
  safeStorageSet(localStorage, key, JSON.stringify(items))
}

// 生成UUID
export function generateId(): string {
  return generateUuid()
}

// ============================================
// 数据库操作
// ============================================

// 用户数据库
export const userDb = {
  getAll: (): User[] => {
    return getItems<User>(STORAGE_KEYS.users)
  },

  getById: (id: string): User | undefined => {
    const users = getItems<User>(STORAGE_KEYS.users)
    return users.find(u => u.id === id)
  },

  create: (user: User): User => {
    const users = getItems<User>(STORAGE_KEYS.users)
    users.push(user)
    setItems(STORAGE_KEYS.users, users)
    return user
  },

  update: (id: string, updates: Partial<User>): User | null => {
    const users = getItems<User>(STORAGE_KEYS.users)
    const index = users.findIndex(u => u.id === id)
    if (index !== -1) {
      users[index] = { ...users[index], ...updates }
      setItems(STORAGE_KEYS.users, users)
      return users[index]
    }
    return null
  },

  findByDeviceId: (deviceId: string): User | undefined => {
    const users = getItems<User>(STORAGE_KEYS.users)
    return users.find(u => u.device_id === deviceId)
  },

  delete: (id: string): void => {
    const users = getItems<User>(STORAGE_KEYS.users)
    const filtered = users.filter(u => u.id !== id)
    setItems(STORAGE_KEYS.users, filtered)
  }
}

// 项目数据库
export const projectDb = {
  getAll: (): Project[] => {
    return getItems<Project>(STORAGE_KEYS.projects)
  },

  replaceAll: (projects: Project[]): Project[] => {
    setItems(STORAGE_KEYS.projects, projects)
    return projects
  },

  getById: (id: string): Project | undefined => {
    const projects = getItems<Project>(STORAGE_KEYS.projects)
    return projects.find(p => p.id === id)
  },

  create: (project: Project): Project => {
    const projects = getItems<Project>(STORAGE_KEYS.projects)
    projects.push(project)
    setItems(STORAGE_KEYS.projects, projects)
    return project
  },

  update: (id: string, updates: Partial<Project>): Project | null => {
    const projects = getItems<Project>(STORAGE_KEYS.projects)
    const index = projects.findIndex(p => p.id === id)
    if (index !== -1) {
      projects[index] = { ...projects[index], ...updates }
      setItems(STORAGE_KEYS.projects, projects)
      return projects[index]
    }
    return null
  },

  // Upsert：存在则更新，不存在则创建（用于从后端同步时防止重复）
  upsert: (project: Project): Project => {
    const projects = getItems<Project>(STORAGE_KEYS.projects)
    const index = projects.findIndex(p => p.id === project.id)
    if (index !== -1) {
      projects[index] = { ...projects[index], ...project }
    } else {
      projects.push(project)
    }
    setItems(STORAGE_KEYS.projects, projects)
    return project
  },

  delete: (id: string): void => {
    const projects = getItems<Project>(STORAGE_KEYS.projects)
    const filtered = projects.filter(p => p.id !== id)
    setItems(STORAGE_KEYS.projects, filtered)

    // 级联删除相关数据
    const tasks = getItems<Task>(STORAGE_KEYS.tasks).filter(t => t.project_id !== id)
    setItems(STORAGE_KEYS.tasks, tasks)

    const risks = getItems<Risk>(STORAGE_KEYS.risks).filter(r => r.project_id !== id)
    setItems(STORAGE_KEYS.risks, risks)

    const milestones = getItems<Milestone>(STORAGE_KEYS.milestones).filter(m => m.project_id !== id)
    setItems(STORAGE_KEYS.milestones, milestones)

    const members = getItems<ProjectMember>(STORAGE_KEYS.project_members).filter(m => m.project_id !== id)
    setItems(STORAGE_KEYS.project_members, members)
  }
}

// 任务数据库
export const taskDb = {
  getAll: (): Task[] => {
    return getItems<Task>(STORAGE_KEYS.tasks)
  },

  getById: (id: string): Task | undefined => {
    const tasks = getItems<Task>(STORAGE_KEYS.tasks)
    return tasks.find(t => t.id === id)
  },

  getByProject: (projectId: string): Task[] => {
    const tasks = getItems<Task>(STORAGE_KEYS.tasks)
    return tasks.filter(t => t.project_id === projectId)
  },

  create: (task: Task): Task => {
    const tasks = getItems<Task>(STORAGE_KEYS.tasks)
    tasks.push(task)
    setItems(STORAGE_KEYS.tasks, tasks)
    return task
  },

  replaceByProject: (projectId: string, nextTasks: Task[]): Task[] => {
    const tasks = getItems<Task>(STORAGE_KEYS.tasks)
    const filtered = tasks.filter(t => t.project_id !== projectId)
    const merged = [...filtered, ...nextTasks]
    setItems(STORAGE_KEYS.tasks, merged)
    return nextTasks
  },

  update: (id: string, updates: Partial<Task>): Task | null => {
    const tasks = getItems<Task>(STORAGE_KEYS.tasks)
    const index = tasks.findIndex(t => t.id === id)
    if (index !== -1) {
      // 乐观锁检查
      if (updates.version !== undefined && tasks[index].version !== updates.version - 1) {
        console.warn('Version conflict detected')
        return null
      }
      tasks[index] = { ...tasks[index], ...updates, version: tasks[index].version + 1 }
      setItems(STORAGE_KEYS.tasks, tasks)
      return tasks[index]
    }
    return null
  },

  // 原子性递增版本
  incrementVersion: (id: string): Task | null => {
    const tasks = getItems<Task>(STORAGE_KEYS.tasks)
    const index = tasks.findIndex(t => t.id === id)
    if (index !== -1) {
      tasks[index].version += 1
      tasks[index].updated_at = new Date().toISOString()
      setItems(STORAGE_KEYS.tasks, tasks)
      return tasks[index]
    }
    return null
  },

  // 强制更新（忽略版本检查，用于冲突解决时保留本地版本）
  forceUpdate: (id: string, updates: Partial<Task>): Task | null => {
    const tasks = getItems<Task>(STORAGE_KEYS.tasks)
    const index = tasks.findIndex(t => t.id === id)
    if (index !== -1) {
      tasks[index] = { ...tasks[index], ...updates }
      tasks[index].updated_at = new Date().toISOString()
      setItems(STORAGE_KEYS.tasks, tasks)
      return tasks[index]
    }
    return null
  },

  delete: (id: string): void => {
    const tasks = getItems<Task>(STORAGE_KEYS.tasks)
    const filtered = tasks.filter(t => t.id !== id)
    setItems(STORAGE_KEYS.tasks, filtered)
  }
}

// 风险数据库
export const riskDb = {
  getAll: (): Risk[] => {
    return getItems<Risk>(STORAGE_KEYS.risks)
  },

  getById: (id: string): Risk | undefined => {
    const risks = getItems<Risk>(STORAGE_KEYS.risks)
    return risks.find(r => r.id === id)
  },

  getByProject: (projectId: string): Risk[] => {
    const risks = getItems<Risk>(STORAGE_KEYS.risks)
    return risks.filter(r => r.project_id === projectId)
  },

  create: (risk: Risk): Risk => {
    const risks = getItems<Risk>(STORAGE_KEYS.risks)
    risks.push(risk)
    setItems(STORAGE_KEYS.risks, risks)
    return risk
  },

  replaceByProject: (projectId: string, nextRisks: Risk[]): Risk[] => {
    const risks = getItems<Risk>(STORAGE_KEYS.risks)
    const filtered = risks.filter(r => r.project_id !== projectId)
    const merged = [...filtered, ...nextRisks]
    setItems(STORAGE_KEYS.risks, merged)
    return nextRisks
  },

  update: (id: string, updates: Partial<Risk>): Risk | null => {
    const risks = getItems<Risk>(STORAGE_KEYS.risks)
    const index = risks.findIndex(r => r.id === id)
    if (index !== -1) {
      risks[index] = { ...risks[index], ...updates }
      setItems(STORAGE_KEYS.risks, risks)
      return risks[index]
    }
    return null
  },

  delete: (id: string): void => {
    const risks = getItems<Risk>(STORAGE_KEYS.risks)
    const filtered = risks.filter(r => r.id !== id)
    setItems(STORAGE_KEYS.risks, filtered)
  },

  // 计算风险评分
  calculateScore: (risk: Risk): number => {
    return Math.round((risk.probability / 100) * (risk.impact / 100) * 100)
  }
}

// 里程碑数据库
export const milestoneDb = {
  getAll: (): Milestone[] => {
    return getItems<Milestone>(STORAGE_KEYS.milestones)
  },

  getById: (id: string): Milestone | undefined => {
    const milestones = getItems<Milestone>(STORAGE_KEYS.milestones)
    return milestones.find(m => m.id === id)
  },

  getByProject: (projectId: string): Milestone[] => {
    const milestones = getItems<Milestone>(STORAGE_KEYS.milestones)
    return milestones.filter(m => m.project_id === projectId)
  },

  create: (milestone: Milestone): Milestone => {
    const milestones = getItems<Milestone>(STORAGE_KEYS.milestones)
    milestones.push(milestone)
    setItems(STORAGE_KEYS.milestones, milestones)
    return milestone
  },

  replaceByProject: (projectId: string, nextMilestones: Milestone[]): Milestone[] => {
    const milestones = getItems<Milestone>(STORAGE_KEYS.milestones)
    const filtered = milestones.filter(m => m.project_id !== projectId)
    const merged = [...filtered, ...nextMilestones]
    setItems(STORAGE_KEYS.milestones, merged)
    return nextMilestones
  },


  update: (id: string, updates: Partial<Milestone>): Milestone | null => {
    const milestones = getItems<Milestone>(STORAGE_KEYS.milestones)
    const index = milestones.findIndex(m => m.id === id)
    if (index !== -1) {
      milestones[index] = { ...milestones[index], ...updates }
      setItems(STORAGE_KEYS.milestones, milestones)
      return milestones[index]
    }
    return null
  },

  delete: (id: string): void => {
    const milestones = getItems<Milestone>(STORAGE_KEYS.milestones)
    const filtered = milestones.filter(m => m.id !== id)
    setItems(STORAGE_KEYS.milestones, filtered)
  }
}

// 项目成员数据库
export const memberDb = {
  getAll: (): ProjectMember[] => {
    return getItems<ProjectMember>(STORAGE_KEYS.project_members)
  },

  getById: (id: string): ProjectMember | undefined => {
    const members = getItems<ProjectMember>(STORAGE_KEYS.project_members)
    return members.find(m => m.id === id)
  },

  getByProject: (projectId: string): ProjectMember[] => {
    const members = getItems<ProjectMember>(STORAGE_KEYS.project_members)
    return members.filter(m => m.project_id === projectId)
  },

  getByUser: (userId: string): ProjectMember[] => {
    const members = getItems<ProjectMember>(STORAGE_KEYS.project_members)
    return members.filter(m => m.user_id === userId)
  },

  create: (member: ProjectMember): ProjectMember => {
    const members = getItems<ProjectMember>(STORAGE_KEYS.project_members)
    members.push(member)
    setItems(STORAGE_KEYS.project_members, members)
    return member
  },

  update: (id: string, updates: Partial<ProjectMember>): ProjectMember | null => {
    const members = getItems<ProjectMember>(STORAGE_KEYS.project_members)
    const index = members.findIndex(m => m.id === id)
    if (index !== -1) {
      members[index] = { ...members[index], ...updates }
      setItems(STORAGE_KEYS.project_members, members)
      return members[index]
    }
    return null
  },

  delete: (id: string): void => {
    const members = getItems<ProjectMember>(STORAGE_KEYS.project_members)
    const filtered = members.filter(m => m.id !== id)
    setItems(STORAGE_KEYS.project_members, filtered)
  }
}

// 邀请码数据库
export const invitationDb = {
  getAll: (): Invitation[] => {
    return getItems<Invitation>(STORAGE_KEYS.invitations)
  },

  getById: (id: string): Invitation | undefined => {
    const invitations = getItems<Invitation>(STORAGE_KEYS.invitations)
    return invitations.find(i => i.id === id)
  },

  getByProject: (projectId: string): Invitation[] => {
    const invitations = getItems<Invitation>(STORAGE_KEYS.invitations)
    return invitations.filter(i => i.project_id === projectId)
  },

  getByCode: (code: string): Invitation | undefined => {
    const invitations = getItems<Invitation>(STORAGE_KEYS.invitations)
    return invitations.find(i => i.invitation_code === code && !i.is_revoked)
  },

  create: (invitation: Invitation): Invitation => {
    const invitations = getItems<Invitation>(STORAGE_KEYS.invitations)
    invitations.push(invitation)
    setItems(STORAGE_KEYS.invitations, invitations)
    return invitation
  },

  update: (id: string, updates: Partial<Invitation>): Invitation | null => {
    const invitations = getItems<Invitation>(STORAGE_KEYS.invitations)
    const index = invitations.findIndex(i => i.id === id)
    if (index !== -1) {
      invitations[index] = { ...invitations[index], ...updates }
      setItems(STORAGE_KEYS.invitations, invitations)
      return invitations[index]
    }
    return null
  },

  delete: (id: string): void => {
    const invitations = getItems<Invitation>(STORAGE_KEYS.invitations)
    const filtered = invitations.filter(i => i.id !== id)
    setItems(STORAGE_KEYS.invitations, filtered)
  }
}

// ============================================
// 导出
// ============================================
export { STORAGE_KEYS }
